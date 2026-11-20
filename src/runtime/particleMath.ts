import { EmitterType, ParticleType } from "../index.js";
import type { ParticleEmitterInfo, Vec3 } from "../index.js";

/** Numerical values consumed by the particle renderer, expressed in AC Z-up coordinates. */
export interface ParticleMotionState {
  offset: Vec3;
  A: Vec3;
  B: Vec3;
  C: Vec3;
}

/** Plain-value particle state shared by simulation and renderer adapters. */
export interface SimulatedParticle extends ParticleMotionState, ParticleAppearanceState {
  serial: number;
}

export interface EmitterSimulation {
  elapsed: number;
  emissionClock: number;
  distanceRemainder: number;
  emittedCount: number;
  nextSerial: number;
  emissionStopped: boolean;
  particles: SimulatedParticle[];
}

export interface ParticleAppearanceState {
  age: number;
  lifespan: number;
  startScale: number;
  finalScale: number;
  startTrans: number;
  finalTrans: number;
}

export interface ParticleAppearance {
  scale: number;
  translucency: number;
  opacity: number;
}

export interface ParticleMotion {
  /** Displacement in the emitter/part basis. */
  local: Vec3;
  /** Displacement in the root AC world basis. */
  global: Vec3;
}

const length = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);
const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));
const zero = (): Vec3 => ({ x: 0, y: 0, z: 0 });
const addScaled = (to: Vec3, from: Vec3, scale: number): void => {
  to.x += from.x * scale;
  to.y += from.y * scale;
  to.z += from.z * scale;
};

/** Interpolate appearance parameters at particle age (age/lifespan is clamped). */
export function evaluateParticleAppearance(particle: ParticleAppearanceState): ParticleAppearance {
  const t = particle.lifespan > 0 ? clamp(particle.age / particle.lifespan, 0, 1) : 1;
  const scale = particle.startScale + (particle.finalScale - particle.startScale) * t;
  const translucency = clamp(particle.startTrans + (particle.finalTrans - particle.startTrans) * t, 0, 1);
  return { scale, translucency, opacity: 1 - translucency };
}

const randomSigned = (random: () => number): number => random() * 2 - 1;
const randomBetween = (min: number, max: number, random: () => number): number => min + (max - min) * random();

/** ACE ParticleEmitterInfo.GetRandomOffset, returning a plain AC-space vector. */
function randomOffset(info: ParticleEmitterInfo, random: () => number): Vec3 {
  const sample = { x: randomSigned(random), y: randomSigned(random), z: randomSigned(random) };
  const direction = info.offsetDir;
  const projection = direction.x * sample.x + direction.y * sample.y + direction.z * sample.z;
  const tangent = {
    x: sample.x - direction.x * projection,
    y: sample.y - direction.y * projection,
    z: sample.z - direction.z * projection,
  };
  const magnitudeSq = tangent.x * tangent.x + tangent.y * tangent.y + tangent.z * tangent.z;
  if (magnitudeSq <= 1e-12) return zero();
  const magnitude = (info.maxOffset - info.minOffset + info.minOffset) * random();
  const scale = magnitude / Math.sqrt(magnitudeSq);
  return { x: tangent.x * scale, y: tangent.y * scale, z: tangent.z * scale };
}

function randomVector(value: Vec3, min: number, max: number, random: () => number): Vec3 {
  const scale = randomBetween(min, max, random);
  return { x: value.x * scale, y: value.y * scale, z: value.z * scale };
}

function createSimulatedParticle(info: ParticleEmitterInfo, state: EmitterSimulation, random: () => number): SimulatedParticle {
  return {
    serial: state.nextSerial++,
    age: 0,
    lifespan: Math.max(0, info.lifespan + randomSigned(random) * info.lifespanRand),
    offset: randomOffset(info, random),
    A: randomVector(info.A, info.minA, info.maxA, random),
    B: randomVector(info.B, info.minB, info.maxB, random),
    C: randomVector(info.C, info.minC, info.maxC, random),
    // ACE/ACViewer copies these values directly; Rand fields do not alter them.
    startScale: info.startScale,
    finalScale: info.finalScale,
    startTrans: clamp(info.startTrans, 0, 1),
    finalTrans: clamp(info.finalTrans, 0, 1),
  };
}

/** Initialize the observed ACE population from TotalParticles (not InitialParticles). */
export function createEmitterSimulation(info: ParticleEmitterInfo, random: () => number = Math.random): EmitterSimulation {
  const state: EmitterSimulation = {
    elapsed: 0, emissionClock: 0, distanceRemainder: 0,
    emittedCount: 0, nextSerial: 1, emissionStopped: false, particles: [],
  };
  const initialCount = Math.min(Math.max(0, Math.trunc(info.totalParticles)), Math.max(0, Math.trunc(info.maxParticles)));
  for (let i = 0; i < initialCount; i++) {
    state.particles.push(createSimulatedParticle(info, state, random));
    state.emittedCount++;
  }
  return state;
}

/** Advance pure emitter state; caller supplies elapsed frame time, distance, and RNG. */
export function advanceEmitterSimulation(
  info: ParticleEmitterInfo,
  state: EmitterSimulation,
  dt: number,
  options: { distanceMoved?: number; random?: () => number } = {},
): void {
  const step = Math.max(0, Number.isFinite(dt) ? dt : 0);
  const previousTime = state.elapsed;
  state.elapsed += step;
  for (const particle of state.particles) particle.age += step;
  state.particles = state.particles.filter((particle) => particle.age < particle.lifespan);
  const random = options.random ?? Math.random;
  const capacity = Math.max(0, Math.trunc(info.maxParticles));
  const lifetimeLimit = Math.max(0, Math.trunc(info.totalParticles));
  const canEmitAt = (time: number): boolean => !state.emissionStopped && capacity > 0 &&
    state.particles.length < capacity && (lifetimeLimit === 0 || state.emittedCount < lifetimeLimit) &&
    (info.totalSeconds <= 0 || time < info.totalSeconds);
  const emit = (): void => {
    state.particles.push(createSimulatedParticle(info, state, random));
    state.emittedCount++;
  };
  if (step === 0) return;
  if (info.emitterType === EmitterType.BirthratePerSec && !state.emissionStopped &&
      (lifetimeLimit === 0 || state.emittedCount < lifetimeLimit) &&
      (info.totalSeconds <= 0 || previousTime < info.totalSeconds)) state.emissionClock += step;
  if (!canEmitAt(previousTime)) return;
  if (info.emitterType === EmitterType.BirthratePerSec) {
    const interval = info.birthrate;
    if (!(interval > 0) || !Number.isFinite(interval)) return;
    // At most one emission per update; excess elapsed time is discarded.
    if (state.emissionClock >= interval && canEmitAt(state.elapsed)) {
      state.emissionClock = 0;
      emit();
    }
  } else if (info.emitterType === EmitterType.BirthratePerMeter) {
    const interval = info.birthrate;
    if (!(interval > 0) || !Number.isFinite(interval)) return;
    state.distanceRemainder += Math.max(0, options.distanceMoved ?? 0);
    if (state.distanceRemainder >= interval && canEmitAt(state.elapsed)) {
      state.distanceRemainder = 0;
      emit();
    }
  }
}

function rotatedOffset(offset: Vec3, axis: Vec3, angle: number): Vec3 {
  const axisLength = length(axis);
  if (axisLength <= 1e-9) return { ...offset };
  const x = axis.x / axisLength, y = axis.y / axisLength, z = axis.z / axisLength;
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  const dot = x * offset.x + y * offset.y + z * offset.z;
  return {
    x: offset.x * cosine + (y * offset.z - z * offset.y) * sine + x * dot * (1 - cosine),
    y: offset.y * cosine + (z * offset.x - x * offset.z) * sine + y * dot * (1 - cosine),
    z: offset.z * cosine + (x * offset.y - y * offset.x) * sine + z * dot * (1 - cosine),
  };
}

/**
 * Evaluate the viewer's current particle trajectory approximation. `particleType`
 * is the native `ParticleType` enum value from the parsed emitter record.
 * Swarm/explode/implode and GR/LR modes remain approximations pending client
 * traces; this extraction preserves their existing equations and output basis.
 */
export function evaluateParticleMotion(
  particleType: ParticleType,
  particle: ParticleMotionState,
  seconds: number,
): ParticleMotion {
  const t = Math.max(0, seconds);
  const t2 = t * t;
  const local = zero();
  const global = zero();
  const velocity = (to: Vec3, value: Vec3) => addScaled(to, value, t);
  const acceleration = (to: Vec3, value: Vec3) => addScaled(to, value, 0.5 * t2);
  const addFrameRotation = (to: Vec3): void => {
    const rotated = rotatedOffset(particle.offset, particle.C, length(particle.C) * t);
    to.x += rotated.x - particle.offset.x;
    to.y += rotated.y - particle.offset.y;
    to.z += rotated.z - particle.offset.z;
  };

  switch (particleType) {
    case ParticleType.LocalVelocity:
      velocity(local, particle.A);
      break;
    case ParticleType.GlobalVelocity:
      velocity(global, particle.A);
      break;
    case ParticleType.ParabolicLVGA:
      velocity(local, particle.A);
      acceleration(global, particle.B);
      break;
    case ParticleType.ParabolicLVGAGR:
      velocity(local, particle.A);
      acceleration(global, particle.B);
      addFrameRotation(local);
      break;
    case ParticleType.ParabolicLVLA:
      velocity(local, particle.A);
      acceleration(local, particle.B);
      break;
    case ParticleType.ParabolicLVLALR:
      velocity(local, particle.A);
      acceleration(local, particle.B);
      addFrameRotation(local);
      break;
    case ParticleType.ParabolicGVGA:
      velocity(global, particle.A);
      acceleration(global, particle.B);
      break;
    case ParticleType.ParabolicGVGAGR:
      velocity(global, particle.A);
      acceleration(global, particle.B);
      addFrameRotation(local);
      break;
    case ParticleType.Swarm: {
      velocity(local, particle.A);
      const oscillation = Math.sin(t * Math.max(0.001, length(particle.C)));
      addScaled(local, particle.B, oscillation);
      break;
    }
    case ParticleType.Explode: {
      let direction = { ...particle.offset };
      if (length(direction) === 0) direction = { ...particle.A };
      const directionLength = length(direction);
      if (directionLength > 0) addScaled(local, direction, (length(particle.A) * t) / directionLength);
      acceleration(local, particle.B);
      break;
    }
    case ParticleType.Implode: {
      const distance = length(particle.offset);
      if (distance > 0) addScaled(local, particle.offset, -Math.min(1, (length(particle.A) * t) / distance));
      break;
    }
    // Still, Unknown, and unmodeled enum values add no displacement.
  }
  return { local, global };
}
