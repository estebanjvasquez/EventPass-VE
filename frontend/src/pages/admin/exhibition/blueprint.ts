import DxfParser from "dxf-parser";

type DxfEntity = { type?: string; vertices?: { x?: number; y?: number }[]; start?: { x?: number; y?: number }; end?: { x?: number; y?: number }; center?: { x?: number; y?: number }; radius?: number; startAngle?: number; endAngle?: number };

const worker = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString();

export async function renderBlueprint(file: File | ArrayBuffer, mime: string): Promise<string> {
  const buffer = file instanceof File ? await file.arrayBuffer() : file;
  if (mime.includes("pdf") || (file instanceof File && file.name.toLowerCase().endsWith(".pdf"))) return renderPdf(buffer);
  if (mime.includes("dxf") || (file instanceof File && file.name.toLowerCase().endsWith(".dxf"))) return renderDxf(new TextDecoder().decode(buffer));
  return URL.createObjectURL(new Blob([buffer], { type: mime || "image/*" }));
}

async function renderPdf(buffer: ArrayBuffer): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjsLib.GlobalWorkerOptions.workerSrc = worker;
  const document = await pdfjsLib.getDocument({ data: buffer }).promise;
  const page = await document.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const canvas = window.document.createElement("canvas");
  canvas.width = viewport.width; canvas.height = viewport.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No se pudo preparar el lienzo del PDF.");
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  return canvas.toDataURL("image/png");
}

function renderDxf(content: string): string {
  const parsed = new DxfParser().parseSync(content) as { entities?: DxfEntity[] };
  const lines: string[] = []; const points: [number, number][] = [];
  const addPoint = (x?: number, y?: number) => { if (Number.isFinite(x) && Number.isFinite(y)) points.push([Number(x), Number(y)]); };
  for (const entity of parsed.entities ?? []) {
    if (entity.type === "LINE") { addPoint(entity.start?.x, entity.start?.y); addPoint(entity.end?.x, entity.end?.y); if (entity.start && entity.end) lines.push(`<line x1="${entity.start.x}" y1="${-Number(entity.start.y)}" x2="${entity.end.x}" y2="${-Number(entity.end.y)}"/>`); }
    else if (entity.type === "LWPOLYLINE" || entity.type === "POLYLINE") { const vertices = entity.vertices ?? []; vertices.forEach((point) => addPoint(point.x, point.y)); if (vertices.length > 1) lines.push(`<polyline points="${vertices.map((point) => `${point.x},${-Number(point.y)}`).join(" ")}"/>`); }
    else if (entity.type === "CIRCLE" && entity.center && entity.radius) { addPoint(entity.center.x, entity.center.y); lines.push(`<circle cx="${entity.center.x}" cy="${-Number(entity.center.y)}" r="${entity.radius}"/>`); }
  }
  if (!points.length) throw new Error("El DXF no contiene entidades 2D compatibles.");
  const xs = points.map((point) => point[0]); const ys = points.map((point) => point[1]); const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys); const width = Math.max(1, maxX - minX); const height = Math.max(1, maxY - minY);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${-maxY} ${width} ${height}"><g fill="none" stroke="#334155" stroke-width="${Math.max(width, height) / 800}">${lines.join("")}</g></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
