// Parses pixel dimensions out of PNG / JPEG / WebP file headers.
// Throws on unsupported or malformed input — call sites decide whether to swallow.

export interface ImageDims {
  w: number;
  h: number;
}

export function readImageDimensions(buf: Buffer): ImageDims {
  if (isPng(buf)) return readPng(buf);
  if (isJpeg(buf)) return readJpeg(buf);
  if (isWebp(buf)) return readWebp(buf);
  throw new Error("Unsupported image format (need PNG, JPEG, or WebP)");
}

function isPng(b: Buffer): boolean {
  return (
    b.length >= 24 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  );
}

function readPng(b: Buffer): ImageDims {
  // IHDR follows the 8-byte signature + 4-byte length: width@16, height@20.
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

function isJpeg(b: Buffer): boolean {
  return b.length >= 4 && b[0] === 0xff && b[1] === 0xd8;
}

function readJpeg(b: Buffer): ImageDims {
  // Walk segments looking for an SOFn marker (0xC0..0xCF, excluding DHT/JPG/DAC).
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) throw new Error("Malformed JPEG");
    // Skip fill bytes.
    while (b[i] === 0xff && i < b.length) i++;
    const marker = b[i];
    i++;
    // SOI/EOI/RST markers have no length field.
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (i + 2 > b.length) throw new Error("Truncated JPEG");
    const segLen = b.readUInt16BE(i);
    if (isSofMarker(marker)) {
      // SOF payload: precision(1) height(2) width(2)
      return { w: b.readUInt16BE(i + 5), h: b.readUInt16BE(i + 3) };
    }
    i += segLen;
  }
  throw new Error("No SOF marker in JPEG");
}

function isSofMarker(m: number): boolean {
  if (m < 0xc0 || m > 0xcf) return false;
  return m !== 0xc4 && m !== 0xc8 && m !== 0xcc;
}

function isWebp(b: Buffer): boolean {
  return (
    b.length >= 30 &&
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  );
}

function readWebp(b: Buffer): ImageDims {
  const fourCC = b.toString("ascii", 12, 16);
  if (fourCC === "VP8 ") {
    // Width/height at offset 26/28, 14-bit little-endian, lower 14 bits of u16.
    const w = b.readUInt16LE(26) & 0x3fff;
    const h = b.readUInt16LE(28) & 0x3fff;
    return { w, h };
  }
  if (fourCC === "VP8L") {
    // 0x2F signature at byte 20, then 14 bits w-1 | 14 bits h-1 | flags.
    const b0 = b[21];
    const b1 = b[22];
    const b2 = b[23];
    const b3 = b[24];
    const w = 1 + (b0 | ((b1 & 0x3f) << 8));
    const h = 1 + ((b1 >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10));
    return { w, h };
  }
  if (fourCC === "VP8X") {
    // Canvas size: 24-bit LE width-1 at 24, height-1 at 27.
    const w = 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
    const h = 1 + (b[27] | (b[28] << 8) | (b[29] << 16));
    return { w, h };
  }
  throw new Error(`Unsupported WebP variant: ${fourCC}`);
}
