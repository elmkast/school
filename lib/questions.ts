import type { QuestionRecord, QuestionSourceKind, QuestionType } from "./lecture-store";

export type QuestionDraft = {
  id: string;
  sourceKind: QuestionSourceKind;
  sourceLectureId?: string;
  sourcePreReadId?: string;
  sourceSloIndexes: number[];
  type: QuestionType;
  prompt: string;
  options: string[];
  answer: string;
  explanation: string;
  topic: string;
  sourcePages: number[];
  approved: boolean;
};

export type QuizQuestion = {
  key: string;
  ownerKind: "lecture" | "preread";
  ownerId: string;
  lectureId: string;
  lectureTitle: string;
  lecturer: string;
  course: string;
  week: number | null;
  question: QuestionRecord;
};

export type QuizResponse = {
  response: string;
  submitted: boolean;
  correct: boolean | null;
  ruledOut?: string[];
};

export type QuizMode = "taking" | "results" | "review";

export type SavedQuizSession = {
  version: 1;
  savedAt: string;
  questions: QuizQuestion[];
  responses: Record<string, QuizResponse>;
  index: number;
};

const SAVED_QUIZ_KEY = "fcom-lib-saved-quiz-v1";

export function loadSavedQuiz(): SavedQuizSession | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SAVED_QUIZ_KEY) ?? "null") as SavedQuizSession | null;
    return parsed?.version === 1 && Array.isArray(parsed.questions) && parsed.questions.length > 0 ? parsed : null;
  } catch { return null; }
}

export function saveQuizForLater(session: Omit<SavedQuizSession, "version" | "savedAt">) {
  if (typeof window === "undefined") return null;
  const saved: SavedQuizSession = { ...session, version: 1, savedAt: new Date().toISOString() };
  window.localStorage.setItem(SAVED_QUIZ_KEY, JSON.stringify(saved));
  return saved;
}

export function clearSavedQuiz() {
  if (typeof window !== "undefined") window.localStorage.removeItem(SAVED_QUIZ_KEY);
}

export function shuffleItems<T>(items: T[]) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const random = new Uint32Array(1);
    crypto.getRandomValues(random);
    const target = random[0] % (index + 1);
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}
