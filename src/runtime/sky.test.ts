import { cloudOffset, interpolateSkyAngleDegrees, objectProgress, skyInterval, wrapDay } from "./sky.js";
import type { SkyObject, SkyTime } from "../index.js";

const time = (begin: number): SkyTime => ({
  begin, dirBright: 0, dirHeading: 0, dirPitch: 0, dirColor: 0,
  ambBright: 0, ambColor: 0, minFog: 0, maxFog: 0, fogColor: 0, fog: 0, replacements: [],
});

describe("renderer-free sky timeline rules", () => {
  test("wraps time and interpolates the final interval through midnight", () => {
    expect(wrapDay(-0.25)).toBe(0.75);
    expect(skyInterval([time(0.25), time(0.75)], 0)).toEqual({ a: time(0.75), b: time(0.25), blend: 0.5 });
    expect(skyInterval([], 0)).toBeNull();
  });

  test("computes object windows, cloud phase, and shortest heading arc", () => {
    const object: SkyObject = {
      beginTime: 0.8, endTime: 0.2, beginAngle: 0, endAngle: 0,
      texVelocityX: 0.25, texVelocityY: -0.25, gfxId: 0, pesId: 0, properties: 0,
    };
    expect(objectProgress(object, 0.9)).toBeCloseTo(0.25);
    expect(objectProgress(object, 0.5)).toBeNull();
    expect(objectProgress({ ...object, beginTime: 0.2, endTime: 0.2 }, 0.7)).toBe(0);
    expect(cloudOffset(6, 0.25)).toBe(0.5);
    expect(interpolateSkyAngleDegrees(350, 10, 0.5)).toBe(360);
  });
});
