import { AnimationHookType } from "../index.js";
import { buildClip, resolveAnims, samplePose } from "./motion.js";
import { collectMotionTextureHooks } from "./hooks.js";
import type { Animation, Frame, MotionTable } from "../index.js";

const frame = (x: number, angle: number): Frame => ({
  origin: { x, y: 0, z: 0 },
  orientation: { x: 0, y: 0, z: Math.sin(angle / 2), w: Math.cos(angle / 2) },
});

describe("runtime motion evaluation", () => {
  test("resolves direct cycles before fallback Ready cycles", () => {
    const direct = [{ animId: 4, lowFrame: 0, highFrame: 2, framerate: 1 }];
    const ready = [{ animId: 1, lowFrame: 0, highFrame: 1, framerate: 1 }];
    const table = {
      cycles: new Map([[0x10004, { anims: direct }], [0x10003, { anims: ready }]]),
      links: new Map(),
    } as unknown as MotionTable;
    expect(resolveAnims(table, 1, 4)).toBe(direct);
    expect(resolveAnims(table, 1, 5)).toBe(ready);
  });

  test("builds and samples signed-rate clip frames with quaternion slerp", () => {
    const animation = {
      numFrames: 2,
      partFrames: [{ frames: [frame(0, 0)] }, { frames: [frame(10, Math.PI / 2)] }],
    } as unknown as Animation;
    const clip = buildClip([{ animId: 7, lowFrame: 0, highFrame: 1, framerate: 1 }], new Map([[7, animation]]), false)!;
    expect(clip.duration).toBe(1);
    const pose = samplePose(clip, 0.5)!;
    expect(pose[0].origin.x).toBe(5);
    expect(pose[0].orientation.z).toBeCloseTo(Math.sin(Math.PI / 8));
    expect(pose[0].orientation.w).toBeCloseTo(Math.cos(Math.PI / 8));
  });

  test("loops negative times and preserves reverse playback", () => {
    const animation = {
      numFrames: 3,
      partFrames: [0, 1, 2].map((x) => ({ frames: [frame(x, 0)] })),
    } as unknown as Animation;
    const clip = buildClip([{ animId: 1, lowFrame: 0, highFrame: 2, framerate: -1 }], new Map([[1, animation]]), true)!;
    expect(samplePose(clip, 0)?.[0].origin.x).toBe(2);
    expect(samplePose(clip, 1)?.[0].origin.x).toBe(1);
    expect(samplePose(clip, -1)?.[0].origin.x).toBe(1);
  });

  test("slerp handles opposite quaternion signs and nearly identical rotations", () => {
    const equivalent = {
      numFrames: 2,
      partFrames: [
        { frames: [frame(0, 0)] },
        { frames: [{ ...frame(2, 0), orientation: { x: 0, y: 0, z: 0, w: -1 } }] },
      ],
    } as unknown as Animation;
    const clip = buildClip([{ animId: 1, lowFrame: 0, highFrame: 1, framerate: 1 }], new Map([[1, equivalent]]), false)!;
    const sameRotation = samplePose(clip, 0.5)![0].orientation;
    expect(sameRotation.w).toBeCloseTo(1);
    expect(sameRotation.x).toBe(0);

    const nearby = {
      numFrames: 2,
      partFrames: [
        { frames: [frame(0, 0)] },
        { frames: [frame(0, 1e-9)] },
      ],
    } as unknown as Animation;
    const nearClip = buildClip([{ animId: 2, lowFrame: 0, highFrame: 1, framerate: 1 }], new Map([[2, nearby]]), false)!;
    expect(samplePose(nearClip, 0.5)![0].orientation.w).toBeCloseTo(1);
  });

  test("selects texture hooks by playback direction and clip time", () => {
    const hook = (direction: number) => ({ type: AnimationHookType.TextureVelocity, direction, velocity: { u: 1, v: 0 } });
    const animation = {
      numFrames: 2,
      partFrames: [
        { frames: [frame(0, 0)], hooks: [hook(1), hook(-1), hook(0)] },
        { frames: [frame(1, 0)], hooks: [hook(1), hook(-1)] },
      ],
    } as unknown as Animation;
    const forward = buildClip([{ animId: 1, lowFrame: 0, highFrame: 1, framerate: 1 }], new Map([[1, animation]]), false)!;
    expect(collectMotionTextureHooks(forward).map((event) => event.at)).toEqual([0, 0, 1]);
    const reverse = buildClip([{ animId: 1, lowFrame: 0, highFrame: 1, framerate: -1 }], new Map([[1, animation]]), false)!;
    expect(collectMotionTextureHooks(reverse).map((event) => event.at)).toEqual([0, 1, 1]);
  });
});
