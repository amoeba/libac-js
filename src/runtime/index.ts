export { PHYSICS_STATE_NO_DRAW, resolveInitialNoDraw } from "./physicsState.js";
export {
  MotionCommand,
  WeenieType,
  resolveAnims,
  resolveLink,
  resolveTransition,
  buildClip,
  samplePose,
} from "./motion.js";
export type { MotionSegment, MotionClip } from "./motion.js";
export {
  displace,
  scaleObj,
  rotateObjHeading,
  checkSlope,
  cellCutIsNe,
  sampleTerrain,
  onRoad,
  selectSceneId,
  generateScenery,
} from "./scenery.js";
export type { TerrainSample, SceneryPlacement } from "./scenery.js";
export {
  computePalCode,
  selectTerrainTextures,
  terrainTextureIds,
} from "./terrain.js";
export type { AlphaChoice, TerrainSelection } from "./terrain.js";
export { wrapDay, skyInterval, objectProgress, cloudOffset, interpolateSkyAngleDegrees } from "./sky.js";
export type { SkyInterval } from "./sky.js";
export {
  isTextureHook,
  collectMotionTextureHooks,
  sortPhysicsScriptData,
  duePhysicsScriptHooks,
  collectPhysicsScriptTextureHooks,
} from "./hooks.js";
export type { MotionTextureHookEvent } from "./hooks.js";
export {
  evaluateParticleAppearance,
  evaluateParticleMotion,
  createEmitterSimulation,
  advanceEmitterSimulation,
} from "./particleMath.js";
export type {
  ParticleMotionState,
  ParticleAppearanceState,
  ParticleAppearance,
  ParticleMotion,
  SimulatedParticle,
  EmitterSimulation,
} from "./particleMath.js";
