import React, { useState } from "react";
import { Icon } from "./Icon";
export const editorColors = [
  ["빨강", "#ef4444"],
  ["주황", "#f97316"],
  ["노랑", "#facc15"],
  ["초록", "#22c55e"],
  ["파랑", "#3b82f6"],
  ["남색", "#312e81"],
  ["보라", "#a855f7"],
  ["갈색", "#92400e"],
  ["검정", "#000000"],
  ["흰색", "#ffffff"],
];
export function ColorControl({
  label,
  value,
  onChange,
  onClear,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  disabled?: boolean;
}) {
  return (
    <details className="editor-color-control editor-preset-color">
      <summary
        title={label + " 색 선택"}
        aria-label={label + " 색 선택"}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          if (disabled) e.preventDefault();
        }}
        aria-disabled={disabled}
      >
        <span>{label}</span>
        <span className="editor-color-current" style={{ background: value }} />
        <Icon name="plus" />
      </summary>
      <div
        className="editor-color-palette"
        role="group"
        aria-label={label + " 프리셋"}
      >
        {editorColors.map(([name, color]) => (
          <button
            type="button"
            key={color}
            className="keep-label"
            title={name}
            aria-label={label + " " + name}
            aria-pressed={value.toLowerCase() === color}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              onChange(color);
              e.currentTarget.closest("details")?.removeAttribute("open");
            }}
          >
            <span style={{ background: color }} />
            {name}
          </button>
        ))}
        {onClear && (
          <button
            type="button"
            className="color-clear keep-label"
            aria-label={label + " 지우기"}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              onClear();
              e.currentTarget.closest("details")?.removeAttribute("open");
            }}
          >
            지우기
          </button>
        )}
      </div>
    </details>
  );
}
export function TablePicker({
  onInsert,
}: {
  onInsert: (rows: number, cols: number) => void;
}) {
  const [size, setSize] = useState([3, 3]);
  return (
    <details className="document-menu insert-table">
      <summary aria-label="표 삽입" title="표 삽입">
        <Icon name="table" />
      </summary>
      <div role="menu" className="table-size-menu">
        <strong>
          {size[1]} × {size[0]} 표
        </strong>
        <div className="table-size-grid" onMouseLeave={() => {}}>
          {Array.from({ length: 80 }, (_, i) => {
            const row = Math.floor(i / 10) + 1,
              col = (i % 10) + 1;
            return (
              <button
                key={i}
                className={row <= size[0] && col <= size[1] ? "selected" : ""}
                aria-label={`${row}행 ${col}열 표 삽입`}
                onMouseEnter={() => setSize([row, col])}
                onFocus={() => setSize([row, col])}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  onInsert(row, col);
                  e.currentTarget.closest("details")?.removeAttribute("open");
                }}
              />
            );
          })}
        </div>
      </div>
    </details>
  );
}
export function shapeImage(kind: string, color = "#dceaff") {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 200;
  const c = canvas.getContext("2d")!;
  c.fillStyle = color;
  c.strokeStyle = "#3478f6";
  c.lineWidth = 3;
  c.beginPath();
  if (kind === "ellipse") c.ellipse(160, 100, 155, 95, 0, 0, Math.PI * 2);
  else if (kind === "triangle") {
    c.moveTo(160, 5);
    c.lineTo(315, 195);
    c.lineTo(5, 195);
    c.closePath();
  } else if (kind === "arrow") {
    c.moveTo(5, 65);
    c.lineTo(220, 65);
    c.lineTo(220, 5);
    c.lineTo(315, 100);
    c.lineTo(220, 195);
    c.lineTo(220, 135);
    c.lineTo(5, 135);
    c.closePath();
  } else c.rect(5, 5, 310, 190);
  c.fill();
  c.stroke();
  return canvas.toDataURL("image/png");
}
