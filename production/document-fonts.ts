export const fontURL = (name: string) => "/document-font-" + name + ".ttf";
export function installDocumentFonts() {
  const families: Record<string, string[]> = {
    Arial: ["LiberationSans", "NanumGothic"],
    Calibri: ["LiberationSans", "NanumGothic"],
    "Times New Roman": ["LiberationSerif", "NanumMyeongjo"],
    "맑은 고딕": ["NanumGothic"],
    "Noto Sans KR": ["NanumGothic"],
    바탕: ["NanumMyeongjo"],
  };
  const style = document.createElement("style");
  style.textContent = Object.entries(families)
    .flatMap(([family, fonts]) =>
      fonts.flatMap((font) =>
        ["Regular", "Bold", "Italic", "BoldItalic"]
          .filter(
            (variant) =>
              !font.startsWith("Nanum") ||
              ["Regular", "Bold"].includes(variant),
          )
          .map(
            (variant) =>
              `@font-face{font-family:"${family}";src:url("${fontURL(font + "-" + variant)}") format("truetype");font-weight:${variant.includes("Bold") ? 700 : 400};font-style:${variant.includes("Italic") ? "italic" : "normal"}${font.startsWith("Liberation") ? ";unicode-range:U+0000-024F,U+1E00-1EFF,U+2000-206F" : fonts.length > 1 ? ";unicode-range:U+0250-1DFF,U+2070-FFFF" : ""}}`,
          ),
      ),
    )
    .join("\n");
  document.head.append(style);
}
