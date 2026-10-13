import { useEffect, useId, useRef, useState } from "react";
type Props = {
  value: string;
  label: string;
  onSave: (value: string) => void;
  multiline?: boolean;
  required?: boolean;
  type?: "text" | "date";
  className?: string;
};
export function InlineEdit({
  value,
  label,
  onSave,
  multiline = false,
  required = false,
  type = "text",
  className = "",
}: Props) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState("");
  const focused = useRef(false);
  const canceled = useRef(false);
  const committed = useRef(value);
  const errorId = useId();
  useEffect(() => {
    if (!focused.current) {
      setDraft(value);
      committed.current = value;
    }
  }, [value]);
  function commit() {
    if (canceled.current) return true;
    const next = draft.trim();
    if (required && !next) {
      setError("내용을 입력해주세요.");
      return false;
    }
    setError("");
    setDraft(next);
    if (next !== committed.current) {
      committed.current = next;
      onSave(next);
    }
    return true;
  }
  const props = {
    value: draft,
    "aria-label": label,
    "aria-invalid": !!error,
    "aria-describedby": error ? errorId : undefined,
    placeholder: "입력하기",
    maxLength: multiline ? 2000 : 160,
    onFocus: () => {
      focused.current = true;
      canceled.current = false;
      committed.current = value;
    },
    onChange: (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      setDraft(e.target.value);
      setError("");
    },
    onBlur: () => {
      focused.current = false;
      commit();
    },
    onKeyDown: (
      e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      if (e.nativeEvent.isComposing) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        canceled.current = true;
        setDraft(committed.current);
        setError("");
        e.currentTarget.blur();
      }
      if (e.key === "Enter" && (!multiline || e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (commit()) e.currentTarget.blur();
      }
    },
  };
  return (
    <span
      className={`inline-field inline-value ${multiline ? "multiline" : ""} ${className}`}
    >
      <span className="inline-size" aria-hidden="true">
        {(draft || "입력하기") + (multiline ? "\n" : "")}
      </span>
      {multiline ? (
        <textarea {...props} rows={1} />
      ) : (
        <input {...props} type={type} />
      )}
      {error && (
        <small id={errorId} role="alert">
          {error}
        </small>
      )}
    </span>
  );
}

