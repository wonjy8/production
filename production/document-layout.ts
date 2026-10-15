export const defaultLayout = {
  width: 210,
  height: 297,
  top: 25.4,
  right: 25.4,
  bottom: 25.4,
  left: 25.4,
};
export function documentLayout(value: any = {}) {
  const layout = Object.fromEntries(
    Object.entries(defaultLayout).map(([key, fallback]) => {
      const n = Number(value?.[key]);
      return [
        key,
        Number.isFinite(n) &&
        n >= (["width", "height"].includes(key) ? 100 : 0) &&
        n <= (["width", "height"].includes(key) ? 600 : 80)
          ? n
          : fallback,
      ];
    }),
  ) as typeof defaultLayout;
  if (layout.left + layout.right > layout.width - 30) {
    const ratio = (layout.width - 30) / (layout.left + layout.right);
    layout.left *= ratio;
    layout.right *= ratio;
  }
  if (layout.top + layout.bottom > layout.height - 30) {
    const ratio = (layout.height - 30) / (layout.top + layout.bottom);
    layout.top *= ratio;
    layout.bottom *= ratio;
  }
  return layout;
}

export const pageGap = 28;
