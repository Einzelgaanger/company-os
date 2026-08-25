import { describe, expect, it } from "vitest";
import {
  bindRoute,
  trackRoute,
  assertAllRoutesBound,
  resetPolicyForTests,
} from "./policy.js";

describe("route policy fail-closed", () => {
  it("throws when a tracked route has no bind", () => {
    resetPolicyForTests();
    trackRoute("/ghost", "GET");
    expect(() => assertAllRoutesBound()).toThrow(/unbound routes/);
  });

  it("passes when every tracked route is bound", () => {
    resetPolicyForTests();
    bindRoute("/ok", "GET", "commitment.read");
    trackRoute("/ok", "GET");
    expect(() => assertAllRoutesBound()).not.toThrow();
  });
});
