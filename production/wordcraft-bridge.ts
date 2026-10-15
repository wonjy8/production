// Adapt the pinned, unmodified WordCraft release through its file-open/save UI.
// Keyboard commands target the canvas, where the upstream editor listens.
export function wordcraftBridge(
  frame: HTMLIFrameElement,
  file: File,
  options: any,
) {
  let detached = false,
    disposed = false,
    installed = false,
    loaded = false,
    awaiting = false,
    bootOpened = false,
    lastOpenRequest = 0,
    lastEdit = 0,
    settle: any,
    win: any,
    canvas: HTMLCanvasElement | null = null,
    poll: any,
    timeout: any;
  const urls = new Map<string, Blob>(),
    generations: number[] = [],
    waiters: any[] = [];
  let pdfPending: any = null;
  const pdfURLs = new Set<string>();
  let restore = () => {};
  const command = (key: string, shift = false) => {
    if (!canvas || !win) return;
    const mac = /Mac|iPhone|iPad/.test(win.navigator.platform);
    for (const type of ["keydown", "keyup"])
      canvas.dispatchEvent(
        new win.KeyboardEvent(type, {
          key,
          code: "Key" + key.toUpperCase(),
          ctrlKey: !mac,
          shiftKey: shift,
          metaKey: mac,
          bubbles: true,
          cancelable: true,
        }),
      );
    canvas.dispatchEvent(
      new win.KeyboardEvent("keyup", {
        key: mac ? "Meta" : "Control",
        code: mac ? "MetaLeft" : "ControlLeft",
        ctrlKey: false,
        metaKey: false,
        bubbles: true,
      }),
    );
  };
  function detach(name: string) {
    detached = true;
    options.onDetach?.(name);
  }
  function fail(error: any) {
    awaiting = false;
    clearTimeout(timeout);
    waiters.splice(0).forEach((w) => w.reject(error));
    options.onError?.(error);
  }
  function install() {
    if (installed || disposed) return;
    try {
      win = frame.contentWindow;
      if (!win || win.location.href === "about:blank") return;
      const doc = win.document;
      if (!doc.body) return;
      installed = true;
      const create = win.URL.createObjectURL,
        anchor = win.HTMLAnchorElement.prototype.click,
        input = win.HTMLInputElement.prototype.click,
        picker = win.showSaveFilePicker,
        revoke = win.URL.revokeObjectURL,
        frameSrc = Object.getOwnPropertyDescriptor(
          win.HTMLIFrameElement.prototype,
          "src",
        )!;
      Object.defineProperty(win.HTMLIFrameElement.prototype, "src", {
        ...frameSrc,
        set(value: string) {
          if (this.id === "wordcraft-print-frame" && pdfURLs.delete(value)) {
            this.onload = null;
            urls.delete(value);
            this.remove();
            revoke.call(win.URL, value);
            return;
          }
          frameSrc.set!.call(this, value);
        },
      });
      win.showSaveFilePicker = undefined;
      win.URL.createObjectURL = function (blob: Blob) {
        const url = create.call(this, blob);
        urls.set(url, blob);
        if (pdfPending && blob.type === "application/pdf") {
          pdfURLs.add(url);
          clearTimeout(pdfPending.timer);
          pdfPending.resolve(blob);
          win.setTimeout(() => {
            for (const type of ["keydown", "keyup"])
              canvas?.dispatchEvent(
                new win.KeyboardEvent(type, {
                  key: "Escape",
                  code: "Escape",
                  bubbles: true,
                }),
              );
          }, 0);
          pdfPending = null;
        }
        return url;
      };
      win.URL.revokeObjectURL = function (url: string) {
        urls.delete(url);
        return revoke.call(this, url);
      };
      win.HTMLInputElement.prototype.click = function () {
        if (this.type !== "file") return input.call(this);
        if (!bootOpened) {
          bootOpened = true;
          const transfer = new win.DataTransfer();
          transfer.items.add(
            new win.File([file], file.name, { type: file.type }),
          );
          this.files = transfer.files;
          this.dispatchEvent(new win.Event("change", { bubbles: true }));
          win.setTimeout(
            () =>
              Array.from(win.document.querySelectorAll("#rfd-overlay button"))
                .find((b: any) => b.textContent.trim() === "Ok")
                ?.click(),
            0,
          );
          return;
        }
        this.addEventListener(
          "change",
          () => {
            if (this.files?.length) detach(this.files[0].name);
          },
          { once: true },
        );
        return input.call(this);
      };
      win.HTMLAnchorElement.prototype.click = function () {
        const blob = urls.get(this.href),
          name = this.download || "";
        if (detached || !blob || !name.toLowerCase().endsWith(".docx"))
          return anchor.call(this);
        const matches =
          name.normalize("NFC").toLowerCase() ===
          file.name.normalize("NFC").toLowerCase();
        if (!matches) {
          if (!loaded) {
            generations.shift();
            return;
          }
          detach(name);
          return anchor.call(this);
        }
        if (!loaded) clearInterval(poll);
        urls.delete(this.href);
        const generation = generations.shift() ?? options.getGeneration();
        awaiting = false;
        clearTimeout(timeout);
        const pending = waiters.splice(0);
        Promise.resolve(options.onSnapshot(blob, name, generation, !loaded))
          .then(() => {
            if (disposed) return;
            if (!loaded) {
              loaded = true;
              clearInterval(poll);
              options.onReady?.();
            }
            pending.forEach((w) => w.resolve(true));
          })
          .catch((error) => {
            pending.forEach((w) => w.reject(error));
            options.onError?.(error);
          });
      };
      const key = (e: KeyboardEvent) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s")
          generations.push(options.getGeneration());
        if (!loaded || !e.isTrusted) return;
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n")
          detach("새 문서");
        if (
          !(
            (e.ctrlKey || e.metaKey) &&
            ["s", "o", "n", "c", "a", "f", "p"].includes(e.key.toLowerCase())
          ) &&
          ![
            "Shift",
            "Control",
            "Alt",
            "Meta",
            "Escape",
            "Tab",
            "ArrowUp",
            "ArrowDown",
            "ArrowLeft",
            "ArrowRight",
            "Home",
            "End",
            "PageUp",
            "PageDown",
          ].includes(e.key)
        ) {
          lastEdit = Date.now();
          options.onDirty?.();
        }
      };
      const inputEvent = (e: Event) => {
          if (loaded && e.isTrusted) {
            lastEdit = Date.now();
            options.onDirty?.();
          }
        },
        pointer = (e: Event) => {
          if (loaded && e.isTrusted) {
            lastEdit = Date.now();
            options.onDirty?.();
          }
        };
      const changedFile = (e: Event) => {
        const target = e.target as HTMLInputElement;
        if (loaded && target.type === "file" && target.files?.length)
          detach(target.files[0].name);
      };
      doc.addEventListener("change", changedFile, true);
      doc.addEventListener("keydown", key, true);
      doc.addEventListener("input", inputEvent, true);
      doc.addEventListener("compositionend", inputEvent, true);
      doc.addEventListener("paste", inputEvent, true);
      doc.addEventListener("cut", inputEvent, true);
      doc.addEventListener("pointerup", pointer, true);
      restore = () => {
        doc.removeEventListener("change", changedFile, true);
        doc.removeEventListener("keydown", key, true);
        doc.removeEventListener("input", inputEvent, true);
        doc.removeEventListener("compositionend", inputEvent, true);
        doc.removeEventListener("paste", inputEvent, true);
        doc.removeEventListener("cut", inputEvent, true);
        doc.removeEventListener("pointerup", pointer, true);
        win.URL.createObjectURL = create;
        win.URL.revokeObjectURL = revoke;
        win.HTMLAnchorElement.prototype.click = anchor;
        win.HTMLInputElement.prototype.click = input;
        win.showSaveFilePicker = picker;
        Object.defineProperty(win.HTMLIFrameElement.prototype, "src", frameSrc);
        urls.clear();
      };
    } catch (error) {
      fail(error);
    }
  }
  let ticks = 0;
  poll = setInterval(() => {
    if (disposed) return;
    install();
    if (!installed) return;
    canvas = win.document.querySelector("#wordcraft_canvas");
    if (!canvas || win.document.querySelector("#wordcraft_loading")) return;
    if (!bootOpened) {
      const chooser = win.document.querySelector("#rfd-input[type=file]");
      if (chooser) {
        bootOpened = true;
        const transfer = new win.DataTransfer();
        transfer.items.add(
          new win.File([file], file.name, { type: file.type }),
        );
        chooser.files = transfer.files;
        chooser.dispatchEvent(new win.Event("change", { bubbles: true }));
        const ok = Array.from(
          win.document.querySelectorAll("#rfd-overlay button"),
        ).find((b: any) => b.textContent.trim() === "Ok") as HTMLButtonElement;
        ok?.click();
      } else if (
        Date.now() - lastOpenRequest > 2000 &&
        !win.document.querySelector("#rfd-overlay:not(.hidden)")
      ) {
        lastOpenRequest = Date.now();
        canvas.focus();
        command("o");
      }
    } else if (++ticks % 3 === 0 && !loaded) command("s");
  }, 150);
  frame.addEventListener("load", install);
  return {
    pdf() {
      if (!loaded || disposed)
        return Promise.reject(Error("문서 편집기가 아직 준비되지 않았습니다."));
      if (pdfPending) return Promise.reject(Error("PDF를 만드는 중입니다."));
      return new Promise<Blob>((resolve, reject) => {
        pdfPending = {
          resolve,
          reject,
          timer: setTimeout(() => {
            pdfPending = null;
            reject(
              Error(
                "PDF 내보내기에 응답이 없습니다. 열린 메뉴를 닫고 다시 시도하세요.",
              ),
            );
          }, 30000),
        };
        canvas?.focus();
        command("p");
        // Pinned 0.6.1 File > Print action. Its page uses a fixed 200px
        // navigation rail and fixed Print button; allow the canvas to render it.
        win.setTimeout(() => {
          if (!pdfPending || disposed || !canvas) return;
          const rect = canvas.getBoundingClientRect();
          for (const type of ["pointerdown", "pointerup"])
            canvas.dispatchEvent(
              new win.PointerEvent(type, {
                pointerId: 1,
                pointerType: "mouse",
                button: 0,
                buttons: type === "pointerdown" ? 1 : 0,
                clientX: rect.left + 400,
                clientY: rect.top + 215,
                bubbles: true,
              }),
            );
        }, 350);
      });
    },
    reflow() {
      if (!loaded || disposed || !canvas) return;
      // Pinned 0.6.1 status-bar Web Layout control (a view-only action).
      const r = canvas.getBoundingClientRect(),
        x = r.right - 230,
        y = r.bottom - 13;
      for (const type of ["pointerdown", "pointerup"])
        canvas.dispatchEvent(
          new win.PointerEvent(type, {
            pointerId: 1,
            pointerType: "mouse",
            button: 0,
            buttons: type === "pointerdown" ? 1 : 0,
            clientX: x,
            clientY: y,
            bubbles: true,
          }),
        );
    },
    edit(key: string, shift = false) {
      if (!loaded || disposed) return;
      canvas?.focus();
      command(key, shift);
      lastEdit = Date.now();
      options.onDirty?.();
    },
    snapshot() {
      if (!loaded || disposed)
        return Promise.reject(Error("문서 편집기가 아직 준비되지 않았습니다."));
      return new Promise<boolean>((resolve, reject) => {
        waiters.push({ resolve, reject });
        if (!awaiting) {
          awaiting = true;
          timeout = setTimeout(
            () =>
              fail(
                Error(
                  "문서 내보내기에 응답이 없습니다. 열린 메뉴를 닫고 다시 저장하세요.",
                ),
              ),
            15000,
          );
          const send = () => {
            if (disposed) return;
            if (Date.now() - lastEdit < 300) {
              settle = setTimeout(send, 300);
              return;
            }
            win.requestAnimationFrame(() =>
              win.requestAnimationFrame(() => {
                if (!disposed) command("s");
              }),
            );
          };
          send();
        }
      });
    },
    dispose() {
      disposed = true;
      if (pdfPending) {
        clearTimeout(pdfPending.timer);
        pdfPending.reject(Error("편집기가 닫혔습니다."));
        pdfPending = null;
      }
      clearInterval(poll);
      clearTimeout(timeout);
      clearTimeout(settle);
      frame.removeEventListener("load", install);
      restore();
      waiters.splice(0).forEach((w) => w.resolve(false));
    },
  };
}
