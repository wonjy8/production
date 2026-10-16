import {appFeatures} from '../ui/design-system/features.js';
// Existing Wordcraft placements remain convertible; the editor is no longer a Hub module.
import { useState } from "react";
import { convertTextDocument } from "./document-launch";
export function LegacyDocumentModule({
  module,
  onChange,
}: {
  module: any;
  onChange: (fn: any) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="legacy-document-module">
      <p>{appFeatures.documentEditor?"문서 파일로 전환하여 편집할 수 있습니다.":"문서 편집기는 현재 준비 중입니다."}</p>
      <button
        className="button keep-label"
        disabled={busy||!appFeatures.documentEditor} title={!appFeatures.documentEditor?"문서 편집기 · 준비 중":undefined}
        onClick={async () => {
          setBusy(true);
          try {
            await convertTextDocument(module, onChange);
          } catch (e: any) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "문서 준비 중…" : "문서 파일로 전환하여 열기 ↗"}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
