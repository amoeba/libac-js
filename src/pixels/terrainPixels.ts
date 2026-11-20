/** Plain RGBA input image used by the CPU terrain compositor. */
export interface TerrainPixelImage {
  data: Uint8Array;
  width: number;
  height: number;
}
export interface TerrainPixelOverlay {
  color: TerrainPixelImage;
  mask: TerrainPixelImage;
  rotation: number;
}
export interface TerrainPixelRoad {
  color: TerrainPixelImage;
  masks: { mask: TerrainPixelImage; rotation: number }[];
}

/** Map a base (u,v) through AC's inverse LandUVsRotated mask transform. */
function rotateUV(rotation: number, u: number, v: number): [number, number] {
  switch (rotation & 3) {
    case 1: return [1 - v, u];
    case 2: return [1 - u, 1 - v];
    case 3: return [v, 1 - u];
    default: return [u, v];
  }
}

/** Bilinear sample of one channel with wrap, matching RepeatWrapping. */
function sampleChannel(image: TerrainPixelImage, u: number, v: number, channel: number): number {
  const { width, height, data } = image;
  const fx = u * width - 0.5;
  const fy = v * height - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const xa = ((x0 % width) + width) % width;
  const xb = (xa + 1) % width;
  const ya = ((y0 % height) + height) % height;
  const yb = (ya + 1) % height;
  const at = (x: number, y: number): number => data[(y * width + x) * 4 + channel];
  const top = at(xa, ya) * (1 - tx) + at(xb, ya) * tx;
  const bottom = at(xa, yb) * (1 - tx) + at(xb, yb) * tx;
  return top * (1 - ty) + bottom * ty;
}

/** Bilinear RGB sample (one index computation for all three channels). */
function sampleRGB(image: TerrainPixelImage, u: number, v: number, out: Float32Array): void {
  const { width, height, data } = image;
  const fx = u * width - 0.5;
  const fy = v * height - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const xa = ((x0 % width) + width) % width;
  const xb = (xa + 1) % width;
  const ya = ((y0 % height) + height) % height;
  const yb = (ya + 1) % height;
  const w00 = (1 - tx) * (1 - ty);
  const w10 = tx * (1 - ty);
  const w01 = (1 - tx) * ty;
  const w11 = tx * ty;
  const p00 = (ya * width + xa) * 4;
  const p10 = (ya * width + xb) * 4;
  const p01 = (yb * width + xa) * 4;
  const p11 = (yb * width + xb) * 4;
  out[0] = data[p00] * w00 + data[p10] * w10 + data[p01] * w01 + data[p11] * w11;
  out[1] = data[p00 + 1] * w00 + data[p10 + 1] * w10 + data[p01 + 1] * w01 + data[p11 + 1] * w11;
  out[2] = data[p00 + 2] * w00 + data[p10 + 2] * w10 + data[p01 + 2] * w01 + data[p11 + 2] * w11;
}

function clampByte(value: number): number {
  if (!(value > 0)) return 0;
  if (value >= 255) return 255;
  return Math.round(value);
}

/** Pure equivalent of the renderer's base/overlay/road terrain bake. */
export function bakeTerrainPixels(
  base: TerrainPixelImage,
  overlays: readonly TerrainPixelOverlay[],
  road: TerrainPixelRoad | undefined,
  size: number,
  rowStart = 0,
  rowEnd = size,
  output?: Uint8Array<ArrayBuffer>,
): Uint8Array<ArrayBuffer> {
  const out = output ?? new Uint8Array(new ArrayBuffer(size * size * 4));
  const baseRGB = new Float32Array(3);
  const overlayRGB = Array.from({ length: 3 }, () => new Float32Array(3));
  const roadRGB = new Float32Array(3);
  for (let py = rowStart; py < rowEnd; py++) {
    const v = (py + 0.5) / size;
    for (let px = 0; px < size; px++) {
      const u = (px + 0.5) / size;
      sampleRGB(base, u, v, baseRGB);
      let oR = 0, oG = 0, oB = 0, oA = 0;
      if (overlays.length > 0) {
        let a0 = 1, a1 = 1, a2 = 1;
        for (let i = 0; i < overlays.length && i < 3; i++) {
          const overlay = overlays[i];
          const rgb = overlayRGB[i];
          sampleRGB(overlay.color, u, v, rgb);
          const [mu, mv] = rotateUV(overlay.rotation, u, v);
          const a = sampleChannel(overlay.mask, mu, mv, 0) / 255;
          if (i === 0) a0 = a;
          else if (i === 1) a1 = a;
          else a2 = a;
        }
        const aR = 1 - a0 * a1 * a2;
        if (aR > 1e-4) {
          const n0 = 1 - a0, n1 = 1 - a1, n2 = 1 - a2;
          const scale = 1 / aR;
          const c0 = overlayRGB[0], c1 = overlayRGB[1], c2 = overlayRGB[2];
          oR = (n0 * c0[0] + (1 - n0) * n1 * c1[0] + (1 - n1) * n2 * c2[0]) * scale;
          oG = (n0 * c0[1] + (1 - n0) * n1 * c1[1] + (1 - n1) * n2 * c2[1]) * scale;
          oB = (n0 * c0[2] + (1 - n0) * n1 * c1[2] + (1 - n1) * n2 * c2[2]) * scale;
          oA = aR;
        }
      }
      let rR = 0, rG = 0, rB = 0, rA = 0;
      if (road) {
        sampleRGB(road.color, u, v, roadRGB);
        let mask = 1;
        for (const entry of road.masks) {
          const [mu, mv] = rotateUV(entry.rotation, u, v);
          mask *= sampleChannel(entry.mask, mu, mv, 0) / 255;
        }
        rR = roadRGB[0]; rG = roadRGB[1]; rB = roadRGB[2]; rA = 1 - mask;
      }
      const invO = 1 - oA, invR = 1 - rA;
      const dst = (py * size + px) * 4;
      out[dst] = clampByte(baseRGB[0] * invO * invR + oR * oA * invR + rR * rA);
      out[dst + 1] = clampByte(baseRGB[1] * invO * invR + oG * oA * invR + rG * rA);
      out[dst + 2] = clampByte(baseRGB[2] * invO * invR + oB * oA * invR + rB * rA);
      out[dst + 3] = 255;
    }
  }
  return out;
}

/** Inline counterpart that yields between terrain row bands. */
export async function bakeTerrainPixelsCooperative(
  base: TerrainPixelImage,
  overlays: readonly TerrainPixelOverlay[],
  road: TerrainPixelRoad | undefined,
  size: number,
  chunkRows = 16,
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  const output = new Uint8Array(new ArrayBuffer(size * size * 4));
  const rowsPerChunk = Math.max(1, Math.floor(chunkRows));
  for (let y = 0; y < size; y += rowsPerChunk) {
    if (signal?.aborted) throw new DOMException("Decode job aborted", "AbortError");
    bakeTerrainPixels(base, overlays, road, size, y, Math.min(size, y + rowsPerChunk), output);
    if (y + rowsPerChunk < size) await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  return output;
}
