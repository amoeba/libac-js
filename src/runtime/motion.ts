import { motionKey, type AnimData, type Animation, type Frame, type MotionTable } from "../index.js";

/** AC MotionCommand values used by MotionTable records. */
export enum MotionCommand {
  Ready = 0x40000003,
  On = 0x4000000b,
  Off = 0x4000000c,
}

/** Native AC WeenieType values used by consumers' default-state policy. */
export enum WeenieType {
  Portal = 7,
  Creature = 10,
  Door = 19,
  Chest = 20,
}

export interface MotionSegment {
  animation: Animation;
  low: number;
  high: number;
  framerate: number;
}

export interface MotionClip {
  segments: MotionSegment[];
  loop: boolean;
  duration: number;
}

/** Animations for a stance and command: direct cycle, link, then Ready. */
export function resolveAnims(table: MotionTable, stance: number, command: number): AnimData[] {
  const cycle = table.cycles.get(motionKey(stance, command));
  if (cycle) return cycle.anims;
  return resolveLink(table, stance, command, command)
    ?? table.cycles.get(motionKey(stance, MotionCommand.Ready))?.anims ?? [];
}

/** MotionTable transition link; inner keys retain raw target command values. */
export function resolveLink(
  table: MotionTable,
  stance: number,
  from: number,
  to: number,
): AnimData[] | undefined {
  const link = table.links.get(motionKey(stance, from));
  if (!link) return undefined;
  return link.get(to >>> 0)?.anims ?? link.get(to & 0xfffff)?.anims;
}

/** Resolve a one-shot transition, snapping to the target cycle when no link exists. */
export function resolveTransition(table: MotionTable, stance: number, from: number, to: number): AnimData[] {
  return resolveLink(table, stance, from, to) ?? resolveAnims(table, stance, to);
}

function segmentDuration(segment: MotionSegment): number {
  if (segment.framerate === 0) return 0;
  return (segment.high - segment.low) / Math.abs(segment.framerate);
}

/** Build a clip, dropping missing/empty animations and clamping frame bounds. */
export function buildClip(
  anims: readonly AnimData[],
  animationById: ReadonlyMap<number, Animation>,
  loop: boolean,
): MotionClip | undefined {
  const segments: MotionSegment[] = [];
  for (const anim of anims) {
    const animation = animationById.get(anim.animId);
    if (!animation || animation.partFrames.length === 0) continue;
    const lastFrame = animation.numFrames - 1;
    const high = anim.highFrame < 0 ? lastFrame : Math.min(anim.highFrame, lastFrame);
    const low = Math.max(0, Math.min(anim.lowFrame, high));
    segments.push({ animation, low, high, framerate: anim.framerate });
  }
  if (segments.length === 0) return undefined;
  return { segments, loop, duration: segments.reduce((sum, segment) => sum + segmentDuration(segment), 0) };
}

function sampleQuaternion(a: Frame["orientation"], b: Frame["orientation"], t: number): Frame["orientation"] {
  let bx = b.x, by = b.y, bz = b.z, bw = b.w;
  let cosine = a.x * bx + a.y * by + a.z * bz + a.w * bw;
  if (cosine < 0) {
    cosine = -cosine;
    bx = -bx; by = -by; bz = -bz; bw = -bw;
  }
  if (cosine >= 1) return { ...a };
  const sineSq = 1 - cosine * cosine;
  if (sineSq <= Number.EPSILON) {
    const s = 1 - t;
    const x = s * a.x + t * bx, y = s * a.y + t * by;
    const z = s * a.z + t * bz, w = s * a.w + t * bw;
    const length = Math.hypot(x, y, z, w) || 1;
    return { x: x / length, y: y / length, z: z / length, w: w / length };
  }
  const sine = Math.sqrt(sineSq);
  const halfTheta = Math.atan2(sine, cosine);
  const ratioA = Math.sin((1 - t) * halfTheta) / sine;
  const ratioB = Math.sin(t * halfTheta) / sine;
  return {
    x: a.x * ratioA + bx * ratioB,
    y: a.y * ratioA + by * ratioB,
    z: a.z * ratioA + bz * ratioB,
    w: a.w * ratioA + bw * ratioB,
  };
}

function lerpFrame(a: Frame, b: Frame, t: number): Frame {
  return {
    origin: {
      x: a.origin.x + (b.origin.x - a.origin.x) * t,
      y: a.origin.y + (b.origin.y - a.origin.y) * t,
      z: a.origin.z + (b.origin.z - a.origin.z) * t,
    },
    orientation: sampleQuaternion(a.orientation, b.orientation, t),
  };
}

/** Sample the pose at time in seconds, preserving signed framerates/reverse playback. */
export function samplePose(clip: MotionClip, t: number): Frame[] | undefined {
  if (clip.segments.length === 0) return undefined;
  if (clip.duration <= 0) {
    const segment = clip.segments[0];
    return segment.animation.partFrames[segment.low]?.frames;
  }
  let time = t;
  if (clip.loop) time = ((time % clip.duration) + clip.duration) % clip.duration;
  else time = Math.min(Math.max(time, 0), clip.duration);
  let start = 0;
  let segment = clip.segments[clip.segments.length - 1];
  let local = 0;
  for (const candidate of clip.segments) {
    const duration = segmentDuration(candidate);
    if (time < start + duration || candidate === clip.segments[clip.segments.length - 1]) {
      segment = candidate;
      local = time - start;
      break;
    }
    start += duration;
  }
  const { animation, low, high, framerate } = segment;
  const frames = animation.partFrames;
  if (framerate === 0 || high <= low) return frames[low]?.frames;
  const step = local * framerate;
  const index = Math.max(low, Math.min(high, framerate > 0 ? low + step : high + step));
  const i0 = Math.floor(index), i1 = Math.min(i0 + 1, high), frac = index - i0;
  const frame0 = frames[i0]?.frames, frame1 = frames[i1]?.frames;
  if (!frame0) return frame1;
  if (!frame1 || frac === 0) return frame0;
  const output: Frame[] = [];
  for (let i = 0; i < frame0.length; i++) output.push(lerpFrame(frame0[i], frame1[i] ?? frame0[i], frac));
  return output;
}
