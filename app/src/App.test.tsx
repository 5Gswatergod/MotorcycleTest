import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const bank = {
  meta: {
    version: "115.02.18",
    generatedAt: "2026-08-08T00:00:00.000Z",
    totalQuestions: 1052,
    counts: { regular: 806, context: 120, video: 126 },
    imageAssets: 268,
    officialFormat: {
      effectiveDate: "2026-01-30",
      totalQuestions: 50,
      durationMinutes: 30,
      scorePerQuestion: 2,
      passingScore: 85,
      composition: {
        video: 10,
        context: 5,
        正確觀念與態度: 12,
        主動停讓文化: 12,
        安全駕駛能力: 11,
      },
    },
    sources: [],
  },
  questions: [],
};

describe("首頁", () => {
  afterEach(() => vi.restoreAllMocks());

  it("載入題庫後顯示正式規則與兩個主要入口", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => bank }),
    );
    render(<App />);
    expect(await screen.findByRole("heading", { name: /機車筆試/ })).toBeInTheDocument();
    expect(screen.getByText("50 題")).toBeInTheDocument();
    expect(screen.getByText("30 分鐘")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /開始模擬考/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /隨機練習/ })).toBeEnabled();
  });
});
