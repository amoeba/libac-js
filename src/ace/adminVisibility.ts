/**
 * ACE's admin-only tracking gate (PropertyBool.Visibility, 18).
 *
 * ACE 3af8377: WorldObject_Properties.cs defaults Visibility to false;
 * Player_Tracking.cs returns before CreateObject when Visibility is true and
 * the player lacks Adminvision. This is one tracking prerequisite, not the
 * complete tracking policy, and is independent of native PhysicsState.NoDraw.
 */
export function passesAdminVisibilityCheck(
  visibility: boolean | undefined,
  adminvision = false,
): boolean {
  return !visibility || adminvision;
}
