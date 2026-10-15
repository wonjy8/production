import { useId } from "react";
import type { defaultLayout } from "./document-layout";
import { pageGap } from "./document-layout";
export const rulerGutter = 26;
const pxPerMm = 96 / 25.4;
function ticks(length: number, factor: number) {
  const step = factor >= 2 ? 1 : 5;
  return Array.from(
    { length: Math.floor(length / step) + 1 },
    (_, i) => i * step,
  );
}
// Editor chrome stays outside the editable sheet and exported document.
export function DocumentRulers({
  layout,
  scale,
  pages,
}: {
  layout: typeof defaultLayout;
  scale: number;
  pages: number;
}) {
  const id = useId(),
    factor = pxPerMm * scale,
    width = layout.width * factor,
    height = layout.height * factor;
  return (
    <>
      <div className="document-ruler-top">
        <span className="document-ruler-unit">cm</span>
        <svg
          className="document-ruler-x"
          width={width}
          height={rulerGutter}
          role="img"
          aria-label="가로 눈금자 (cm)"
        >
          <rect
            width={width}
            height={rulerGutter}
            className="ruler-paper"
            fill="#fafafa"
          />
          <rect
            width={layout.left * factor}
            height={rulerGutter}
            className="ruler-margin"
            fill="#eaeaea"
          />
          <rect
            x={(layout.width - layout.right) * factor}
            width={layout.right * factor}
            height={rulerGutter}
            className="ruler-margin"
            fill="#eaeaea"
          />
          {ticks(layout.width, factor).map((mm) => (
            <g key={mm} data-mm={mm}>
              <line
                stroke="#aaa"
                strokeWidth={1}
                x1={mm * factor}
                x2={mm * factor}
                y1={mm % 10 === 0 ? 16 : 21}
                y2={rulerGutter}
              />
              {mm % 10 === 0 && mm < layout.width - 2 && (
                <text
                  fill="#777"
                  fontSize={9}
                  fontFamily="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
                  x={mm * factor + 2}
                  y={12}
                >
                  {mm / 10}
                </text>
              )}
            </g>
          ))}
          <line
            stroke="#aaa"
            strokeWidth={1}
            className="ruler-boundary"
            x1={layout.left * factor}
            x2={layout.left * factor}
            y1={0}
            y2={rulerGutter}
          />
          <line
            stroke="#aaa"
            strokeWidth={1}
            className="ruler-boundary"
            x1={(layout.width - layout.right) * factor}
            x2={(layout.width - layout.right) * factor}
            y1={0}
            y2={rulerGutter}
          />
        </svg>
      </div>
      <svg
        className="document-ruler-y"
        width={rulerGutter}
        height={pages * height + Math.max(0, pages - 1) * pageGap * scale}
        role="img"
        aria-label="세로 눈금자 (cm)"
      >
        <defs>
          <g id={id}>
            <rect
              width={rulerGutter}
              height={height}
              className="ruler-paper"
              fill="#fafafa"
            />
            <rect
              width={rulerGutter}
              height={layout.top * factor}
              className="ruler-margin"
              fill="#eaeaea"
            />
            <rect
              y={(layout.height - layout.bottom) * factor}
              width={rulerGutter}
              height={layout.bottom * factor}
              className="ruler-margin"
              fill="#eaeaea"
            />
            {ticks(layout.height, factor).map((mm) => (
              <g key={mm} data-mm={mm}>
                <line
                  stroke="#aaa"
                  strokeWidth={1}
                  x1={mm % 10 === 0 ? 16 : 21}
                  x2={rulerGutter}
                  y1={mm * factor}
                  y2={mm * factor}
                />
                {mm % 10 === 0 && mm < layout.height - 2 && (
                  <text
                    fill="#777"
                    fontSize={9}
                    fontFamily="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
                    x={2}
                    y={mm * factor + 10}
                  >
                    {mm / 10}
                  </text>
                )}
              </g>
            ))}
            <line
              stroke="#aaa"
              strokeWidth={1}
              className="ruler-boundary"
              x1={0}
              x2={rulerGutter}
              y1={layout.top * factor}
              y2={layout.top * factor}
            />
            <line
              stroke="#aaa"
              strokeWidth={1}
              className="ruler-boundary"
              x1={0}
              x2={rulerGutter}
              y1={(layout.height - layout.bottom) * factor}
              y2={(layout.height - layout.bottom) * factor}
            />
          </g>
        </defs>
        {Array.from({ length: pages }, (_, page) => (
          <use
            key={page}
            href={"#" + id}
            y={page * (height + pageGap * scale)}
            data-ruler-page={page + 1}
          />
        ))}
      </svg>
    </>
  );
}
