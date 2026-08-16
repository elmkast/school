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
  sourcePages: number[];
  approved: boolean;
};

export type QuizQuestion = {
  key: string;
  lectureId: string;
  lectureTitle: string;
  lecturer: string;
  question: QuestionRecord;
};

export type QuizResponse = {
  response: string;
  submitted: boolean;
  correct: boolean | null;
};

export type QuizMode = "taking" | "results" | "review";

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
