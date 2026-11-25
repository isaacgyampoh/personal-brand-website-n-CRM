/** Allowed upload types, verified by magic bytes (not by the browser's claim). */
export type SniffedType = { mime: string; ext: string; kind: "image" | "document" | "audio" | "video" | "archive" };

const MAX_BYTES: Record<SniffedType["kind"], number> = {
  image: 15 * 1024 * 1024,
  document: 50 * 1024 * 1024,
  audio: 100 * 1024 * 1024,
  video: 500 * 1024 * 1024,
  archive: 100 * 1024 * 1024,
};

export function maxBytesFor(kind: SniffedType["kind"]): number {
  return MAX_BYTES[kind];
}

const startsWith = (b: Uint8Array, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

export function sniffFileType(bytes: Uint8Array, filename: string): SniffedType | null {
  const lower = filename.toLowerCase();
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg", kind: "image" };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", ext: "png", kind: "image" };
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return { mime: "image/webp", ext: "webp", kind: "image" };
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") return { mime: "image/gif", ext: "gif", kind: "image" };
  if (ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12);
    if (brand === "avif" || brand === "avis") return { mime: "image/avif", ext: "avif", kind: "image" };
    if (["isom", "mp41", "mp42", "M4V ", "avc1", "dash"].includes(brand)) return { mime: "video/mp4", ext: "mp4", kind: "video" };
    if (brand === "M4A ") return { mime: "audio/mp4", ext: "m4a", kind: "audio" };
    if (brand === "qt  ") return { mime: "video/quicktime", ext: "mov", kind: "video" };
  }
  if (ascii(bytes, 0, 5) === "%PDF-") return { mime: "application/pdf", ext: "pdf", kind: "document" };
  if (ascii(bytes, 0, 3) === "ID3" || startsWith(bytes, [0xff, 0xfb]) || startsWith(bytes, [0xff, 0xf3])) {
    return { mime: "audio/mpeg", ext: "mp3", kind: "audio" };
  }
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    // ZIP container: accept only known office formats or plain zip, decided by extension.
    if (lower.endsWith(".docx")) return { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx", kind: "document" };
    if (lower.endsWith(".pptx")) return { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", ext: "pptx", kind: "document" };
    if (lower.endsWith(".xlsx")) return { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx", kind: "document" };
    if (lower.endsWith(".zip")) return { mime: "application/zip", ext: "zip", kind: "archive" };
    return null;
  }
  // SVG is intentionally rejected: it can carry script.
  return null;
}

export function safeFilename(name: string): string {
  const base = name.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-").slice(-120);
  return base || "file";
}
