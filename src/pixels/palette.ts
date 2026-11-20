/**
 * Overlay a sub-palette onto a copy of a base palette. Ranges use ObjDesc's
 * units of eight colors and are clipped to the lengths of both palettes.
 */
export function mergePalette(
  base: ArrayLike<number>,
  sub: ArrayLike<number>,
  offset: number,
  length: number,
): number[] {
  const merged = Array.from(base);
  const start = offset * 8;
  const end = Math.min(start + length * 8, sub.length, merged.length);
  for (let index = start; index < end; index++) merged[index] = sub[index];
  return merged;
}
