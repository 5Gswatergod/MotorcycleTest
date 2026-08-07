import { describe, expect, it } from "vitest";
import { mergeUserData, sanitizeUserData } from "./storage";
import type { UserData } from "./types";

describe("學習紀錄備份", () => {
  it("清除不合法欄位並保留合法資料", () => {
    const data = sanitizeUserData({
      favorites: ["regular-001", 3],
      wrongCounts: { "regular-001": 2, broken: -1 },
      practiceStats: {},
      examHistory: [],
    });
    expect(data.favorites).toEqual(["regular-001"]);
    expect(data.wrongCounts).toEqual({ "regular-001": 2 });
  });

  it("匯入時合併而不直接覆蓋現有紀錄", () => {
    const current: UserData = {
      favorites: ["regular-001"],
      wrongCounts: { "regular-001": 3 },
      practiceStats: {},
      examHistory: [],
    };
    const merged = mergeUserData(current, {
      favorites: ["context-a-001"],
      wrongCounts: { "regular-001": 1, "context-a-001": 2 },
      practiceStats: {},
      examHistory: [],
    });
    expect(merged.favorites).toEqual(["regular-001", "context-a-001"]);
    expect(merged.wrongCounts).toEqual({
      "regular-001": 3,
      "context-a-001": 2,
    });
  });
});
