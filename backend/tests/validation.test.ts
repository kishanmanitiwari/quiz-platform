import { describe, expect, it } from "vitest";
import { cleanName, joinRoomSchema, submitAnswerSchema } from "../src/validation.js";

describe("validation", () => {
  it("accepts valid room joins and rejects invalid rooms", () => {
    expect(joinRoomSchema.safeParse({ roomCode: "ABC123", name: "Hari", sessionId: "session-123456789" }).success).toBe(true);
    expect(joinRoomSchema.safeParse({ roomCode: "A", name: "Hari", sessionId: "session-123456789" }).success).toBe(false);
  });

  it("sanitizes participant names", () => {
    expect(cleanName("  Radhika   Devi <script> ")).toBe("Radhika Devi script");
  });

  it("rejects invalid answer options and client timestamps", () => {
    expect(
      submitAnswerSchema.safeParse({
        roomCode: "ABC123",
        participantId: "p1",
        sessionId: "session-123456789",
        questionId: "q1",
        selectedOption: "E",
        submittedAt: Date.now()
      }).success
    ).toBe(false);
  });
});
