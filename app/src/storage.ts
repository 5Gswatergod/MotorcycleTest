import type { ExamHistoryItem, PracticeStat, UserData } from "./types";

export const STORAGE_KEY = "motorcycle-test:user-data";
const EMPTY_DATA: UserData = {
  favorites: [],
  wrongCounts: {},
  practiceStats: {},
  examHistory: [],
};

export function loadUserData(): { data: UserData; available: boolean } {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { data: structuredClone(EMPTY_DATA), available: true };
    return { data: sanitizeUserData(JSON.parse(raw)), available: true };
  } catch {
    return { data: structuredClone(EMPTY_DATA), available: false };
  }
}

export function saveUserData(data: UserData): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function sanitizeUserData(input: unknown): UserData {
  if (!input || typeof input !== "object") return structuredClone(EMPTY_DATA);
  const candidate = input as Partial<UserData>;
  const favorites = Array.isArray(candidate.favorites)
    ? candidate.favorites.filter((value): value is string => typeof value === "string")
    : [];
  const wrongCounts: Record<string, number> = {};
  for (const [id, count] of Object.entries(candidate.wrongCounts ?? {})) {
    if (Number.isFinite(count) && count >= 0) wrongCounts[id] = Math.floor(count);
  }
  const practiceStats: Record<string, PracticeStat> = {};
  for (const [id, stat] of Object.entries(candidate.practiceStats ?? {})) {
    if (
      stat &&
      Number.isFinite(stat.attempts) &&
      Number.isFinite(stat.correct) &&
      typeof stat.lastPracticedAt === "string"
    ) {
      practiceStats[id] = {
        attempts: Math.max(0, Math.floor(stat.attempts)),
        correct: Math.max(0, Math.floor(stat.correct)),
        lastPracticedAt: stat.lastPracticedAt,
      };
    }
  }
  const examHistory = Array.isArray(candidate.examHistory)
    ? candidate.examHistory.filter(isExamHistoryItem).slice(0, 100)
    : [];
  return { favorites: [...new Set(favorites)], wrongCounts, practiceStats, examHistory };
}

function isExamHistoryItem(value: unknown): value is ExamHistoryItem {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ExamHistoryItem>;
  return (
    typeof item.id === "string" &&
    typeof item.submittedAt === "string" &&
    typeof item.score === "number" &&
    typeof item.correct === "number" &&
    typeof item.total === "number" &&
    typeof item.passed === "boolean"
  );
}

export function mergeUserData(current: UserData, incoming: unknown): UserData {
  const safe = sanitizeUserData(incoming);
  const practiceStats = { ...current.practiceStats };
  for (const [id, stat] of Object.entries(safe.practiceStats)) {
    const existing = practiceStats[id];
    if (!existing || stat.lastPracticedAt > existing.lastPracticedAt) {
      practiceStats[id] = stat;
    } else {
      practiceStats[id] = {
        ...existing,
        attempts: Math.max(existing.attempts, stat.attempts),
        correct: Math.max(existing.correct, stat.correct),
      };
    }
  }
  const history = new Map(current.examHistory.map((item) => [item.id, item]));
  for (const item of safe.examHistory) history.set(item.id, item);
  const wrongCounts = { ...current.wrongCounts };
  for (const [id, count] of Object.entries(safe.wrongCounts)) {
    wrongCounts[id] = Math.max(wrongCounts[id] ?? 0, count);
  }
  return {
    favorites: [...new Set([...current.favorites, ...safe.favorites])],
    wrongCounts,
    practiceStats,
    examHistory: [...history.values()]
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
      .slice(0, 100),
  };
}
