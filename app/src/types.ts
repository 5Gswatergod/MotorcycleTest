export type QuestionKind = "regular" | "context" | "video";

export type QuestionCategory =
  | "正確觀念與態度"
  | "主動停讓文化"
  | "安全駕駛能力"
  | "危險感知能力";

export interface Question {
  id: string;
  sourceNumber: number;
  kind: QuestionKind;
  category: QuestionCategory;
  prompt: string;
  options: [string, string, string];
  answerIndex: number;
  promptImages: string[];
  optionImages: string[];
  videoId: string | null;
  videoUrl: string | null;
  source: {
    file: string;
    page: number;
  };
}

export interface ExamFormat {
  effectiveDate: string;
  totalQuestions: number;
  durationMinutes: number;
  scorePerQuestion: number;
  passingScore: number;
  composition: {
    video: number;
    context: number;
    正確觀念與態度: number;
    主動停讓文化: number;
    安全駕駛能力: number;
  };
}

export interface QuestionBank {
  meta: {
    version: string;
    generatedAt: string;
    totalQuestions: number;
    counts: Record<QuestionKind, number>;
    imageAssets: number;
    officialFormat: ExamFormat;
    sources: Array<{ label: string; url: string }>;
  };
  questions: Question[];
}

export interface PracticeStat {
  attempts: number;
  correct: number;
  lastPracticedAt: string;
}

export interface ExamHistoryItem {
  id: string;
  submittedAt: string;
  score: number;
  correct: number;
  total: number;
  passed: boolean;
}

export interface UserData {
  favorites: string[];
  wrongCounts: Record<string, number>;
  practiceStats: Record<string, PracticeStat>;
  examHistory: ExamHistoryItem[];
}

export interface ExamResult {
  questions: Question[];
  answers: Array<number | null>;
  submittedAt: string;
  score: number;
  correct: number;
  passed: boolean;
}
