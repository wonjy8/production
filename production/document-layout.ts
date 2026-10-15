export const defaultLayout = {
  width: 210,
  height: 297,
  top: 25.4,
  right: 25.4,
  bottom: 25.4,
  left: 25.4,
};
export function documentLayout(value: any = {}) {
  return Object.fromEntries(
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
}
