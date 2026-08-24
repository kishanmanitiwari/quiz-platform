import { describe, expect, it } from "vitest";
import { calculateScore } from "../src/scoring.js";

describe("calculateScore", () => {
  it("returns zero for wrong answers", () => {
    expect(calculateScore({ isCorrect: false, basePoints: 100, responseTimeMs: 1000, timeLimitSeconds: 20 })).toBe(0);
  });

  it("adds a speed bonus for correct answers", () => {
    expect(calculateScore({ isCorrect: true, basePoints: 100, responseTimeMs: 0, timeLimitSeconds: 20 })).toBe(200);
    expect(calculateScore({ isCorrect: true, basePoints: 100, responseTimeMs: 10_000, timeLimitSeconds: 20 })).toBe(150);
    expect(calculateScore({ isCorrect: true, basePoints: 100, responseTimeMs: 20_000, timeLimitSeconds: 20 })).toBe(100);
  });
});
