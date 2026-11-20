import assert from "node:assert/strict";
import { Palette, SurfacePixelFormat as LibacSurfacePixelFormat, Texture } from "../index.js";
import { decodePixelData, SurfacePixelFormat } from "./pixelDecode.js";

// ─── Oracle: verbatim copy of the old `decodePixels` and its helpers ───────
// Copied from src/render/acTexture.ts before the Phase 1b extraction. Do not
// "improve" this code: it defines the byte-for-byte contract the new module
// must match, quirks included.
const oldDecodePixels = (() => {
  function expand5(value: number): number {
    return (value << 3) | (value >> 2);
  }

  function expand6(value: number): number {
    return (value << 2) | (value >> 4);
  }

  function writeColor565(
    target: Uint8Array,
    offset: number,
    color: number,
  ): void {
    target[offset] = expand5((color >>> 11) & 0x1f);
    target[offset + 1] = expand6((color >>> 5) & 0x3f);
    target[offset + 2] = expand5(color & 0x1f);
  }

  function writeDxtBlock(
    target: Uint8Array,
    width: number,
    height: number,
    block: number,
    colors: Uint8Array,
    /** Per-texel alpha for DXT3/5. DXT1 carries alpha in the colour palette
     * instead: its 3-colour + transparent mode encodes fully clear texels. */
    alpha: number[] | undefined,
    selector: number,
  ): void {
    const blockX = (block % Math.ceil(width / 4)) * 4;
    const blockY = Math.floor(block / Math.ceil(width / 4)) * 4;
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const pixel = y * 4 + x;
        if (blockX + x >= width || blockY + y >= height) continue;
        const dst = ((blockY + y) * width + blockX + x) * 4;
        const source = ((selector >>> (pixel * 2)) & 3) * 4;
        target[dst] = colors[source];
        target[dst + 1] = colors[source + 1];
        target[dst + 2] = colors[source + 2];
        target[dst + 3] = alpha ? alpha[pixel] : colors[source + 3];
      }
    }
  }

  function dxtColors(
    c0: number,
    c1: number,
    allowTransparent: boolean,
  ): Uint8Array {
    const colors = new Uint8Array(16);
    writeColor565(colors, 0, c0);
    colors[3] = 255;
    writeColor565(colors, 4, c1);
    colors[7] = 255;
    if (c0 > c1 || !allowTransparent) {
      for (let channel = 0; channel < 3; channel++) {
        colors[8 + channel] = Math.floor(
          (2 * colors[channel] + colors[4 + channel]) / 3,
        );
        colors[12 + channel] = Math.floor(
          (colors[channel] + 2 * colors[4 + channel]) / 3,
        );
      }
      colors[11] = 255;
      colors[15] = 255;
    } else {
      for (let channel = 0; channel < 3; channel++) {
        colors[8 + channel] = Math.floor(
          (colors[channel] + colors[4 + channel]) / 2,
        );
      }
      colors[11] = 255;
    }
    return colors;
  }

  function decodeDxt(texture: Texture): Uint8Array<ArrayBuffer> {
    const bytes = texture.sourceData;
    const target: Uint8Array<ArrayBuffer> = new Uint8Array(
      new ArrayBuffer(texture.width * texture.height * 4),
    );
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 0;
    const blocks = Math.ceil(texture.width / 4) * Math.ceil(texture.height / 4);
    for (let block = 0; block < blocks; block++) {
      let alpha = new Array<number>(16).fill(255);
      if (texture.format === LibacSurfacePixelFormat.Dxt3) {
        alpha = Array.from({ length: 16 }, (_, pixel) => {
          const byte = bytes[offset + (pixel >> 1)];
          return ((pixel & 1 ? byte >> 4 : byte) & 0x0f) * 17;
        });
        offset += 8;
      } else if (texture.format === LibacSurfacePixelFormat.Dxt5) {
        const alpha0 = bytes[offset++];
        const alpha1 = bytes[offset++];
        let alphaBits = 0n;
        for (let i = 0; i < 6; i++)
          alphaBits |= BigInt(bytes[offset++]) << BigInt(i * 8);
        const palette = [alpha0, alpha1];
        if (alpha0 > alpha1) {
          for (let i = 1; i <= 6; i++)
            palette.push(Math.floor(((7 - i) * alpha0 + i * alpha1) / 7));
        } else {
          for (let i = 1; i <= 4; i++)
            palette.push(Math.floor(((5 - i) * alpha0 + i * alpha1) / 5));
          palette.push(0, 255);
        }
        alpha = Array.from(
          { length: 16 },
          (_, pixel) => palette[Number((alphaBits >> BigInt(pixel * 3)) & 7n)],
        );
      }
      const c0 = view.getUint16(offset, true);
      const c1 = view.getUint16(offset + 2, true);
      const selector = view.getUint32(offset + 4, true);
      offset += 8;
      const dxt1 = texture.format === LibacSurfacePixelFormat.Dxt1;
      writeDxtBlock(
        target,
        texture.width,
        texture.height,
        block,
        dxtColors(c0, c1, dxt1),
        dxt1 ? undefined : alpha,
        selector,
      );
    }
    return target;
  }

  function decodePixels(
    texture: Texture,
    palette?: Palette,
    isClipMap = false,
  ): Uint8Array<ArrayBuffer> {
    if (
      texture.format === LibacSurfacePixelFormat.Dxt1 ||
      texture.format === LibacSurfacePixelFormat.Dxt3 ||
      texture.format === LibacSurfacePixelFormat.Dxt5
    )
      return decodeDxt(texture);

    const target: Uint8Array<ArrayBuffer> = new Uint8Array(
      new ArrayBuffer(texture.width * texture.height * 4),
    );
    const source = texture.sourceData;
    const view = new DataView(
      source.buffer,
      source.byteOffset,
      source.byteLength,
    );
    for (let pixel = 0; pixel < texture.width * texture.height; pixel++) {
      const dst = pixel * 4;
      switch (texture.format) {
        case LibacSurfacePixelFormat.R8G8B8:
          target[dst] = source[pixel * 3 + 2];
          target[dst + 1] = source[pixel * 3 + 1];
          target[dst + 2] = source[pixel * 3];
          target[dst + 3] = 255;
          break;
        case LibacSurfacePixelFormat.CustomLscapeR8G8B8:
          target.set(source.subarray(pixel * 3, pixel * 3 + 3), dst);
          target[dst + 3] = 255;
          break;
        case LibacSurfacePixelFormat.A8R8G8B8: {
          const value = view.getUint32(pixel * 4, true);
          target[dst] = (value >>> 16) & 0xff;
          target[dst + 1] = (value >>> 8) & 0xff;
          target[dst + 2] = value & 0xff;
          target[dst + 3] = value >>> 24;
          break;
        }
        case LibacSurfacePixelFormat.R5G6B5: {
          writeColor565(target, dst, view.getUint16(pixel * 2, true));
          target[dst + 3] = 255;
          break;
        }
        case LibacSurfacePixelFormat.A1R5G5B5: {
          const value = view.getUint16(pixel * 2, true);
          target[dst] = expand5((value >>> 10) & 0x1f);
          target[dst + 1] = expand5((value >>> 5) & 0x1f);
          target[dst + 2] = expand5(value & 0x1f);
          target[dst + 3] = value & 0x8000 ? 255 : 0;
          break;
        }
        case LibacSurfacePixelFormat.A4R4G4B4: {
          const value = view.getUint16(pixel * 2, true);
          target[dst] = ((value >>> 8) & 0x0f) * 17;
          target[dst + 1] = ((value >>> 4) & 0x0f) * 17;
          target[dst + 2] = (value & 0x0f) * 17;
          target[dst + 3] = ((value >>> 12) & 0x0f) * 17;
          break;
        }
        case LibacSurfacePixelFormat.P8:
        case LibacSurfacePixelFormat.Index16: {
          const index =
            texture.format === LibacSurfacePixelFormat.P8
              ? source[pixel]
              : view.getUint16(pixel * 2, true);
          // A clip-map (foliage) indexed texture reserves palette indices 0-7 as
          // the transparent cut-out band. ACViewer's `IndexToColor` forces those
          // texels to fully transparent; without it the leaf card renders solid.
          if (isClipMap && index < 8) {
            target[dst] = 0;
            target[dst + 1] = 0;
            target[dst + 2] = 0;
            target[dst + 3] = 0;
            break;
          }
          const color = palette?.colors[index] ?? 0xffff00ff;
          target[dst] = (color >>> 16) & 0xff;
          target[dst + 1] = (color >>> 8) & 0xff;
          target[dst + 2] = color & 0xff;
          target[dst + 3] = color >>> 24;
          break;
        }
        case LibacSurfacePixelFormat.A8:
        case LibacSurfacePixelFormat.CustomLscapeAlpha:
          target.fill(source[pixel], dst, dst + 3);
          target[dst + 3] = 255;
          break;
        default:
          throw new Error(`unsupported pixel format ${texture.format}`);
      }
    }
    return target;
  }

  return decodePixels;
})();

// ─── helpers ───────────────────────────────────────────────────────────────

/** Small deterministic PRNG so a failure reproduces from its seed. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomBytes(rng: () => number, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) bytes[i] = Math.floor(rng() * 256);
  return bytes;
}

function randomPalette(rng: () => number, length: number): Palette {
  const palette = new Palette();
  palette.colors = Array.from(
    { length },
    () => Math.floor(rng() * 0x100000000) >>> 0,
  );
  return palette;
}

function textureFor(
  format: number,
  width: number,
  height: number,
  bytes: Uint8Array,
): Texture {
  const texture = new Texture();
  texture.format = format;
  texture.width = width;
  texture.height = height;
  texture.sourceData = bytes;
  return texture;
}

function decodeOld(
  texture: Texture,
  palette: Palette | undefined,
  isClipMap: boolean,
): Uint8Array<ArrayBuffer> {
  return oldDecodePixels(texture, palette, isClipMap);
}

function decodeNew(
  texture: Texture,
  palette: Palette | undefined,
  isClipMap: boolean,
): Uint8Array<ArrayBuffer> {
  return decodePixelData(
    {
      format: texture.format,
      width: texture.width,
      height: texture.height,
      bytes: texture.sourceData,
    },
    palette?.colors,
    isClipMap,
  );
}

function assertBytesEqual(
  actual: Uint8Array,
  expected: Uint8Array,
  message: string,
): void {
  assert.equal(actual.length, expected.length, `${message}: length`);
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i]) {
      assert.fail(
        `${message}: byte ${i} differs (old ${expected[i]}, new ${actual[i]})`,
      );
    }
  }
}

interface Outcome {
  value?: Uint8Array;
  error?: unknown;
}

function run(fn: () => Uint8Array): Outcome {
  try {
    return { value: fn() };
  } catch (error) {
    return { error };
  }
}

function assertSameOutcome(
  oldOutcome: Outcome,
  newOutcome: Outcome,
  message: string,
): void {
  assert.equal(
    Boolean(oldOutcome.error),
    Boolean(newOutcome.error),
    `${message}: old ${oldOutcome.error ? "threw" : "returned"}, new ${newOutcome.error ? "threw" : "returned"}`,
  );
  if (oldOutcome.value && newOutcome.value) {
    assertBytesEqual(newOutcome.value, oldOutcome.value, message);
  }
}

const INDEXED = new Set<number>([
  LibacSurfacePixelFormat.P8,
  LibacSurfacePixelFormat.Index16,
]);
const DXT = new Set<number>([
  LibacSurfacePixelFormat.Dxt1,
  LibacSurfacePixelFormat.Dxt3,
  LibacSurfacePixelFormat.Dxt5,
]);

function sourceLength(format: number, width: number, height: number): number {
  const pixels = width * height;
  if (format === LibacSurfacePixelFormat.R8G8B8) return pixels * 3;
  if (format === LibacSurfacePixelFormat.CustomLscapeR8G8B8) return pixels * 3;
  if (format === LibacSurfacePixelFormat.A8R8G8B8) return pixels * 4;
  if (format === LibacSurfacePixelFormat.R5G6B5) return pixels * 2;
  if (format === LibacSurfacePixelFormat.A1R5G5B5) return pixels * 2;
  if (format === LibacSurfacePixelFormat.A4R4G4B4) return pixels * 2;
  if (format === LibacSurfacePixelFormat.P8) return pixels;
  if (format === LibacSurfacePixelFormat.Index16) return pixels * 2;
  if (format === LibacSurfacePixelFormat.A8) return pixels;
  if (format === LibacSurfacePixelFormat.CustomLscapeAlpha) return pixels;
  const blocks = Math.ceil(width / 4) * Math.ceil(height / 4);
  if (format === LibacSurfacePixelFormat.Dxt1) return blocks * 8;
  return blocks * 16;
}

const FORMATS = [
  LibacSurfacePixelFormat.R8G8B8,
  LibacSurfacePixelFormat.CustomLscapeR8G8B8,
  LibacSurfacePixelFormat.A8R8G8B8,
  LibacSurfacePixelFormat.R5G6B5,
  LibacSurfacePixelFormat.A1R5G5B5,
  LibacSurfacePixelFormat.A4R4G4B4,
  LibacSurfacePixelFormat.P8,
  LibacSurfacePixelFormat.Index16,
  LibacSurfacePixelFormat.A8,
  LibacSurfacePixelFormat.CustomLscapeAlpha,
  LibacSurfacePixelFormat.Dxt1,
  LibacSurfacePixelFormat.Dxt3,
  LibacSurfacePixelFormat.Dxt5,
];

// ─── tests ─────────────────────────────────────────────────────────────────

test("numeric formats match libac's SurfacePixelFormat enum", () => {
  for (const [name, value] of Object.entries(SurfacePixelFormat)) {
    assert.equal(
      value,
      (LibacSurfacePixelFormat as unknown as Record<string, number>)[name],
      name,
    );
  }
});

for (const format of FORMATS) {
  test(`byte-identical to old decode: format ${LibacSurfacePixelFormat[format]}`, () => {
    const rng = mulberry32(0x1240 + format);
    const sizes: Array<[number, number]> = [
      [1, 1],
      [2, 1],
      [3, 2],
      [4, 4],
      [5, 3],
      [7, 5],
      [16, 9],
      [1, 9],
    ];
    const paletteLengths = [0, 8, 16, 256, 300];
    for (const [width, height] of sizes) {
      const length = sourceLength(format, width, height);
      for (let iteration = 0; iteration < 3; iteration++) {
        const bytes = randomBytes(rng, length);
        const texture = textureFor(format, width, height, bytes);
        const palettes: Array<Palette | undefined> = [
          undefined,
          ...paletteLengths.map((n) => randomPalette(rng, n)),
        ];
        const clips = INDEXED.has(format) ? [false, true] : [false];
        for (const palette of palettes) {
          for (const isClipMap of clips) {
            const label = `${LibacSurfacePixelFormat[format]} ${width}x${height} palette=${palette?.colors.length ?? "none"} clip=${isClipMap} iter=${iteration}`;
            assertSameOutcome(
              run(() => decodeOld(texture, palette, isClipMap)),
              run(() => decodeNew(texture, palette, isClipMap)),
              label,
            );
          }
        }
      }
    }
  });
}

test("byte-identical to old decode: truncated sources", () => {
  const rng = mulberry32(0xbeef);
  for (const format of FORMATS) {
    for (const [width, height] of [
      [4, 4],
      [5, 3],
    ] as Array<[number, number]>) {
      const full = sourceLength(format, width, height);
      const lengths = new Set<number>([
        0,
        1,
        Math.max(0, full - 1),
        Math.max(0, Math.floor(full / 2)),
        Math.max(0, full - 2),
      ]);
      if (DXT.has(format)) {
        const blockBytes = format === LibacSurfacePixelFormat.Dxt1 ? 8 : 16;
        lengths.add(Math.max(0, blockBytes - 1));
        lengths.add(blockBytes);
        lengths.add(Math.max(0, blockBytes * 2 - 1));
      }
      for (const length of lengths) {
        const bytes = randomBytes(rng, length);
        const texture = textureFor(format, width, height, bytes);
        const palette = randomPalette(rng, 256);
        for (const isClipMap of INDEXED.has(format) ? [false, true] : [false]) {
          const label = `${LibacSurfacePixelFormat[format]} ${width}x${height} source=${length}/${full} clip=${isClipMap}`;
          assertSameOutcome(
            run(() => decodeOld(texture, palette, isClipMap)),
            run(() => decodeNew(texture, palette, isClipMap)),
            label,
          );
        }
      }
    }
  }
});

test("byte-identical to old decode: zero-sized textures never throw", () => {
  for (const format of [
    ...FORMATS,
    LibacSurfacePixelFormat.CustomRawJpeg,
    0xdeadbeef,
  ]) {
    for (const [width, height] of [
      [0, 0],
      [0, 7],
      [7, 0],
    ] as Array<[number, number]>) {
      const texture = textureFor(format, width, height, new Uint8Array(0));
      assertSameOutcome(
        run(() => decodeOld(texture, undefined, false)),
        run(() => decodeNew(texture, undefined, false)),
        `${LibacSurfacePixelFormat[format] ?? format} ${width}x${height}`,
      );
    }
  }
});

test("byte-identical to old decode: unsupported formats throw for non-empty textures", () => {
  for (const format of [LibacSurfacePixelFormat.CustomRawJpeg, 0xdeadbeef]) {
    const texture = textureFor(format, 2, 2, randomBytes(mulberry32(7), 16));
    assertSameOutcome(
      run(() => decodeOld(texture, undefined, false)),
      run(() => decodeNew(texture, undefined, false)),
      `unsupported ${format}`,
    );
  }
});

test("byte-identical to old decode: subarray-backed source data", () => {
  const rng = mulberry32(0x5ab);
  for (const format of FORMATS) {
    const width = 5;
    const height = 3;
    const length = sourceLength(format, width, height);
    const backing = randomBytes(rng, length + 13);
    const bytes = backing.subarray(11, 11 + length);
    const texture = textureFor(format, width, height, bytes);
    const palette = randomPalette(rng, 256);
    for (const isClipMap of INDEXED.has(format) ? [false, true] : [false]) {
      assertSameOutcome(
        run(() => decodeOld(texture, palette, isClipMap)),
        run(() => decodeNew(texture, palette, isClipMap)),
        `${LibacSurfacePixelFormat[format]} subarray clip=${isClipMap}`,
      );
    }
  }
});

function littleEndianIndices(indices: number[]): Uint8Array {
  const bytes = new Uint8Array(indices.length * 2);
  indices.forEach((index, i) => {
    bytes[i * 2] = index & 0xff;
    bytes[i * 2 + 1] = index >>> 8;
  });
  return bytes;
}

test("indexed oracle: short, alpha-extreme, sparse palettes; clip map; full index sweeps", () => {
  const rng = mulberry32(0x9a1e);
  const sparse = new Array<number>(40);
  for (const i of [0, 3, 9, 20, 39]) sparse[i] = Math.floor(rng() * 0x100000000) >>> 0;
  const palettes: Array<[string, Palette | undefined]> = [
    ["none", undefined],
    ["empty", randomPalette(rng, 0)],
    ["length 1", randomPalette(rng, 1)],
    ["length 7", randomPalette(rng, 7)],
    ["length 8", randomPalette(rng, 8)],
    ["length 9", randomPalette(rng, 9)],
    ["length 200", randomPalette(rng, 200)],
    ["length 256", randomPalette(rng, 256)],
    ["length 300", randomPalette(rng, 300)],
    ["alpha 0 and 255", Object.assign(new Palette(), {
      colors: Array.from({ length: 300 }, (_, i) =>
        ((((i & 1) === 0 ? 0 : 0xff) << 24) | Math.floor(rng() * 0x1000000)) >>> 0,
      ),
    })],
    ["sparse holes", Object.assign(new Palette(), { colors: sparse })],
  ];
  const texturesFor: Array<[number, Uint8Array, number, number]> = [
    [LibacSurfacePixelFormat.P8, Uint8Array.from({ length: 256 }, (_, i) => i), 256, 1],
    [
      LibacSurfacePixelFormat.Index16,
      littleEndianIndices(Array.from({ length: 65536 }, (_, i) => i)),
      256,
      256,
    ],
    [LibacSurfacePixelFormat.Index16, randomBytes(rng, 37 * 23 * 2), 37, 23],
  ];
  for (const [label, palette] of palettes) {
    for (const [format, bytes, width, height] of texturesFor) {
      const texture = textureFor(format, width, height, bytes);
      for (const isClipMap of [false, true]) {
        assertSameOutcome(
          run(() => decodeOld(texture, palette, isClipMap)),
          run(() => decodeNew(texture, palette, isClipMap)),
          `${LibacSurfacePixelFormat[format]} ${width}x${height} palette=${label} clip=${isClipMap}`,
        );
      }
    }
  }
});

test("indexed oracle: Index16 indices at and beyond 256 with short palettes", () => {
  const indices = [0, 1, 7, 8, 255, 256, 257, 300, 1000, 4095, 4096, 32768, 65535];
  const bytes = littleEndianIndices(indices);
  for (const length of [0, 5, 8, 255, 256, 257]) {
    const palette = randomPalette(mulberry32(0x77 + length), length);
    const texture = textureFor(LibacSurfacePixelFormat.Index16, indices.length, 1, bytes);
    for (const isClipMap of [false, true]) {
      assertSameOutcome(
        run(() => decodeOld(texture, palette, isClipMap)),
        run(() => decodeNew(texture, palette, isClipMap)),
        `Index16 >=256 palette=${length} clip=${isClipMap}`,
      );
    }
  }
});
