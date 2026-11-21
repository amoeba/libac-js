import assert from "node:assert/strict";
import { passesAdminVisibilityCheck } from "./adminVisibility.js";

test("ACE admin-only visibility gates ordinary tracking, with absent property defaulting to false", () => {
  for (const visibility of [undefined, false]) {
    assert.equal(passesAdminVisibilityCheck(visibility), true);
    assert.equal(passesAdminVisibilityCheck(visibility, false), true);
    assert.equal(passesAdminVisibilityCheck(visibility, true), true);
  }
  assert.equal(passesAdminVisibilityCheck(true), false);
  assert.equal(passesAdminVisibilityCheck(true, false), false);
  assert.equal(passesAdminVisibilityCheck(true, true), true);
});
