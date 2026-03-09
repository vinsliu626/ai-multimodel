"use client";

function extensionOf(file: File) {
  const idx = file.name.lastIndexOf(".");
  return idx >= 0 ? file.name.slice(idx).toLowerCase() : "";
}

async function readArrayBuffer(file: File) {
  return await file.arrayBuffer();
}

async function extractPdfText(file: File) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString();
  }

  const data = await readArrayBuffer(file);
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];

  for (let index = 1; index <= pdf.numPages; index += 1) {
    const page = await pdf.getPage(index);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in (item as PdfTextItem) ? (item as PdfTextItem).str ?? "" : ""))
      .filter(Boolean)
      .join(" ");
    if (pageText.trim()) pages.push(pageText.trim());
  }

  return pages.join("\n\n");
}

async function extractDocxText(file: File) {
  const mammoth = await import("mammoth");
  const data = await readArrayBuffer(file);
  const result = await mammoth.extractRawText({ arrayBuffer: data });
  return result.value || "";
}

function slideOrder(path: string) {
  const match = path.match(/slide(\d+)\.xml$/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

async function extractPptxText(file: File) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await readArrayBuffer(file));
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => slideOrder(a) - slideOrder(b));

  if (slideNames.length === 0) {
    return "";
  }

  const parser = new DOMParser();
  const slides: string[] = [];

  for (const slideName of slideNames) {
    const xml = await zip.files[slideName].async("text");
    const doc = parser.parseFromString(xml, "application/xml");
    const texts = Array.from(doc.getElementsByTagNameNS("*", "t"))
      .map((node) => node.textContent?.trim() || "")
      .filter(Boolean);
    if (texts.length) slides.push(texts.join(" "));
  }

  return slides.join("\n\n");
}

export async function extractDocumentText(file: File) {
  const extension = extensionOf(file);

  if (extension === ".pdf") {
    return extractPdfText(file);
  }
  if (extension === ".docx") {
    return extractDocxText(file);
  }
  if (extension === ".pptx") {
    return extractPptxText(file);
  }

  throw new Error("Unsupported file type. Upload a PDF, DOCX, or PPTX document.");
}
type PdfTextItem = {
  str?: string;
};
