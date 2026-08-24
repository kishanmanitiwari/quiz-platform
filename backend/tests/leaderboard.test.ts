import { describe, expect, it } from "vitest";

type Entry = { name: string; totalScore: number; totalTime: number };

function rank(entries: Entry[]) {
  return entries
    .sort((a, b) => b.totalScore - a.totalScore || a.totalTime - b.totalTime || a.name.localeCompare(b.name))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

describe("leaderboard ranking", () => {
  it("orders by score then total response time then name", () => {
    expect(
      rank([
        { name: "B", totalScore: 200, totalTime: 900 },
        { name: "A", totalScore: 200, totalTime: 900 },
        { name: "C", totalScore: 200, totalTime: 800 },
        { name: "D", totalScore: 100, totalTime: 100 }
      ]).map((x) => x.name)
    ).toEqual(["C", "A", "B", "D"]);
  });
});
