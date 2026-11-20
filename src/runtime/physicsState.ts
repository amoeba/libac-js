/** Native AC PhysicsState.NoDraw. This is not an application transport flag. */
export const PHYSICS_STATE_NO_DRAW = 0x20;

/** ACE initializes NoDraw from PhysicsState only when PropertyBool.NoDraw is
 * absent; an explicitly authored false therefore wins over the bit. */
export function resolveInitialNoDraw(
  noDraw: boolean | undefined,
  physicsState: number = 0,
): boolean {
  return noDraw ?? ((physicsState & PHYSICS_STATE_NO_DRAW) !== 0);
}
