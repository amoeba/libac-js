import { advanceEmitterSimulation, createEmitterSimulation, evaluateParticleAppearance, evaluateParticleMotion } from "./particleMath.js";
import { EmitterType, ParticleEmitterInfo, ParticleType } from "../index.js";

const vector = (x = 0, y = 0, z = 0) => ({ x, y, z });
const particle = {
  offset: vector(1, 0, 0),
  A: vector(2, 0, 0),
  B: vector(0, 2, 0),
  C: vector(0, 0, Math.PI / 2),
};

describe("renderer-free particle equations", () => {
  test("interpolates scale and translucency with clamped age", () => {
    expect(evaluateParticleAppearance({
      age: 5, lifespan: 10, startScale: 2, finalScale: 4, startTrans: 0.2, finalTrans: 0.8,
    })).toEqual({ scale: 3, translucency: 0.5, opacity: 0.5 });
    expect(evaluateParticleAppearance({
      age: 12, lifespan: 10, startScale: 2, finalScale: 4, startTrans: -1, finalTrans: 4,
    })).toEqual({ scale: 4, translucency: 1, opacity: 0 });
  });

  test("evaluates local and global velocity/acceleration in separate bases", () => {
    expect(evaluateParticleMotion(ParticleType.LocalVelocity, particle, 0.5)).toEqual({ local: vector(1, 0, 0), global: vector() });
    expect(evaluateParticleMotion(ParticleType.ParabolicGVGA, particle, 2)).toEqual({ local: vector(), global: vector(4, 4, 0) });
  });

  test("keeps GR frame rotation as a local displacement", () => {
    const result = evaluateParticleMotion(ParticleType.ParabolicLVGAGR, particle, 1);
    expect(result.local.x).toBeCloseTo(1);
    expect(result.local.y).toBeCloseTo(1);
    expect(result.global.y).toBeCloseTo(1);
  });

  test("still and unknown particle types do not move", () => {
    expect(evaluateParticleMotion(ParticleType.Unknown, particle, 5)).toEqual({ local: vector(), global: vector() });
    expect(evaluateParticleMotion(ParticleType.Still, particle, 5)).toEqual({ local: vector(), global: vector() });
  });

  test("creates the ACE initial population from TotalParticles under capacity", () => {
    const info = new ParticleEmitterInfo();
    info.totalParticles = 3;
    info.initialParticles = 99;
    info.maxParticles = 2;
    info.lifespan = 4;
    const state = createEmitterSimulation(info, () => 0.5);
    expect(state.particles).toHaveLength(2);
    expect(state.emittedCount).toBe(2);
    expect(state.particles[0].serial).toBe(1);
  });

  test("injects elapsed time and distance into single-step emission rules", () => {
    const timed = new ParticleEmitterInfo();
    timed.emitterType = EmitterType.BirthratePerSec;
    timed.birthrate = 1;
    timed.maxParticles = 1;
    timed.totalParticles = 2;
    timed.lifespan = 0.75;
    const timeState = createEmitterSimulation(timed, () => 0.5);
    advanceEmitterSimulation(timed, timeState, 0.5, { random: () => 0.5 });
    expect(timeState.emittedCount).toBe(1);
    advanceEmitterSimulation(timed, timeState, 0.5, { random: () => 0.5 });
    expect(timeState.emittedCount).toBe(2);
    expect(timeState.particles).toHaveLength(1);

    const moving = new ParticleEmitterInfo();
    moving.emitterType = EmitterType.BirthratePerMeter;
    moving.birthrate = 3;
    moving.maxParticles = 2;
    const distanceState = createEmitterSimulation(moving, () => 0.5);
    advanceEmitterSimulation(moving, distanceState, 0.1, { distanceMoved: 1.2, random: () => 0.5 });
    expect(distanceState.emittedCount).toBe(0);
    advanceEmitterSimulation(moving, distanceState, 0.1, { distanceMoved: 1.8, random: () => 0.5 });
    expect(distanceState.emittedCount).toBe(1);
  });
});
