import {useState} from 'react';
import {IconButton} from './Icon';
import {Modal} from './Modal';
export function SectionHeading({ module: m, onChange }: any) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="plan-section">
      <span className="plan-section-number">{m.sectionNumber || "—"}</span>
      <div>
        <h2>{m.title || "섹션 제목"}</h2>
        {m.sectionNote && <p>{m.sectionNote}</p>}
      </div>
      {(window as any).appAccount?.role !== "viewer" && (
        <IconButton
          name="edit"
          label="섹션 편집"
          onClick={() => setEditing(true)}
        />
      )}
      {editing && (
        <Modal title="섹션 편집" onClose={() => setEditing(false)}>
          <form
            className="merge-form plan-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              onChange((old: any) => ({
                ...old,
                title: String(f.get("title")).trim(),
                sectionNumber: String(f.get("number")).trim(),
                sectionNote: String(f.get("note")).trim(),
              }));
              setEditing(false);
            }}
          >
            <label>
              번호
              <input
                name="number"
                defaultValue={m.sectionNumber || ""}
                placeholder="예: 01"
                maxLength={20}
              />
            </label>
            <label>
              제목
              <input
                name="title"
                defaultValue={m.title || ""}
                required
                maxLength={200}
              />
            </label>
            <label>
              설명
              <textarea
                name="note"
                defaultValue={m.sectionNote || ""}
                placeholder="구역에 대한 설명"
              />
            </label>
            <button className="button primary keep-label">적용</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
