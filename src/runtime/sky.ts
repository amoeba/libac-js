import type { SkyObject, SkyTime } from "../index.js";

/** Wrap normalized time-of-day values to [0, 1). */
export const wrapDay = (time: number): number => ((time % 1) + 1) % 1;

export interface SkyInterval {
  a: SkyTime;
  b: SkyTime;
  blend: number;
}

/** Circular interpolation includes the last-to-first keyframe across midnight. */
export function skyInterval(times: readonly SkyTime[], time: number): SkyInterval | null {
  if (!times.length) return null;
  const t = wrapDay(time);
  let index = times.length - 1;
  for (let i = 0; i < times.length; i++) if (times[i].begin <= t) index = i;
  const a = times[index], b = times[(index + 1) % times.length];
  const span = wrapDay(b.begin - a.begin);
  return { a, b, blend: span > 0 ? wrapDay(t - a.begin) / span : 0 };
}

/** Progress through one sky object's circular begin/end visibility window. */
export function objectProgress(object: SkyObject, time: number): number | null {
  if (object.beginTime === object.endTime) return 0;
  const duration = wrapDay(object.endTime - object.beginTime);
  const elapsed = wrapDay(time - object.beginTime);
  return elapsed <= duration ? elapsed / duration : null;
}

/** Texture phase uses unwrapped simulation seconds, reduced to one tile. */
export function cloudOffset(seconds: number, velocity: number): number {
  return wrapDay(seconds * velocity);
}

/** Shortest signed interpolation from one AC sky heading to another. */
export function interpolateSkyAngleDegrees(a: number, b: number, blend: number): number {
  const difference = ((b - a + 180) % 360 + 360) % 360;
  return a + difference * blend - 180 * blend;
}
