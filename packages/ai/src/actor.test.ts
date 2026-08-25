import { describe, expect, it } from "vitest";
import {
  rejectUnsafeOutputFields,
  resolveNameToUserId,
  buildSendIntent,
  ACTOR_SEES_UNTRUSTED_CONTENT,
} from "./index.js";

describe("validator", () => {
  it("rejects URLs and emails in free text", () => {
    expect(rejectUnsafeOutputFields(["see https://evil.test"]).ok).toBe(false);
    expect(rejectUnsafeOutputFields(["ping a@b.com"]).ok).toBe(false);
    expect(rejectUnsafeOutputFields(["Ship the deck"]).ok).toBe(true);
  });

  it("resolves unique full name", () => {
    const r = resolveNameToUserId("Ada Lovelace", [
      { id: "u1", fullName: "Ada Lovelace", email: "ada@x.test" },
      { id: "u2", fullName: "Alan Turing", email: "alan@x.test" },
    ]);
    expect(r).toMatchObject({ status: "resolved", userId: "u1" });
  });
});

describe("actor C-4", () => {
  it("never sees untrusted content flag", () => {
    expect(ACTOR_SEES_UNTRUSTED_CONTENT).toBe(false);
  });

  it("renders DB-bound variables only", () => {
    const intent = buildSendIntent({
      templateKey: "checkin_general",
      templateBody: "Hi {{1}}, how's *{{2}}*?",
      recipientUserId: "u1",
      variables: ["Ada", "Deck"],
    });
    expect(intent.renderedBody).toBe("Hi Ada, how's *Deck*?");
  });

  it("requires recipientUserId", () => {
    expect(() =>
      buildSendIntent({
        templateKey: "x",
        templateBody: "Hi",
        recipientUserId: "",
        variables: [],
      }),
    ).toThrow(/recipientUserId/);
  });
});
