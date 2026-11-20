# Optional runtime and ACE entrypoints

This extraction adds opt-in subpaths while preserving the existing package
root as the DAT/parser API:

- `@amoeba/libac/runtime`: pure client-domain evaluation over parsed AC data.
- `@amoeba/libac/ace`: deterministic ACE snapshot/initialization rules.

Neither entrypoint is imported by `src/index.ts`. Browser modules use plain
number-based vectors/quaternions and have no Three.js, DOM, or Node imports.

## Runtime ownership

`runtime` exports AC-native PhysicsState bits and initial NoDraw resolution;
MotionTable lookup and Animation clip/frame sampling; deterministic scene
placement helpers; terrain TexMerge selection when it does not overlap the
separate `./pixels` extraction; and particle simulation equations with injected
random sources. App-specific default motion choice/looping, scene object
creation, time advancement policy, particle resources, transport bits, and UI
remain in the viewer.

## ACE ownership

`ace` exports reusable appearance composition and CharGen initialization, plus
fixed-input equipment selection and generator spawn expansion. Inputs are
explicit snapshots rather than database/service clients. Selection requires a
caller-supplied random source, keeps ACE ordering/caps, and surfaces unsupported
cases. SQL, HTTP, ACLI/ACLB encoding, and publish orchestration remain app-owned.
Appearance operations consume and return core `ObjDesc`; snapshot attachment
semantics and ACLI wire encoding stay in the service/application layer. Core
parsers do not depend on `runtime` or `ace`.

## Initial public API names

- Runtime: `PHYSICS_STATE_NO_DRAW`, `resolveInitialNoDraw`, `resolveAnims`,
  `resolveLink`, `resolveTransition`, `buildClip`, `samplePose`,
  `selectSceneId`, `displace`, `scaleObj`, `rotateObjHeading`,
  `collectMotionTextureHooks`, `evaluateParticleAppearance`, and
  `evaluateParticleMotion`.
- ACE: `resolveAppearance`, `resolveCharGenAppearance`,
  `selectInitialEquipment`, `resolveGeneratorSpawns`, `hashSpawnSeed`, and
  `createSpawnRandom`.

The core parser/type names are being coordinated with the native-formats
branch before implementing imports. In particular, no raw CharGen, Clothing,
Particle, Pixel, or TexMerge parser is copied here.
