import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  currentCustomFonts,
  refreshCustomFonts,
  addCustomFont,
  removeCustomFont,
  watchCustomFonts,
} from "./custom-fonts";
import { Icon } from "./Icon";
import { InlineRemove } from "./InlineRemove";
export function FontManager() {
  const [fonts, setFonts] = useState(currentCustomFonts()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const readonly = (window as any).appAccount?.role === "viewer";
  useEffect(() => {
    let alive = true;
    const refresh = () =>
      refreshCustomFonts()
        .then((rows) => {
          if (alive) setFonts(rows);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    refresh();
    const stop = watchCustomFonts(refresh);
    return () => {
      alive = false;
      stop();
    };
  }, []);
  return (
    <section className="font-manager" aria-label="사용자 글꼴">
      <p>
        TTF·OTF 글꼴을 추가하면 문서 편집과 PDF 내보내기에 사용할 수 있습니다.
        NAS 연결 시 같은 계정에서 불러오며, 브라우저 저장 모드에서는 현재
        브라우저에 저장합니다.
      </p>

      {!readonly && (
        <label className="font-upload keep-label">
          <Icon name="plus" />
          {busy ? "글꼴 확인 중…" : "글꼴 추가"}
          <input
            type="file"
            accept=".ttf,.otf,font/ttf,font/otf"
            aria-label="글꼴 파일 추가"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setBusy(true);
              setError("");
              try {
                await addCustomFont(file);
                setFonts(currentCustomFonts());
              } catch (e: any) {
                setError(e.message || "글꼴을 추가하지 못했습니다.");
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="font-list">
        {fonts.map((font) => (
          <div key={font.id}>
            <span>
              <strong>{font.family}</strong>
              <small>
                {font.weight === "700" ? "굵게" : "보통"}
                {font.style === "italic" ? " · 기울임" : ""}
              </small>
            </span>
            {!readonly && font.row.canEdit && (
              <InlineRemove
                triggerText="제거"
                label={font.family + " 글꼴 제거"}
                confirmationLabel="글꼴 제거 확인"
                onDelete={async () => {
                  setError("");
                  try {
                    await removeCustomFont(font);
                    setFonts(currentCustomFonts());
                  } catch (e: any) {
                    setError(e.message);
                  }
                }}
              />
            )}
          </div>
        ))}
      </div>
      {!fonts.length && <p className="font-empty">추가한 글꼴이 없습니다.</p>}
    </section>
  );
}
(window as any).mountFontSettings = (host: HTMLElement) => {
  const root = createRoot(host);
  root.render(<FontManager />);
  return () => root.unmount();
};
