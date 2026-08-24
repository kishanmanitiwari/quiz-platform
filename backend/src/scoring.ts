export type ScoreInput = {
  isCorrect: boolean;
  basePoints: number;
  responseTimeMs: number;
  timeLimitSeconds: number;
};

export function calculateScore(input: ScoreInput): number {
  if (!input.isCorrect) return 0;
  const timeLimitMs = input.timeLimitSeconds * 1000;
  const remainingRatio = Math.max(0, timeLimitMs - input.responseTimeMs) / timeLimitMs;
  const speedBonus = Math.round(input.basePoints * remainingRatio);
  return input.basePoints + speedBonus;
}
