import { AnimationHookType, type AnimationHook } from "../index.js";
import type { PhysicsScript, PhysicsScriptData } from "../index.js";
import type { MotionClip } from "./motion.js";

/** Texture scroll hooks understood by the application material adapter. */
export function isTextureHook(hook: AnimationHook): boolean {
  return hook.type === AnimationHookType.TextureVelocity ||
    hook.type === AnimationHookType.TextureVelocityPart;
}

export interface MotionTextureHookEvent {
  /** Seconds from the beginning of the clip. */
  at: number;
  hook: AnimationHook;
}

/**
 * Select texture-velocity hooks from parsed motion clips and place them on the
 * clip timeline. Direction checks and zero-rate behavior match the viewer's
 * existing animation hook player; scene/material effects remain app-owned.
 */
export function collectMotionTextureHooks(clip: MotionClip): MotionTextureHookEvent[] {
  const events: MotionTextureHookEvent[] = [];
  let start = 0;
  for (const segment of clip.segments) {
    const { low, high, framerate, animation } = segment;
    const direction = framerate < 0 ? -1 : 1;
    const first = direction > 0 ? low : high;
    const last = framerate === 0 ? first : direction > 0 ? high : low;
    for (let frame = first; direction > 0 ? frame <= last : frame >= last; frame += direction) {
      for (const hook of animation.partFrames[frame]?.hooks ?? []) {
        if (isTextureHook(hook) && (hook.direction === 0 || hook.direction === direction)) {
          events.push({
            at: start + (framerate === 0 ? 0 : Math.abs(frame - first) / Math.abs(framerate)),
            hook,
          });
        }
      }
    }
    if (framerate !== 0) start += (high - low) / Math.abs(framerate);
  }
  return events;
}

/** Sorted, copied PhysicsScript records for the app's timeline cursor. */
export function sortPhysicsScriptData(data: readonly PhysicsScriptData[]): PhysicsScriptData[] {
  return [...data].sort((a, b) => a.startTime - b.startTime);
}

/** Return newly due script hooks in their timeline order and advance the cursor. */
export function duePhysicsScriptHooks(
  data: readonly PhysicsScriptData[],
  elapsed: number,
  nextHookIndex = 0,
): { due: Array<{ at: number; hook: AnimationHook }>; nextHookIndex: number } {
  let index = nextHookIndex;
  const due: Array<{ at: number; hook: AnimationHook }> = [];
  while (index < data.length && data[index].startTime <= elapsed) {
    due.push({ at: data[index].startTime, hook: data[index].hook });
    index++;
  }
  return { due, nextHookIndex: index };
}

/** Texture-velocity hooks reachable from a PhysicsScript's timed CallPES chain. */
export async function collectPhysicsScriptTextureHooks(
  scriptId: number,
  readScript: (id: number) => Promise<PhysicsScript>,
): Promise<MotionTextureHookEvent[]> {
  const events: MotionTextureHookEvent[] = [];
  const collect = async (id: number, start: number, chain: number[]): Promise<void> => {
    if (chain.length >= 16 || chain.includes(id)) return;
    const script = await readScript(id);
    for (const entry of script.script) {
      const at = start + entry.startTime;
      if (!Number.isFinite(at) || at < 0) continue;
      if (isTextureHook(entry.hook)) events.push({ at, hook: entry.hook });
      else if (entry.hook.type === AnimationHookType.CallPES && entry.hook.id !== undefined &&
          (entry.hook.id >>> 24) === 0x33) {
        await collect(entry.hook.id, at + Math.max(0, entry.hook.pause ?? 0), [...chain, id]);
      }
    }
  };
  await collect(scriptId, 0, []);
  return events.sort((a, b) => a.at - b.at);
}
