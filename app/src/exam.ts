import type { ExamFormat, Question } from "./types";

export function shuffled<T>(items: readonly T[], random = Math.random): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function pick<T>(items: readonly T[], count: number, random = Math.random): T[] {
  if (items.length < count) {
    throw new Error(`題庫不足：需要 ${count} 題，實際只有 ${items.length} 題。`);
  }
  return shuffled(items, random).slice(0, count);
}

export function generateExam(
  questions: readonly Question[],
  format: ExamFormat,
  random = Math.random,
): Question[] {
  const video = pick(
    questions.filter((question) => question.kind === "video"),
    format.composition.video,
    random,
  );
  const context = pick(
    questions.filter((question) => question.kind === "context"),
    format.composition.context,
    random,
  );
  const regular = (
    ["正確觀念與態度", "主動停讓文化", "安全駕駛能力"] as const
  ).flatMap((category) =>
    pick(
      questions.filter(
        (question) => question.kind === "regular" && question.category === category,
      ),
      format.composition[category],
      random,
    ),
  );

  return [...shuffled(video, random), ...shuffled(context, random), ...shuffled(regular, random)];
}

export function gradeExam(
  questions: readonly Question[],
  answers: readonly (number | null)[],
  scorePerQuestion = 2,
) {
  const correct = questions.reduce(
    (sum, question, index) => sum + (answers[index] === question.answerIndex ? 1 : 0),
    0,
  );
  return { correct, score: correct * scorePerQuestion };
}

export function pickPracticeQuestion(
  questions: readonly Question[],
  attemptCounts: Record<string, number>,
  currentId?: string,
  random = Math.random,
): Question | null {
  const alternatives = questions.filter((question) => question.id !== currentId);
  const pool = alternatives.length > 0 ? alternatives : [...questions];
  if (pool.length === 0) return null;
  const unpracticed = pool.filter((question) => !attemptCounts[question.id]);
  const preferred = unpracticed.length > 0 ? unpracticed : pool;
  return preferred[Math.floor(random() * preferred.length)] ?? null;
}

export function formatTime(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
