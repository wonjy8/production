import React, { useState } from "react";
import { Icon } from "./Icon";
export function ColorControl({
  label,
  value,
  onChange,
  onClear,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
}) {
  const color = /^#[a-f\d]{6}$/i.test(value) ? value : "#242424";
  const [draft, setDraft] = useState("");
  return (
    <div className="editor-color-control">
      <span>{label}</span>
      <div>
        <input
          type="color"
          aria-label={label}
          value={color}
          onChange={(e) => onChange(e.target.value)}
        />
        <label>
          <input
            aria-label={label + " HEX"}
            placeholder={color.slice(1).toUpperCase()}
            value={draft}
            maxLength={7}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              const hex = "#" + draft.replace("#", "");
              if (/^#[a-f\d]{6}$/i.test(hex)) onChange(hex);
              setDraft("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
          <small>100% · 단색</small>
        </label>
        {onClear && (
          <button
            title={label + " 지우기"}
            aria-label={label + " 지우기"}
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClear}
          >
            −
          </button>
        )}
      </div>
    </div>
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
