import { Photo } from "./Photo";
import { resourceFile } from "./resources";
import React, { useEffect, useRef, useState } from "react";
import { listResources } from "./resources";
import { readFile } from "./files";
import { Icon } from "./Icon";

export function ResourceImagePicker({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (src: string, width: number, height: number) => void;
}) {
  const [rows, setRows] = useState<any[]>([]),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    search = useRef<HTMLInputElement>(null),
    trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    trigger.current = document.activeElement as HTMLElement;
    dialog.current?.showModal();
    search.current?.focus();
    let active = true;
    listResources()
      .then((data) => {
        if (active)
          setRows(
            data.filter(
              (r: any) =>
                !r.deleted &&
                r.fileId &&
                (r.kind === "image" || r.mime?.startsWith("image/")),
            ),
          );
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      trigger.current?.focus();
    };
  }, []);
  async function insert(row: any) {
    setBusy(true);
    setError("");
    try {
      const blob = await readFile(row.fileId);
      if (blob.size > 10 * 1024 * 1024)
        throw Error("10MB 이하의 이미지를 선택하세요.");
      const src = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(Error("이미지를 읽지 못했습니다."));
        reader.readAsDataURL(blob);
      });
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () =>
          reject(Error("지원하지 않거나 손상된 이미지입니다."));
        image.src = src;
      });
      // Normalize browser-supported images to a DOCX/PDF-compatible format.
      let content = src;
      if (!/^data:image\/(png|jpeg);/i.test(src)) {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw Error("이미지를 변환하지 못했습니다.");
        ctx.drawImage(image, 0, 0);
        content = canvas.toDataURL("image/png");
      }
      onSelect(content, image.naturalWidth, image.naturalHeight);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const matches = rows.filter((r) =>
    (r.title + " " + (r.filename || "") + " " + (r.tags || []).join(" "))
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <dialog
      ref={dialog}
      className="document-image-picker"
      aria-label="자료에서 이미지 선택"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <h2>자료에서 이미지 추가</h2>
        <button
          className="keep-label"
          title="닫기"
          aria-label="이미지 선택 닫기"
          disabled={busy}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </header>
      <input
        ref={search}
        type="search"
        aria-label="자료 이미지 검색"
        placeholder="이미지 이름이나 태그 검색"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p role="status">이미지를 불러오는 중…</p>
      ) : (
        <>
          <p role="status">
            {busy ? "이미지를 추가하는 중…" : `${matches.length}개 이미지`}
          </p>
          <div className="document-image-grid">
            {matches.slice(0, 60).map((row) => (
              <button
                className="keep-label"
                key={row.id}
                disabled={busy}
                onClick={() => insert(row)}
                title={row.title}
                aria-label={row.title}
              >
                <Photo file={resourceFile(row)} />
                <span>{row.title}</span>
              </button>
            ))}
          </div>
          {!matches.length && (
            <p>자료에 이미지를 추가하면 여기에서 선택할 수 있습니다.</p>
          )}
          {matches.length > 60 && (
            <p>
              검색하여 원하는 이미지를 찾아주세요. 최대 60개까지 표시합니다.
            </p>
          )}
        </>
      )}
    </dialog>
  );
}
