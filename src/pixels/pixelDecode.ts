import { SurfacePixelFormat } from "../dat/file_types/Texture.js";
export { SurfacePixelFormat } from "../dat/file_types/Texture.js";

/**
 * Pure pixel decoding for portal-DAT `Texture` files.
 *
 * This module deliberately has no Three.js and no libac class imports: its
 * input is plain data so the same code can run inline (Node, tests, generators)
 * or inside a worker later. `src/render/acTexture.ts` adapts a libac `Texture`
 * to it.
 *
 * Output is always RGBA8 with the same bytes the old `decodePixels` produced,
 * including its quirks: truncated R8G8B8/A8/CustomLscape* sources read missing
 * bytes as zero, truncated P8 texels fall back to the magenta palette colour,
 * truncated 16/32-bit and DXT sources throw, and indexed clip maps force
 * palette indices 0-7 transparent.
 */

export interface PixelDataInput {
  format: number;
  width: number;
  height: number;
  bytes: Uint8Array;
}

// Writing through a Uint32Array is the fast path, but the packed value depends
// on the host byte order. Probe once and pack accordingly; the generic path is
// still correct on big-endian hosts (just as fast, since the branch folds).
const LITTLE_ENDIAN = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
const COLOR_MASK = LITTLE_ENDIAN ? 0x00ffffff : 0xffffff00;
const ALPHA_SHIFT = LITTLE_ENDIAN ? 24 : 0;

/** Pack RGBA bytes into one host-endian Uint32Array element. */
function packRGBA(r: number, g: number, b: number, a: number): number {
  return LITTLE_ENDIAN
    ? (r | (g << 8) | (b << 16) | (a << 24)) >>> 0
    : ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
}

/** Replace the alpha byte of a packed RGBA value. */
function withAlpha(color: number, alpha: number): number {
  return ((color & COLOR_MASK) | (alpha << ALPHA_SHIFT)) >>> 0;
}

const TRANSPARENT = packRGBA(0, 0, 0, 0);

function expand5(value: number): number {
  return (value << 3) | (value >> 2);
}

function expand6(value: number): number {
  return (value << 2) | (value >> 4);
}

/** Pack the four DXT colours into host-endian RGBA words. */
function dxtColors(
  c0: number,
  c1: number,
  allowTransparent: boolean,
  out: Uint32Array,
): void {
  const r0 = expand5((c0 >>> 11) & 0x1f);
  const g0 = expand6((c0 >>> 5) & 0x3f);
  const b0 = expand5(c0 & 0x1f);
  const r1 = expand5((c1 >>> 11) & 0x1f);
  const g1 = expand6((c1 >>> 5) & 0x3f);
  const b1 = expand5(c1 & 0x1f);
  out[0] = packRGBA(r0, g0, b0, 255);
  out[1] = packRGBA(r1, g1, b1, 255);
  if (c0 > c1 || !allowTransparent) {
    out[2] = packRGBA(
      Math.floor((2 * r0 + r1) / 3),
      Math.floor((2 * g0 + g1) / 3),
      Math.floor((2 * b0 + b1) / 3),
      255,
    );
    out[3] = packRGBA(
      Math.floor((r0 + 2 * r1) / 3),
      Math.floor((g0 + 2 * g1) / 3),
      Math.floor((b0 + 2 * b1) / 3),
      255,
    );
  } else {
    out[2] = packRGBA(
      Math.floor((r0 + r1) / 2),
      Math.floor((g0 + g1) / 2),
      Math.floor((b0 + b1) / 2),
      255,
    );
    out[3] = TRANSPARENT;
  }
}

function decodeDxt(
  format: number,
  width: number,
  height: number,
  bytes: Uint8Array,
): Uint8Array<ArrayBuffer> {
  const target: Uint8Array<ArrayBuffer> = new Uint8Array(
    new ArrayBuffer(width * height * 4),
  );
  const out = new Uint32Array(target.buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const blockCols = Math.ceil(width / 4);
  const blocks = blockCols * Math.ceil(height / 4);
  const dxt1 = format === SurfacePixelFormat.Dxt1;
  const dxt3 = format === SurfacePixelFormat.Dxt3;
  const dxt5 = format === SurfacePixelFormat.Dxt5;
  const colors = new Uint32Array(4);
  const alphaPalette = new Int32Array(8);
  let offset = 0;
  for (let block = 0; block < blocks; block++) {
    let dxt3AlphaOffset = 0;
    let dxt5AlphaLo = 0;
    let dxt5AlphaHi = 0;
    if (dxt3) {
      dxt3AlphaOffset = offset;
      offset += 8;
    } else if (dxt5) {
      // The old BigInt read threw a TypeError when the 2+6 alpha bytes were
      // truncated; keep that behavior without allocating a BigInt per block.
      if (offset + 8 > bytes.length) {
        throw new TypeError("truncated DXT5 alpha block");
      }
      const alpha0 = bytes[offset++];
      const alpha1 = bytes[offset++];
      alphaPalette[0] = alpha0;
      alphaPalette[1] = alpha1;
      if (alpha0 > alpha1) {
        for (let i = 1; i <= 6; i++) {
          alphaPalette[i + 1] = Math.floor(
            ((7 - i) * alpha0 + i * alpha1) / 7,
          );
        }
      } else {
        for (let i = 1; i <= 4; i++) {
          alphaPalette[i + 1] = Math.floor(
            ((5 - i) * alpha0 + i * alpha1) / 5,
          );
        }
        alphaPalette[6] = 0;
        alphaPalette[7] = 255;
      }
      dxt5AlphaLo =
        (bytes[offset] |
          (bytes[offset + 1] << 8) |
          (bytes[offset + 2] << 16) |
          (bytes[offset + 3] << 24)) >>>
        0;
      dxt5AlphaHi = bytes[offset + 4] | (bytes[offset + 5] << 8);
      offset += 6;
    }
    const c0 = view.getUint16(offset, true);
    const c1 = view.getUint16(offset + 2, true);
    const selector = view.getUint32(offset + 4, true);
    offset += 8;
    dxtColors(c0, c1, dxt1, colors);
    const blockX = (block % blockCols) * 4;
    const blockY = Math.floor(block / blockCols) * 4;
    const maxY = Math.min(4, height - blockY);
    const maxX = Math.min(4, width - blockX);
    for (let y = 0; y < maxY; y++) {
      const row = (blockY + y) * width + blockX;
      for (let x = 0; x < maxX; x++) {
        const pixel = y * 4 + x;
        let color = colors[(selector >>> (pixel * 2)) & 3];
        if (!dxt1) {
          let alpha: number;
          if (dxt3) {
            const byte = bytes[dxt3AlphaOffset + (pixel >> 1)] ?? 0;
            alpha = ((pixel & 1 ? byte >> 4 : byte) & 0x0f) * 17;
          } else {
            const shift = pixel * 3;
            let index: number;
            if (shift === 0) index = dxt5AlphaLo & 7;
            else if (shift < 32) {
              index =
                ((dxt5AlphaLo >>> shift) |
                  (dxt5AlphaHi << (32 - shift))) &
                7;
            } else index = (dxt5AlphaHi >>> (shift - 32)) & 7;
            alpha = alphaPalette[index];
          }
          color = withAlpha(color, alpha);
        }
        out[row + x] = color;
      }
    }
  }
  return target;
}

/**
 * Decode one Texture's source bytes to RGBA8.
 *
 * `palette` is the already-resolved colour array (ARGB, same as
 * `Palette.colors`); `isClipMap` enables the indexed foliage cut-out rule.
 */
export function decodePixelData(
  input: PixelDataInput,
  palette: ArrayLike<number> | undefined,
  isClipMap = false,
): Uint8Array<ArrayBuffer> {
  const { format, width, height, bytes } = input;
  if (
    format === SurfacePixelFormat.Dxt1 ||
    format === SurfacePixelFormat.Dxt3 ||
    format === SurfacePixelFormat.Dxt5
  ) {
    return decodeDxt(format, width, height, bytes);
  }

  const pixelCount = width * height;
  const target: Uint8Array<ArrayBuffer> = new Uint8Array(
    new ArrayBuffer(pixelCount * 4),
  );
  const out = new Uint32Array(target.buffer);

  switch (format) {
    case SurfacePixelFormat.R8G8B8: {
      const full = Math.min(pixelCount, Math.floor(bytes.length / 3));
      for (let i = 0, o = 0; i < full; i++, o += 3) {
        out[i] = packRGBA(bytes[o + 2], bytes[o + 1], bytes[o], 255);
      }
      // Old behavior: missing source bytes read as zero, alpha stays 255.
      for (let i = full, o = full * 3; i < pixelCount; i++, o += 3) {
        out[i] = packRGBA(bytes[o + 2] ?? 0, bytes[o + 1] ?? 0, bytes[o] ?? 0, 255);
      }
      break;
    }
    case SurfacePixelFormat.CustomLscapeR8G8B8: {
      const full = Math.min(pixelCount, Math.floor(bytes.length / 3));
      for (let i = 0, o = 0; i < full; i++, o += 3) {
        out[i] = packRGBA(bytes[o], bytes[o + 1], bytes[o + 2], 255);
      }
      for (let i = full, o = full * 3; i < pixelCount; i++, o += 3) {
        out[i] = packRGBA(bytes[o] ?? 0, bytes[o + 1] ?? 0, bytes[o + 2] ?? 0, 255);
      }
      break;
    }
    case SurfacePixelFormat.A8R8G8B8: {
      if (bytes.length < pixelCount * 4) {
        throw new RangeError("Offset is outside the bounds of the DataView");
      }
      for (let i = 0, o = 0; i < pixelCount; i++, o += 4) {
        // Source is B8G8R8A8 little-endian; old code reordered to RGBA.
        out[i] = packRGBA(bytes[o + 2], bytes[o + 1], bytes[o], bytes[o + 3]);
      }
      break;
    }
    case SurfacePixelFormat.R5G6B5: {
      if (bytes.length < pixelCount * 2) {
        throw new RangeError("Offset is outside the bounds of the DataView");
      }
      for (let i = 0, o = 0; i < pixelCount; i++, o += 2) {
        const value = bytes[o] | (bytes[o + 1] << 8);
        out[i] = packRGBA(
          expand5((value >>> 11) & 0x1f),
          expand6((value >>> 5) & 0x3f),
          expand5(value & 0x1f),
          255,
        );
      }
      break;
    }
    case SurfacePixelFormat.A1R5G5B5: {
      if (bytes.length < pixelCount * 2) {
        throw new RangeError("Offset is outside the bounds of the DataView");
      }
      for (let i = 0, o = 0; i < pixelCount; i++, o += 2) {
        const value = bytes[o] | (bytes[o + 1] << 8);
        out[i] = packRGBA(
          expand5((value >>> 10) & 0x1f),
          expand5((value >>> 5) & 0x1f),
          expand5(value & 0x1f),
          value & 0x8000 ? 255 : 0,
        );
      }
      break;
    }
    case SurfacePixelFormat.A4R4G4B4: {
      if (bytes.length < pixelCount * 2) {
        throw new RangeError("Offset is outside the bounds of the DataView");
      }
      for (let i = 0, o = 0; i < pixelCount; i++, o += 2) {
        const value = bytes[o] | (bytes[o + 1] << 8);
        out[i] = packRGBA(
          ((value >>> 8) & 0x0f) * 17,
          ((value >>> 4) & 0x0f) * 17,
          (value & 0x0f) * 17,
          ((value >>> 12) & 0x0f) * 17,
        );
      }
      break;
    }
    case SurfacePixelFormat.P8: {
      // P8 indices are 0-255, so a 256-entry table needs no bounds check.
      const lut = buildIndexLut(palette, isClipMap, 256);
      const full = Math.min(pixelCount, bytes.length);
      for (let i = 0; i < full; i++) {
        out[i] = lut[bytes[i]];
      }
      // Old behavior: a missing P8 byte is `undefined`, which skips the
      // clip-map rule and takes the missing-palette fallback colour.
      out.fill(MISSING_COLOR, full, pixelCount);
      break;
    }
    case SurfacePixelFormat.Index16: {
      if (bytes.length < pixelCount * 2) {
        throw new RangeError("Offset is outside the bounds of the DataView");
      }
      const lut = buildIndexLut(palette, isClipMap, 0);
      const size = lut.length;
      for (let i = 0, o = 0; i < pixelCount; i++, o += 2) {
        const index = bytes[o] | (bytes[o + 1] << 8);
        out[i] = index < size ? lut[index] : MISSING_COLOR;
      }
      break;
    }
    case SurfacePixelFormat.A8:
    case SurfacePixelFormat.CustomLscapeAlpha: {
      const full = Math.min(pixelCount, bytes.length);
      for (let i = 0; i < full; i++) {
        const value = bytes[i];
        out[i] = packRGBA(value, value, value, 255);
      }
      for (let i = full; i < pixelCount; i++) {
        out[i] = packRGBA(0, 0, 0, 255);
      }
      break;
    }
    default:
      // The old switch was inside the pixel loop, so an empty texture never
      // reached it (and never threw).
      if (pixelCount > 0) {
        throw new Error(`unsupported pixel format ${format}`);
      }
  }
  return target;
}

/** Decode large, well-formed uncompressed images in row chunks for inline fallback.
 * DXT and malformed/truncated inputs retain the exact synchronous compatibility
 * path because their byte/block semantics are more subtle than row slicing. */
export async function decodePixelDataCooperative(
  input: PixelDataInput,
  palette?: ArrayLike<number>,
  isClipMap = false,
  chunkRows = 32,
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  if (signal?.aborted) throw new DOMException("Decode job aborted", "AbortError");
  const bytesPerPixel = input.format === SurfacePixelFormat.R8G8B8 || input.format === SurfacePixelFormat.CustomLscapeR8G8B8 ? 3
    : input.format === SurfacePixelFormat.A8R8G8B8 ? 4
      : input.format === SurfacePixelFormat.R5G6B5 || input.format === SurfacePixelFormat.A1R5G5B5 || input.format === SurfacePixelFormat.A4R4G4B4 || input.format === SurfacePixelFormat.Index16 ? 2
        : input.format === SurfacePixelFormat.P8 || input.format === SurfacePixelFormat.A8 || input.format === SurfacePixelFormat.CustomLscapeAlpha ? 1 : 0;
  const expectedBytes = input.width * input.height * bytesPerPixel;
  if (input.width * input.height <= 32_768 || !bytesPerPixel || input.bytes.byteLength !== expectedBytes) {
    return decodePixelData(input, palette, isClipMap);
  }
  const output = new Uint8Array(new ArrayBuffer(input.width * input.height * 4));
  const rowBytes = input.width * bytesPerPixel;
  const rowsPerChunk = Number.isFinite(chunkRows) ? Math.max(1, Math.floor(chunkRows)) : 32;
  for (let y = 0; y < input.height; y += rowsPerChunk) {
    if (signal?.aborted) throw new DOMException("Decode job aborted", "AbortError");
    const rows = Math.min(rowsPerChunk, input.height - y);
    const chunk = decodePixelData({
      ...input,
      height: rows,
      bytes: input.bytes.subarray(y * rowBytes, (y + rows) * rowBytes),
    }, palette, isClipMap);
    output.set(chunk, y * input.width * 4);
    if (y + rows < input.height) await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  return output;
}

/** Convert one palette entry (ARGB) to a packed host-endian RGBA word. */
function packArgb(color: number): number {
  return packRGBA(
    (color >>> 16) & 0xff,
    (color >>> 8) & 0xff,
    color & 0xff,
    color >>> 24,
  );
}

/** Magenta: what a palette miss (or a missing P8 byte) decodes to. */
const MISSING_COLOR = packArgb(0xffff00ff);

/**
 * Pack the palette once per decode into a lookup table indexed by palette index.
 *
 * The table length is the palette length, extended to at least `minLength` and
 * to 8 for clip maps; entries past the palette hold the magenta fallback. A clip
 * map (foliage) reserves indices 0-7 as the transparent cut-out band (ACViewer's
 * `IndexToColor`). Indices at or beyond the table length are the fallback, so
 * callers do one bounds check instead of a 65536-entry table for Index16.
 */
function buildIndexLut(
  palette: ArrayLike<number> | undefined,
  isClipMap: boolean,
  minLength: number,
): Uint32Array {
  const size = Math.max(palette?.length ?? 0, isClipMap ? 8 : 0, minLength);
  const lut = new Uint32Array(size);
  for (let i = 0; i < size; i++) {
    lut[i] =
      isClipMap && i < 8 ? TRANSPARENT : packArgb(palette?.[i] ?? 0xffff00ff);
  }
  return lut;
}
