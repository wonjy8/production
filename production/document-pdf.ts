import html2canvas from "html2canvas-pro";

/** Lossless screen capture: no print styles, reflow or font substitution. */
export async function documentPDF(sheet: HTMLElement) {
  await document.fonts.ready;
  await Promise.all(
    Array.from(sheet.querySelectorAll("img")).map(async (image) => {
      await image.decode();
      const source = new URL(image.currentSrc || image.src, location.href);
      if (
        source.protocol.startsWith("http") &&
        source.origin !== location.origin
      ) {
        const response = await fetch(source.href, { mode: "cors" });
        if (!response.ok)
          throw Error(
            "외부 이미지를 PDF에 포함할 수 없습니다. 이미지를 파일로 넣어주세요.",
          );
      }
      if (!image.naturalWidth)
        throw Error("이미지를 불러온 후 다시 내보내세요.");
    }),
  );
  const width = Math.ceil(sheet.getBoundingClientRect().width);
  const height = Math.ceil(sheet.scrollHeight);
  const scale = Math.min(2, 16384 / Math.max(width, height));
  if (width * height * scale * scale > 48000000)
    throw Error("문서가 너무 큽니다. 문서를 나누어 내보내세요.");
  const canvas = await html2canvas(sheet, {
    backgroundColor: "#ffffff",
    scale,
    width,
    height,
    logging: false,
    useCORS: true,
    onclone(doc) {
      const style = doc.createElement("style");
      style.textContent =
        ".ProseMirror{caret-color:transparent!important;outline:none!important}::selection{background:transparent}";
      doc.head.append(style);
    },
  });
  return canvasPDF(canvas, (width * 72) / 96);
}

// One continuous PDF page mirrors the continuous editor sheet without cutting rows or images.
export async function canvasPDF(
  canvas: HTMLCanvasElement,
  widthPoints: number,
) {
  const context = canvas.getContext("2d");
  if (!context) throw Error("PDF 이미지를 만들 수 없습니다.");
  const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const rgb = new Uint8Array(canvas.width * canvas.height * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4) {
    rgb[j++] = rgba[i];
    rgb[j++] = rgba[i + 1];
    rgb[j++] = rgba[i + 2];
  }
  const compressed = typeof CompressionStream !== "undefined";
  const pixels = compressed
    ? new Uint8Array(
        await new Response(
          new Blob([rgb])
            .stream()
            .pipeThrough(new CompressionStream("deflate")),
        ).arrayBuffer(),
      )
    : rgb;
  const encode = (text: string) => new TextEncoder().encode(text);
  const parts: Uint8Array[] = [encode("%PDF-1.4\n")];
  const offsets = [0];
  let length = parts[0].length;
  const append = (part: Uint8Array) => {
    parts.push(part);
    length += part.length;
  };
  const object = (id: number, body: string, stream?: Uint8Array) => {
    offsets[id] = length;
    append(encode(`${id} 0 obj\n${body}\n`));
    if (stream) {
      append(encode("stream\n"));
      append(stream);
      append(encode("\nendstream\n"));
    }
    append(encode("endobj\n"));
  };
  // PDF 1.4 has a 200-inch page limit. Scale unusually long sheets uniformly.
  const factor = Math.min(
    1,
    14400 / ((widthPoints * canvas.height) / canvas.width),
  );
  const w = widthPoints * factor,
    h = (w * canvas.height) / canvas.width;
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  object(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Screen 4 0 R >> >> /Contents 5 0 R >>`,
  );
  object(
    4,
    `<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 ${compressed ? "/Filter /FlateDecode " : ""}/Length ${pixels.length} >>`,
    pixels,
  );
  const commands = encode(`q\n${w} 0 0 ${h} 0 0 cm\n/Screen Do\nQ`);
  object(5, `<< /Length ${commands.length} >>`, commands);
  const xref = length;
  append(
    encode(
      `xref\n0 6\n0000000000 65535 f \n${offsets
        .slice(1)
        .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
        .join(
          "",
        )}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
    ),
  );
  return new Blob(parts, { type: "application/pdf" });
}
(window as any).productionDocumentPDF = documentPDF;
