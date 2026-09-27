import type { Lecture, Slide } from "./lecture-store.ts";

export const EXAM_UNIT_CHAR_LIMIT = 12_000;
export const EXAM_UNIT_PAGE_LIMIT = 12;
export const EXAM_EVIDENCE_CHAR_LIMIT = 900;
export const EXAM_TOPIC_LIMIT = 4;

export type ExamSlideSpanRef = { slideIndex: number; page: number; heading: string; start: number; end: number };
export type ExamSlideSpan = ExamSlideSpanRef & { text: string };
export type ExamSourceUnitRef = {
  id: string; sourceVersion: string; lectureId: string; lectureTitle: string; course: string;
  week: number | null; lecturer: string; academicYear: string; ordinal: number; characters: number;
  spans: ExamSlideSpanRef[];
};
/** Only materialize this bounded type immediately before a server request. */
export type ExamSourceUnit = Omit<ExamSourceUnitRef, "spans"> & { spans: ExamSlideSpan[] };
export type ExamSourceIndex = { units: ExamSourceUnitRef[]; lecturesById: Map<string, Lecture> };
export type ExamEvidence = ExamSlideSpan & { id: string; unitId: string; lectureId: string };

function fingerprintSegments(segments: Iterable<string>) {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (const segment of segments) {
    for (let index = 0; index < segment.length; index += 1) {
      const code = segment.charCodeAt(index);
      first = Math.imul(first ^ code, 0x01000193);
      second = Math.imul(second ^ code, 0x85ebca6b);
    }
    first = Math.imul(first ^ 31, 0x01000193);
    second = Math.imul(second ^ 31, 0x85ebca6b);
  }
  return (first >>> 0).toString(36) + (second >>> 0).toString(36);
}

async function fingerprintSlides(slides: Slide[], yieldProgress?: () => Promise<void>) {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  let scanned = 0;
  for (const slide of slides) {
    const segments = [String(slide.page), slide.heading, slide.text];
    for (const segment of segments) {
      for (let offset = 0; offset < segment.length; offset += 64_000) {
        const end = Math.min(segment.length, offset + 64_000);
        for (let index = offset; index < end; index += 1) {
          const code = segment.charCodeAt(index);
          first = Math.imul(first ^ code, 0x01000193);
          second = Math.imul(second ^ code, 0x85ebca6b);
        }
        scanned += end - offset;
        if (scanned >= 256_000 && yieldProgress) { scanned = 0; await yieldProgress(); }
      }
      first = Math.imul(first ^ 31, 0x01000193);
      second = Math.imul(second ^ 31, 0x85ebca6b);
    }
  }
  return (first >>> 0).toString(36) + (second >>> 0).toString(36);
}

export function lectureHasQuizText(lecture: Pick<Lecture, "slides">) {
  return lecture.slides.some((slide) => slide.text.trim().length >= 20);
}

function makeLectureUnits(lecture: Lecture, sourceVersion: string): ExamSourceUnitRef[] {
  const slides = [...lecture.slides].sort((a, b) => a.page - b.page);
  const units: ExamSourceUnitRef[] = [];
  let current: ExamSlideSpanRef[] = [];
  let characters = 0;
  let pages = new Set<number>();
  let ordinal = 0;
  const emit = () => {
    if (!current.length) return;
    const identity = lecture.id + ":" + sourceVersion + ":" + ordinal + ":" + current.map((span) => `${span.slideIndex}-${span.start}-${span.end}`).join(",");
    units.push({
      id: "unit-" + fingerprintSegments([identity]) + "-" + ordinal,
      sourceVersion, lectureId: lecture.id, lectureTitle: lecture.title, course: lecture.course,
      week: lecture.week, lecturer: lecture.lecturer, academicYear: lecture.academicYear,
      ordinal, characters, spans: current,
    });
    ordinal += 1;
    current = [];
    characters = 0;
    pages = new Set<number>();
  };
  slides.forEach((slide, slideIndex) => {
    if (!slide.text.length) return;
    const tocBoundary = lecture.toc.some((item) => item.page === slide.page);
    if (tocBoundary && pages.size >= 3 && characters >= 1_500) emit();
    for (let start = 0; start < slide.text.length; start += EXAM_UNIT_CHAR_LIMIT) {
      const end = Math.min(slide.text.length, start + EXAM_UNIT_CHAR_LIMIT);
      const pieceLength = end - start;
      if (current.length && (characters + pieceLength > EXAM_UNIT_CHAR_LIMIT || (!pages.has(slide.page) && pages.size >= EXAM_UNIT_PAGE_LIMIT))) emit();
      current.push({ slideIndex, page: slide.page, heading: slide.heading.slice(0, 200), start, end });
      characters += pieceLength;
      pages.add(slide.page);
      if (characters >= EXAM_UNIT_CHAR_LIMIT || pages.size >= EXAM_UNIT_PAGE_LIMIT) emit();
    }
  });
  emit();
  return units;
}

/** Creates only bounded source coordinates; slide text remains in the loaded library. */
export async function buildExamSourceIndex(
  lectures: Lecture[],
  options: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void; yieldToBrowser?: () => Promise<void> } = {},
): Promise<ExamSourceIndex> {
  const unique = new Map(lectures.map((lecture) => [lecture.id, lecture]));
  const selected = [...unique.values()];
  const units: ExamSourceUnitRef[] = [];
  const yieldToBrowser = options.yieldToBrowser ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  for (const [index, lecture] of selected.entries()) {
    if (options.signal?.aborted) throw new Error("Exam preparation cancelled.");
    const slides = [...lecture.slides].sort((a, b) => a.page - b.page);
    const sourceVersion = await fingerprintSlides(slides, yieldToBrowser);
    units.push(...makeLectureUnits(lecture, sourceVersion));
    options.onProgress?.(index + 1, selected.length);
    if (index % 8 === 7) await yieldToBrowser();
  }
  if (options.signal?.aborted) throw new Error("Exam preparation cancelled.");
  return { units, lecturesById: new Map(selected.map((lecture) => [lecture.id, lecture])) };
}

export function materializeExamSourceUnit(unit: ExamSourceUnitRef, lecture: Lecture | undefined): ExamSourceUnit {
  if (!lecture || lecture.id !== unit.lectureId) throw new Error("The lecture source is no longer available.");
  const slides = [...lecture.slides].sort((a, b) => a.page - b.page);
  const spans = unit.spans.map((span) => {
    const slide = slides[span.slideIndex];
    if (!slide || slide.page !== span.page || span.end > slide.text.length || span.end - span.start > EXAM_UNIT_CHAR_LIMIT) throw new Error("A lecture source changed during Exam Prep.");
    return { ...span, text: slide.text.slice(span.start, span.end) };
  });
  if (spans.reduce((sum, span) => sum + span.text.length, 0) !== unit.characters) throw new Error("A lecture source changed during Exam Prep.");
  return { ...unit, spans };
}

export function buildExamSourceManifest(lectures: Lecture[]) {
  const unique = new Map(lectures.map((lecture) => [lecture.id, lecture]));
  const units = [...unique.values()].flatMap((lecture) => {
    const slides = [...lecture.slides].sort((a, b) => a.page - b.page);
    const sourceVersion = fingerprintSegments(slides.flatMap((slide) => [String(slide.page), slide.heading, slide.text]));
    return makeLectureUnits(lecture, sourceVersion).map((unit) => materializeExamSourceUnit(unit, lecture));
  });
  return units;
}

export function examEvidenceForUnit(unit: ExamSourceUnit): ExamEvidence[] {
  return unit.spans.flatMap((span) => {
    const evidence: ExamEvidence[] = [];
    for (let offset = 0; offset < span.text.length; offset += EXAM_EVIDENCE_CHAR_LIMIT) {
      const localEnd = Math.min(span.text.length, offset + EXAM_EVIDENCE_CHAR_LIMIT);
      const text = span.text.slice(offset, localEnd);
      if (text.trim().length < 20) continue;
      const start = span.start + offset;
      const end = span.start + localEnd;
      evidence.push({ ...span, start, end, text, id: unit.id + ":" + span.slideIndex + ":" + span.page + ":" + start + "-" + end, unitId: unit.id, lectureId: unit.lectureId });
    }
    return evidence;
  });
}
