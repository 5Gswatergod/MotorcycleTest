import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowSquareOut,
  BookmarkSimple,
  CheckCircle,
  ClockCountdown,
  DownloadSimple,
  Exam,
  Export,
  Flag,
  FunnelSimple,
  House,
  ListChecks,
  MagnifyingGlass,
  Motorcycle,
  PlayCircle,
  ShieldCheck,
  Shuffle,
  Timer,
  UploadSimple,
  Warning,
  XCircle,
} from "@phosphor-icons/react";
import { buildStyles, CircularProgressbar } from "react-circular-progressbar";
import { formatTime, generateExam, gradeExam, pickPracticeQuestion } from "./exam";
import { loadUserData, mergeUserData, saveUserData } from "./storage";
import type {
  ExamResult,
  Question,
  QuestionBank,
  QuestionCategory,
  QuestionKind,
  UserData,
} from "./types";

type View = "home" | "exam" | "practice" | "result";

interface PracticeFilters {
  category: "全部" | QuestionCategory;
  kind: "全部" | QuestionKind;
  favoritesOnly: boolean;
  wrongOnly: boolean;
  search: string;
}

const defaultFilters: PracticeFilters = {
  category: "全部",
  kind: "全部",
  favoritesOnly: false,
  wrongOnly: false,
  search: "",
};

const kindLabels: Record<QuestionKind, string> = {
  regular: "一般題",
  context: "情境圖片",
  video: "危險感知影片",
};

function makeHistoryId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function App() {
  const [{ data: initialData, available: initialStorageAvailable }] = useState(loadUserData);
  const [bank, setBank] = useState<QuestionBank | null>(null);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState<View>("home");
  const [userData, setUserData] = useState<UserData>(initialData);
  const [storageAvailable, setStorageAvailable] = useState(initialStorageAvailable);
  const [examQuestions, setExamQuestions] = useState<Question[]>([]);
  const [examAnswers, setExamAnswers] = useState<Array<number | null>>([]);
  const [examFlags, setExamFlags] = useState<Set<number>>(new Set());
  const [examResult, setExamResult] = useState<ExamResult | null>(null);
  const [practiceFilters, setPracticeFilters] = useState(defaultFilters);
  const [practiceQuestion, setPracticeQuestion] = useState<Question | null>(null);
  const [practiceSelection, setPracticeSelection] = useState<number | null>(null);
  const [practiceRevealed, setPracticeRevealed] = useState(false);
  const [toast, setToast] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/data/question-bank.json")
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<QuestionBank>;
      })
      .then((payload) => {
        if (active) setBank(payload);
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : "題庫載入失敗");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const commitUserData = useCallback((updater: (current: UserData) => UserData) => {
    setUserData((current) => {
      const next = updater(current);
      if (!saveUserData(next)) setStorageAvailable(false);
      return next;
    });
  }, []);

  const filteredPractice = useMemo(() => {
    if (!bank) return [];
    const term = practiceFilters.search.trim().toLocaleLowerCase("zh-Hant");
    return bank.questions.filter((question) => {
      if (practiceFilters.category !== "全部" && question.category !== practiceFilters.category)
        return false;
      if (practiceFilters.kind !== "全部" && question.kind !== practiceFilters.kind) return false;
      if (practiceFilters.favoritesOnly && !userData.favorites.includes(question.id)) return false;
      if (practiceFilters.wrongOnly && !userData.wrongCounts[question.id]) return false;
      if (
        term &&
        !`${question.prompt} ${question.options.join(" ")} ${question.sourceNumber}`
          .toLocaleLowerCase("zh-Hant")
          .includes(term)
      )
        return false;
      return true;
    });
  }, [bank, practiceFilters, userData.favorites, userData.wrongCounts]);

  useEffect(() => {
    if (view !== "practice") return;
    if (practiceQuestion && filteredPractice.some((item) => item.id === practiceQuestion.id)) return;
    const attempts = Object.fromEntries(
      Object.entries(userData.practiceStats).map(([id, stat]) => [id, stat.attempts]),
    );
    setPracticeQuestion(pickPracticeQuestion(filteredPractice, attempts));
    setPracticeSelection(null);
    setPracticeRevealed(false);
  }, [filteredPractice, practiceQuestion, userData.practiceStats, view]);

  if (loadError) {
    return (
      <main className="loading-state">
        <Warning size={40} weight="fill" />
        <h1>題庫無法載入</h1>
        <p>{loadError}</p>
        <button className="button button-primary" onClick={() => window.location.reload()}>
          重新載入
        </button>
      </main>
    );
  }

  if (!bank) {
    return (
      <main className="loading-state" aria-live="polite">
        <Motorcycle size={48} weight="duotone" />
        <h1>正在整理考場…</h1>
        <p>載入 1,052 題官方題庫</p>
      </main>
    );
  }

  const startExam = () => {
    const questions = generateExam(bank.questions, bank.meta.officialFormat);
    setExamQuestions(questions);
    setExamAnswers(Array(questions.length).fill(null));
    setExamFlags(new Set());
    setExamResult(null);
    setView("exam");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submitExam = () => {
    if (examQuestions.length === 0) return;
    const { correct, score } = gradeExam(
      examQuestions,
      examAnswers,
      bank.meta.officialFormat.scorePerQuestion,
    );
    const submittedAt = new Date().toISOString();
    const passed = score >= bank.meta.officialFormat.passingScore;
    const result: ExamResult = {
      questions: examQuestions,
      answers: examAnswers,
      submittedAt,
      score,
      correct,
      passed,
    };
    setExamResult(result);
    commitUserData((current) => {
      const wrongCounts = { ...current.wrongCounts };
      examQuestions.forEach((question, index) => {
        if (examAnswers[index] !== question.answerIndex) {
          wrongCounts[question.id] = (wrongCounts[question.id] ?? 0) + 1;
        }
      });
      return {
        ...current,
        wrongCounts,
        examHistory: [
          {
            id: makeHistoryId(),
            submittedAt,
            score,
            correct,
            total: examQuestions.length,
            passed,
          },
          ...current.examHistory,
        ].slice(0, 100),
      };
    });
    setView("result");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startPractice = () => {
    const attempts = Object.fromEntries(
      Object.entries(userData.practiceStats).map(([id, stat]) => [id, stat.attempts]),
    );
    setPracticeQuestion(pickPracticeQuestion(bank.questions, attempts));
    setPracticeSelection(null);
    setPracticeRevealed(false);
    setView("practice");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const answerPractice = (answerIndex: number) => {
    if (!practiceQuestion || practiceRevealed) return;
    const correct = answerIndex === practiceQuestion.answerIndex;
    setPracticeSelection(answerIndex);
    setPracticeRevealed(true);
    commitUserData((current) => {
      const previous = current.practiceStats[practiceQuestion.id] ?? {
        attempts: 0,
        correct: 0,
        lastPracticedAt: "",
      };
      return {
        ...current,
        wrongCounts: correct
          ? current.wrongCounts
          : {
              ...current.wrongCounts,
              [practiceQuestion.id]: (current.wrongCounts[practiceQuestion.id] ?? 0) + 1,
            },
        practiceStats: {
          ...current.practiceStats,
          [practiceQuestion.id]: {
            attempts: previous.attempts + 1,
            correct: previous.correct + (correct ? 1 : 0),
            lastPracticedAt: new Date().toISOString(),
          },
        },
      };
    });
  };

  const nextPractice = () => {
    const attempts = Object.fromEntries(
      Object.entries(userData.practiceStats).map(([id, stat]) => [id, stat.attempts]),
    );
    setPracticeQuestion(
      pickPracticeQuestion(filteredPractice, attempts, practiceQuestion?.id),
    );
    setPracticeSelection(null);
    setPracticeRevealed(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleFavorite = (id: string) => {
    commitUserData((current) => ({
      ...current,
      favorites: current.favorites.includes(id)
        ? current.favorites.filter((item) => item !== id)
        : [...current.favorites, id],
    }));
  };

  const exportData = () => {
    const payload = {
      version: 1,
      bankGeneratedAt: bank.meta.generatedAt,
      exportedAt: new Date().toISOString(),
      data: userData,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `motorcycle-test-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setToast("學習紀錄已匯出");
  };

  const importData = async (file: File | undefined) => {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text()) as { version?: number; data?: unknown };
      if (payload.version !== 1 || !payload.data) throw new Error("格式不符");
      const merged = mergeUserData(userData, payload.data);
      setUserData(merged);
      if (!saveUserData(merged)) setStorageAvailable(false);
      setToast("備份已驗證並合併");
    } catch {
      setToast("匯入失敗：請選擇本站匯出的 JSON 備份");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const sharedProps = {
    onHome: () => setView("home"),
    storageAvailable,
  };

  return (
    <>
      {!storageAvailable && (
        <div className="storage-warning" role="alert">
          <Warning size={18} weight="fill" /> 瀏覽器儲存空間目前不可用，本次進度可能無法保留。
        </div>
      )}
      {view === "home" && (
        <HomeScreen
          bank={bank}
          userData={userData}
          onStartExam={startExam}
          onStartPractice={startPractice}
          onExport={exportData}
          onImport={() => importInputRef.current?.click()}
        />
      )}
      {view === "exam" && (
        <ExamScreen
          {...sharedProps}
          questions={examQuestions}
          answers={examAnswers}
          flags={examFlags}
          durationSeconds={bank.meta.officialFormat.durationMinutes * 60}
          onAnswer={(questionIndex, answerIndex) =>
            setExamAnswers((current) =>
              current.map((answer, index) => (index === questionIndex ? answerIndex : answer)),
            )
          }
          onToggleFlag={(questionIndex) =>
            setExamFlags((current) => {
              const next = new Set(current);
              if (next.has(questionIndex)) next.delete(questionIndex);
              else next.add(questionIndex);
              return next;
            })
          }
          onSubmit={submitExam}
        />
      )}
      {view === "practice" && (
        <PracticeScreen
          {...sharedProps}
          question={practiceQuestion}
          selection={practiceSelection}
          revealed={practiceRevealed}
          resultCount={filteredPractice.length}
          filters={practiceFilters}
          favorite={practiceQuestion ? userData.favorites.includes(practiceQuestion.id) : false}
          wrongCount={practiceQuestion ? userData.wrongCounts[practiceQuestion.id] ?? 0 : 0}
          onFiltersChange={setPracticeFilters}
          onAnswer={answerPractice}
          onNext={nextPractice}
          onToggleFavorite={() => practiceQuestion && toggleFavorite(practiceQuestion.id)}
        />
      )}
      {view === "result" && examResult && (
        <ResultScreen
          {...sharedProps}
          result={examResult}
          passingScore={bank.meta.officialFormat.passingScore}
          onRetry={startExam}
          onPractice={() => {
            setPracticeFilters({ ...defaultFilters, wrongOnly: true });
            setPracticeQuestion(null);
            setView("practice");
          }}
        />
      )}
      <input
        ref={importInputRef}
        className="sr-only"
        type="file"
        accept="application/json,.json"
        onChange={(event) => void importData(event.target.files?.[0])}
      />
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}

function Brand() {
  return (
    <div className="brand" aria-label="RideReady 首頁">
      <span className="brand-mark">
        <Motorcycle size={26} weight="fill" />
      </span>
      <span>RideReady</span>
    </div>
  );
}

function HomeScreen({
  bank,
  userData,
  onStartExam,
  onStartPractice,
  onExport,
  onImport,
}: {
  bank: QuestionBank;
  userData: UserData;
  onStartExam: () => void;
  onStartPractice: () => void;
  onExport: () => void;
  onImport: () => void;
}) {
  const practiced = Object.keys(userData.practiceStats).length;
  const progress = Math.round((practiced / bank.meta.totalQuestions) * 100);
  const latest = userData.examHistory[0];
  const totalAttempts = Object.values(userData.practiceStats).reduce(
    (sum, stat) => sum + stat.attempts,
    0,
  );

  return (
    <main className="home-shell">
      <section className="hero">
        <div className="hero-shade" />
        <header className="home-header">
          <Brand />
          <nav aria-label="首頁快速連結">
            <a href="#exam-rules">考試規則</a>
            <a href="#learning-record">學習紀錄</a>
          </nav>
        </header>

        <div className="hero-grid">
          <div className="hero-copy">
            <h1>機車筆試・專注練習</h1>
            <p className="eyebrow hero-eyebrow">115 年新制模擬考</p>
            <div className="rule-line" id="exam-rules">
              <span><Exam size={20} />50 題</span>
              <span><Timer size={20} />30 分鐘</span>
              <span><ShieldCheck size={20} />85 分及格</span>
            </div>
            <div className="hero-actions">
              <button className="button button-primary button-large" onClick={onStartExam}>
                開始模擬考 <ArrowRight size={22} weight="bold" />
              </button>
              <button className="button button-secondary button-large" onClick={onStartPractice}>
                <Shuffle size={21} />隨機練習
              </button>
            </div>
          </div>

          <div className="progress-stage" id="learning-record">
            <div className="progress-ring" aria-label={`題庫進度 ${progress}%`}>
              <CircularProgressbar
                value={progress}
                text={`${practiced}`}
                strokeWidth={5}
                styles={buildStyles({
                  pathColor: "#c9f31d",
                  trailColor: "rgba(255,255,255,.12)",
                  textColor: "#f5f8f6",
                  textSize: "20px",
                  pathTransitionDuration: 0.7,
                })}
              />
              <span className="progress-label-top">已練習</span>
              <span className="progress-caption">題</span>
            </div>
            <div className="progress-meta">
              <span>{practiced.toLocaleString()} / {bank.meta.totalQuestions.toLocaleString()} 題</span>
              <span>累計作答 {totalAttempts.toLocaleString()} 次</span>
            </div>
          </div>
        </div>

        <div className="recent-strip">
          <div>
            <span className="strip-kicker">最近一次模擬考</span>
            <strong>{latest ? `${latest.score} 分` : "尚未作答"}</strong>
          </div>
          <div className="strip-detail">
            <span>{latest ? (latest.passed ? "通過" : "再接再厲") : "完成第一回，建立基準"}</span>
            <span>收藏 {userData.favorites.length} 題</span>
            <span>錯題 {Object.keys(userData.wrongCounts).length} 題</span>
          </div>
        </div>
      </section>

      <section className="home-lower" aria-label="考試資訊與資料管理">
        <div className="lower-heading">
          <p className="eyebrow">完整官方題庫</p>
          <h2>一次準備好正式考試需要的所有題型</h2>
        </div>
        <div className="feature-grid">
          <article>
            <PlayCircle size={30} weight="duotone" />
            <strong>126 題影片感知</strong>
            <p>內嵌官方播放器，另附原始影片連結作為備援。</p>
          </article>
          <article>
            <ListChecks size={30} weight="duotone" />
            <strong>120 題情境圖片</strong>
            <p>保留題目插圖，不把 PDF 上的答案一起顯示。</p>
          </article>
          <article>
            <Shuffle size={30} weight="duotone" />
            <strong>806 題一般題</strong>
            <p>依四大能力分類，練習時優先抽尚未做過的題目。</p>
          </article>
        </div>
        <div className="data-row">
          <div>
            <h3>你的紀錄只留在這台裝置</h3>
            <p>可隨時匯出 JSON 備份，再於另一個瀏覽器驗證後合併。</p>
          </div>
          <div className="data-actions">
            <button className="button button-ghost" onClick={onExport}>
              <Export size={19} />匯出紀錄
            </button>
            <button className="button button-ghost" onClick={onImport}>
              <UploadSimple size={19} />匯入備份
            </button>
          </div>
        </div>
        <footer>
          <span>題庫版本 {bank.meta.version}・產生於 {new Date(bank.meta.generatedAt).toLocaleDateString("zh-TW")}</span>
          <div>
            {bank.meta.sources.map((source) => (
              <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                {source.label}<ArrowSquareOut size={14} />
              </a>
            ))}
          </div>
        </footer>
      </section>
    </main>
  );
}

function AppHeader({
  title,
  onHome,
  aside,
}: {
  title: string;
  onHome: () => void;
  aside?: React.ReactNode;
}) {
  return (
    <header className="app-header">
      <button className="icon-button" onClick={onHome} aria-label="回到首頁">
        <House size={22} weight="fill" />
      </button>
      <div>
        <Brand />
        <span className="screen-title">{title}</span>
      </div>
      <div className="header-aside">{aside}</div>
    </header>
  );
}

function ExamScreen({
  questions,
  answers,
  flags,
  durationSeconds,
  onAnswer,
  onToggleFlag,
  onSubmit,
  onHome,
}: {
  questions: Question[];
  answers: Array<number | null>;
  flags: Set<number>;
  durationSeconds: number;
  onAnswer: (questionIndex: number, answerIndex: number) => void;
  onToggleFlag: (questionIndex: number) => void;
  onSubmit: () => void;
  onHome: () => void;
  storageAvailable: boolean;
}) {
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState(durationSeconds);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const submitRef = useRef(onSubmit);
  submitRef.current = onSubmit;

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRemaining((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          window.setTimeout(() => submitRef.current(), 0);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const current = questions[index];
  const unanswered = answers.filter((answer) => answer === null).length;
  const attemptSubmit = () => {
    if (unanswered > 0) setConfirmSubmit(true);
    else onSubmit();
  };

  return (
    <main className="app-shell">
      <AppHeader
        title="正式模擬考"
        onHome={onHome}
        aside={
          <div className={`timer-pill ${remaining <= 300 ? "is-urgent" : ""}`}>
            <ClockCountdown size={20} weight="fill" />
            <span>{formatTime(remaining)}</span>
          </div>
        }
      />
      <div className="exam-layout">
        <section className="question-panel">
          <QuestionTopline
            question={current}
            index={index}
            total={questions.length}
            action={
              <button
                className={`flag-button ${flags.has(index) ? "is-active" : ""}`}
                onClick={() => onToggleFlag(index)}
                aria-pressed={flags.has(index)}
              >
                <Flag size={18} weight={flags.has(index) ? "fill" : "regular"} />
                {flags.has(index) ? "已標記" : "稍後再看"}
              </button>
            }
          />
          <QuestionContent
            question={current}
            selected={answers[index]}
            onSelect={(answer) => onAnswer(index, answer)}
          />
          <div className="question-actions">
            <button
              className="button button-secondary"
              disabled={index === 0}
              onClick={() => setIndex((currentIndex) => currentIndex - 1)}
            >
              <ArrowLeft size={19} />上一題
            </button>
            {index < questions.length - 1 ? (
              <button
                className="button button-primary"
                onClick={() => setIndex((currentIndex) => currentIndex + 1)}
              >
                下一題<ArrowRight size={19} />
              </button>
            ) : (
              <button className="button button-danger" onClick={attemptSubmit}>
                交卷<ListChecks size={19} />
              </button>
            )}
          </div>
        </section>

        <aside className="question-navigator" aria-label="作答導覽">
          <div className="navigator-heading">
            <div>
              <span>作答進度</span>
              <strong>{questions.length - unanswered} / {questions.length}</strong>
            </div>
            <button className="submit-link" onClick={attemptSubmit}>提前交卷</button>
          </div>
          <div className="question-grid">
            {questions.map((question, questionIndex) => (
              <button
                key={question.id}
                className={[
                  questionIndex === index ? "is-current" : "",
                  answers[questionIndex] !== null ? "is-answered" : "",
                  flags.has(questionIndex) ? "is-flagged" : "",
                ].join(" ")}
                onClick={() => setIndex(questionIndex)}
                aria-label={`第 ${questionIndex + 1} 題${answers[questionIndex] !== null ? "，已作答" : "，未作答"}`}
              >
                {questionIndex + 1}
              </button>
            ))}
          </div>
          <div className="navigator-legend">
            <span><i className="legend-current" />目前</span>
            <span><i className="legend-answered" />已答</span>
            <span><i className="legend-flagged" />標記</span>
          </div>
        </aside>
      </div>
      {confirmSubmit && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setConfirmSubmit(false)}>
          <section
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="submit-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <Warning size={38} weight="fill" />
            <h2 id="submit-title">還有 {unanswered} 題未作答</h2>
            <p>未作答題會以答錯計分。你可以回到考卷補答，或直接交卷。</p>
            <div>
              <button className="button button-secondary" onClick={() => setConfirmSubmit(false)}>
                繼續作答
              </button>
              <button className="button button-danger" onClick={onSubmit}>仍要交卷</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function PracticeScreen({
  question,
  selection,
  revealed,
  resultCount,
  filters,
  favorite,
  wrongCount,
  onFiltersChange,
  onAnswer,
  onNext,
  onToggleFavorite,
  onHome,
}: {
  question: Question | null;
  selection: number | null;
  revealed: boolean;
  resultCount: number;
  filters: PracticeFilters;
  favorite: boolean;
  wrongCount: number;
  onFiltersChange: (filters: PracticeFilters) => void;
  onAnswer: (answer: number) => void;
  onNext: () => void;
  onToggleFavorite: () => void;
  onHome: () => void;
  storageAvailable: boolean;
}) {
  return (
    <main className="app-shell">
      <AppHeader
        title="隨機練習"
        onHome={onHome}
        aside={<span className="result-count">符合 {resultCount} 題</span>}
      />
      <div className="practice-layout">
        <aside className="filter-panel">
          <div className="filter-title"><FunnelSimple size={21} weight="fill" />練習篩選</div>
          <label>
            <span>四大分類</span>
            <select
              value={filters.category}
              onChange={(event) =>
                onFiltersChange({ ...filters, category: event.target.value as PracticeFilters["category"] })
              }
            >
              <option>全部</option>
              <option>正確觀念與態度</option>
              <option>主動停讓文化</option>
              <option>安全駕駛能力</option>
              <option>危險感知能力</option>
            </select>
          </label>
          <label>
            <span>題目類型</span>
            <select
              value={filters.kind}
              onChange={(event) =>
                onFiltersChange({ ...filters, kind: event.target.value as PracticeFilters["kind"] })
              }
            >
              <option value="全部">全部</option>
              <option value="regular">一般題</option>
              <option value="context">情境圖片</option>
              <option value="video">危險感知影片</option>
            </select>
          </label>
          <label className="search-field">
            <span>關鍵字或題號</span>
            <div><MagnifyingGlass size={18} /><input value={filters.search} onChange={(event) => onFiltersChange({ ...filters, search: event.target.value })} placeholder="例：停讓、號誌" /></div>
          </label>
          <label className="check-row">
            <input type="checkbox" checked={filters.favoritesOnly} onChange={(event) => onFiltersChange({ ...filters, favoritesOnly: event.target.checked })} />
            <span>只看收藏</span>
          </label>
          <label className="check-row">
            <input type="checkbox" checked={filters.wrongOnly} onChange={(event) => onFiltersChange({ ...filters, wrongOnly: event.target.checked })} />
            <span>只看錯題</span>
          </label>
          <button className="reset-filter" onClick={() => onFiltersChange(defaultFilters)}>清除所有篩選</button>
        </aside>

        <section className="question-panel practice-question">
          {!question ? (
            <div className="empty-state">
              <MagnifyingGlass size={42} />
              <h2>找不到符合的題目</h2>
              <p>放寬分類、類型或關鍵字後再試一次。</p>
              <button className="button button-secondary" onClick={() => onFiltersChange(defaultFilters)}>清除篩選</button>
            </div>
          ) : (
            <>
              <QuestionTopline
                question={question}
                action={
                  <button className={`flag-button ${favorite ? "is-active" : ""}`} onClick={onToggleFavorite} aria-pressed={favorite}>
                    <BookmarkSimple size={19} weight={favorite ? "fill" : "regular"} />
                    {favorite ? "已收藏" : "收藏"}
                  </button>
                }
              />
              <QuestionContent
                question={question}
                selected={selection}
                revealed={revealed}
                onSelect={onAnswer}
              />
              {revealed && (
                <div className={`answer-feedback ${selection === question.answerIndex ? "is-correct" : "is-wrong"}`} role="status">
                  {selection === question.answerIndex ? <CheckCircle size={25} weight="fill" /> : <XCircle size={25} weight="fill" />}
                  <div>
                    <strong>{selection === question.answerIndex ? "答對了" : "這題答錯了"}</strong>
                    <span>正確答案：{String.fromCharCode(65 + question.answerIndex)}．{question.options[question.answerIndex]}</span>
                    <small>來源：{question.source.file} 第 {question.source.page} 頁{wrongCount > 0 ? `・累計錯 ${wrongCount} 次` : ""}</small>
                  </div>
                </div>
              )}
              <div className="question-actions single-action">
                <button className="button button-primary" onClick={onNext}>
                  隨機下一題<Shuffle size={19} weight="bold" />
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function QuestionTopline({
  question,
  index,
  total,
  action,
}: {
  question: Question;
  index?: number;
  total?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="question-topline">
      <div className="question-tags">
        {index !== undefined && total !== undefined && <strong>第 {index + 1} / {total} 題</strong>}
        <span>{kindLabels[question.kind]}</span>
        <span>{question.category}</span>
        <small>來源 #{question.sourceNumber}</small>
      </div>
      {action}
    </div>
  );
}

function QuestionContent({
  question,
  selected,
  revealed = false,
  onSelect,
}: {
  question: Question;
  selected: number | null;
  revealed?: boolean;
  onSelect: (answer: number) => void;
}) {
  return (
    <div className="question-content">
      {question.kind === "video" && question.videoUrl && (
        <div className="video-frame">
          <iframe
            src={question.videoUrl}
            title={`危險感知影片 ${question.videoId ?? question.sourceNumber}`}
            loading="lazy"
            allow="autoplay; fullscreen"
            allowFullScreen
          />
          <a href={question.videoUrl} target="_blank" rel="noreferrer">
            <PlayCircle size={18} />開啟官方影片<ArrowSquareOut size={15} />
          </a>
        </div>
      )}
      {question.promptImages.length > 0 && (
        <div className={`prompt-images ${question.promptImages.length > 1 ? "is-grid" : ""}`}>
          {question.promptImages.map((image, index) => (
            <a key={image} href={image} target="_blank" rel="noreferrer" aria-label="開啟原尺寸題目圖片">
              <img src={image} alt={`題目插圖 ${index + 1}`} />
            </a>
          ))}
        </div>
      )}
      <h1>{question.prompt}</h1>
      <div className="option-list" role="radiogroup" aria-label="答案選項">
        {question.options.map((option, answerIndex) => {
          const isSelected = selected === answerIndex;
          const isCorrect = revealed && question.answerIndex === answerIndex;
          const isWrongSelection = revealed && isSelected && !isCorrect;
          return (
            <button
              key={`${question.id}-${answerIndex}`}
              className={[
                "option-button",
                isSelected ? "is-selected" : "",
                isCorrect ? "is-correct" : "",
                isWrongSelection ? "is-wrong" : "",
              ].join(" ")}
              onClick={() => onSelect(answerIndex)}
              role="radio"
              aria-checked={isSelected}
              disabled={revealed}
            >
              <span className="option-letter">{String.fromCharCode(65 + answerIndex)}</span>
              {question.optionImages[answerIndex] ? (
                <img src={question.optionImages[answerIndex]} alt={`選項 ${answerIndex + 1}`} />
              ) : null}
              <span>{option}</span>
              {isCorrect && <CheckCircle className="option-status" size={24} weight="fill" />}
              {isWrongSelection && <XCircle className="option-status" size={24} weight="fill" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ResultScreen({
  result,
  passingScore,
  onRetry,
  onPractice,
  onHome,
}: {
  result: ExamResult;
  passingScore: number;
  onRetry: () => void;
  onPractice: () => void;
  onHome: () => void;
  storageAvailable: boolean;
}) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const grouped = useMemo(() => {
    const map = new Map<string, { correct: number; total: number }>();
    result.questions.forEach((question, index) => {
      const item = map.get(question.category) ?? { correct: 0, total: 0 };
      item.total += 1;
      if (result.answers[index] === question.answerIndex) item.correct += 1;
      map.set(question.category, item);
    });
    return [...map.entries()];
  }, [result]);

  return (
    <main className="app-shell result-shell">
      <AppHeader title="本次成績" onHome={onHome} />
      <section className={`score-panel ${result.passed ? "is-pass" : "is-fail"}`}>
        <div className="score-icon">
          {result.passed ? <ShieldCheck size={52} weight="fill" /> : <Warning size={52} weight="fill" />}
        </div>
        <p className="eyebrow">{result.passed ? "考試通過" : "還差一點"}</p>
        <h1>{result.score}<small> 分</small></h1>
        <p>答對 {result.correct} / {result.questions.length} 題・及格標準 {passingScore} 分</p>
        <div className="score-actions">
          <button className="button button-primary" onClick={onRetry}>再考一回<ArrowRight size={19} /></button>
          <button className="button button-secondary" onClick={onPractice}>練習本次錯題<Shuffle size={19} /></button>
        </div>
      </section>
      <section className="breakdown-panel">
        <div className="section-heading">
          <div><p className="eyebrow">能力分析</p><h2>分類作答表現</h2></div>
          <button className="button button-ghost" onClick={() => setReviewOpen((current) => !current)}>
            {reviewOpen ? "收合逐題檢討" : "展開逐題檢討"}
          </button>
        </div>
        <div className="breakdown-grid">
          {grouped.map(([category, score]) => {
            const percent = Math.round((score.correct / score.total) * 100);
            return (
              <article key={category}>
                <span>{category}</span>
                <strong>{score.correct} / {score.total}</strong>
                <div className="bar"><i style={{ width: `${percent}%` }} /></div>
                <small>{percent}%</small>
              </article>
            );
          })}
        </div>
        {reviewOpen && (
          <div className="review-list">
            {result.questions.map((question, index) => {
              const answer = result.answers[index];
              const correct = answer === question.answerIndex;
              return (
                <details key={question.id} className={correct ? "review-correct" : "review-wrong"}>
                  <summary>
                    {correct ? <CheckCircle size={20} weight="fill" /> : <XCircle size={20} weight="fill" />}
                    <span>第 {index + 1} 題</span>
                    <strong>{question.prompt}</strong>
                  </summary>
                  <div>
                    <p>你的答案：{answer === null ? "未作答" : `${String.fromCharCode(65 + answer)}．${question.options[answer]}`}</p>
                    <p>正確答案：{String.fromCharCode(65 + question.answerIndex)}．{question.options[question.answerIndex]}</p>
                    <small>來源：{question.source.file} 第 {question.source.page} 頁</small>
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
