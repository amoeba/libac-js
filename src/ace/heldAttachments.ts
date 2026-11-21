/** ACE held-equipment placement rules. Wire schemas and traversal budgets belong
 * to the service codec; these helpers operate on already-decoded native data. */
export interface HeldPlacement {
  parentLocation: number;
  placementId: number;
}

/** Validate a DAT frame used for held equipment. This contextual requirement
 * does not change permissive native Frame parsing for other consumers. */
export function validateAttachmentFrame(frame: { origin: { x: number; y: number; z: number }; orientation: { x: number; y: number; z: number; w: number } }): void {
  const { origin: p, orientation: q } = frame;
  if (![p.x, p.y, p.z, q.x, q.y, q.z, q.w].every(Number.isFinite) ||
      q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w === 0) {
    throw new Error("Held attachment: malformed DAT frame");
  }
}

/** ACE Creature_Equipment.GetPlacementLocation, using exact CurrentWieldedLocation.
 * Unsupported masks (including unnarrowed combined masks) are not guessed. */
export function heldPlacement(currentWieldedLocation: number, itemType: number, defaultCombatStyle: number): HeldPlacement {
  switch (currentWieldedLocation) {
    case 0x100000: // MeleeWeapon
    case 0x1000000: // Held
    case 0x2000000: // TwoHanded
      return { parentLocation: 1, placementId: 1 };
    case 0x200000: // Shield; non-armor is a left weapon
      return itemType === 2 ? { parentLocation: 3, placementId: 6 } : { parentLocation: 8, placementId: 2 };
    case 0x400000: // MissileWeapon; Bow / Crossbow
      return defaultCombatStyle === 0x10 || defaultCombatStyle === 0x20
        ? { parentLocation: 2, placementId: 3 } : { parentLocation: 1, placementId: 1 };
    default: throw new Error(`Appearance: unsupported held equip mask ${currentWieldedLocation}`);
  }
}

