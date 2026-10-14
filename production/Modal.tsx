import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!trigger.current)
      trigger.current = (element?.getRootNode() as ShadowRoot)?.activeElement as HTMLElement;
    element?.showModal();
    const active = (element?.getRootNode() as ShadowRoot)?.activeElement;
    if (active?.matches('[data-control-icon="close"]'))
      element?.focus({ preventScroll: true });
    return () => {
      element?.close();
      trigger.current?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      tabIndex={-1}
      className="create-dialog editor-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="section-heading">
        <h2>{title}</h2>
        <button
          className="icon-button"
          data-control-icon="close"
          aria-label={`${title} 닫기`}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

