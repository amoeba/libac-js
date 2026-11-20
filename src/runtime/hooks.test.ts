import { AnimationHookType, PhysicsScript } from "../index.js";
import { collectPhysicsScriptTextureHooks, duePhysicsScriptHooks, sortPhysicsScriptData } from "./hooks.js";

describe("reusable motion and physics script hook rules", () => {
  test("physics-script sorting and due cursor preserve equal-time wire order", () => {
    const first = { startTime: 0, hook: { type: AnimationHookType.NoOp, direction: 0 } };
    const second = { startTime: 1, hook: { type: AnimationHookType.Sound, direction: 0, id: 5 } };
    const third = { startTime: 1, hook: { type: AnimationHookType.StopParticle, direction: 0, id: 7 } };
    const sorted = sortPhysicsScriptData([third, first, second]);
    expect(sorted.map((entry) => entry.hook.id)).toEqual([undefined, 7, 5]);
    const due = duePhysicsScriptHooks(sorted, 1);
    expect(due.due).toHaveLength(3);
    expect(due.nextHookIndex).toBe(3);
  });

  test("follows timed CallPES texture hooks, skips cycles, and orders the timeline", async () => {
    const texture = { type: AnimationHookType.TextureVelocity, direction: 0, velocity: { u: 1, v: 0 } };
    const call = (id: number, pause: number) => ({ type: AnimationHookType.CallPES, direction: 0, id, pause });
    const a = new PhysicsScript();
    a.id = 0x33000001;
    a.script = [
      { startTime: 2, hook: texture },
      { startTime: 1, hook: call(0x33000002, 0.5) },
    ];
    const b = new PhysicsScript();
    b.id = 0x33000002;
    b.script = [
      { startTime: 0.25, hook: texture },
      { startTime: 0.5, hook: call(0x33000001, 0) },
    ];
    const reads: number[] = [];
    const events = await collectPhysicsScriptTextureHooks(a.id, async (id) => {
      reads.push(id);
      return id === a.id ? a : b;
    });
    expect(events.map((event) => event.at)).toEqual([1.75, 2]);
    expect(reads).toEqual([a.id, b.id]);
  });
});
