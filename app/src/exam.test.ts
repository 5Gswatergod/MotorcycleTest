import { describe, expect, it } from "vitest";
import { generateExam, gradeExam, pickPracticeQuestion } from "./exam";
import type { ExamFormat, Question, QuestionCategory, QuestionKind } from "./types";

function makeQuestion(
  id: string,
  kind: QuestionKind,
  category: QuestionCategory,
): Question {
  return {
    id,
    sourceNumber: Number(id.replace(/\D/g, "")) || 1,
    kind,
    category,
    prompt: `題目 ${id}`,
    options: ["甲", "乙", "丙"],
    answerIndex: 0,
    promptImages: [],
    optionImages: [],
    videoId: kind === "video" ? id : null,
    videoUrl: kind === "video" ? `https://example.com/${id}` : null,
    source: { file: "fixture.pdf", page: 1 },
  };
}

const format: ExamFormat = {
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
};

const fixtureQuestions: Question[] = [
  ...Array.from({ length: 20 }, (_, index) =>
    makeQuestion(`video-${index}`, "video", "危險感知能力"),
  ),
  ...Array.from({ length: 10 }, (_, index) =>
    makeQuestion(`context-${index}`, "context", "危險感知能力"),
  ),
  ...Array.from({ length: 20 }, (_, index) =>
    makeQuestion(`attitude-${index}`, "regular", "正確觀念與態度"),
  ),
  ...Array.from({ length: 20 }, (_, index) =>
    makeQuestion(`yield-${index}`, "regular", "主動停讓文化"),
  ),
  ...Array.from({ length: 20 }, (_, index) =>
    makeQuestion(`safety-${index}`, "regular", "安全駕駛能力"),
  ),
];

describe("正式考卷產生與計分", () => {
  it("依 115 年比例抽出 50 題且不重複", () => {
    const exam = generateExam(fixtureQuestions, format, () => 0.37);
    expect(exam).toHaveLength(50);
    expect(new Set(exam.map((question) => question.id)).size).toBe(50);
    expect(exam.filter((question) => question.kind === "video")).toHaveLength(10);
    expect(exam.filter((question) => question.kind === "context")).toHaveLength(5);
    expect(exam.filter((question) => question.category === "正確觀念與態度")).toHaveLength(12);
    expect(exam.filter((question) => question.category === "主動停讓文化")).toHaveLength(12);
    expect(exam.filter((question) => question.category === "安全駕駛能力")).toHaveLength(11);
  });

  it("42 題為 84 分，43 題為 86 分", () => {
    const exam = generateExam(fixtureQuestions, format, () => 0.42);
    const fortyTwo = exam.map((_, index) => (index < 42 ? 0 : 1));
    const fortyThree = exam.map((_, index) => (index < 43 ? 0 : 1));
    expect(gradeExam(exam, fortyTwo)).toEqual({ correct: 42, score: 84 });
    expect(gradeExam(exam, fortyThree)).toEqual({ correct: 43, score: 86 });
  });
});

describe("隨機練習", () => {
  it("優先抽未練習題並避免立即重複", () => {
    const pool = fixtureQuestions.slice(0, 3);
    const picked = pickPracticeQuestion(
      pool,
      { [pool[0].id]: 2, [pool[1].id]: 1 },
      pool[0].id,
      () => 0,
    );
    expect(picked?.id).toBe(pool[2].id);
  });
});
