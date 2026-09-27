import type { Lecture } from "./lecture-store.ts";
import { lectureHasQuizText } from "./exam-sources.ts";

export type ExamLectureFilters = { query: string; course: string; week: string; instructor: string };

export function filterExamLectures(lectures: Lecture[], filters: ExamLectureFilters) {
  const needle = filters.query.trim().toLowerCase();
  return lectures.filter((lecture) => filters.course === "all" || lecture.course === filters.course)
    .filter((lecture) => filters.week === "all" || (filters.week === "unassigned" ? lecture.week === null : lecture.week === Number(filters.week)))
    .filter((lecture) => filters.instructor === "all" || lecture.lecturer === filters.instructor)
    .filter((lecture) => !needle || `${lecture.title} ${lecture.course} ${lecture.lecturer} ${lecture.academicYear}`.toLowerCase().includes(needle))
    .sort((a, b) => a.course.localeCompare(b.course) || (b.week ?? -1) - (a.week ?? -1) || b.academicYear.localeCompare(a.academicYear) || a.title.localeCompare(b.title));
}

export function changeExamSelection(current: Set<string>, ids: string[], eligibleIds: Set<string>, checked: boolean) {
  const next = new Set(current);
  for (const id of ids) {
    if (!eligibleIds.has(id)) continue;
    if (checked) next.add(id);
    else next.delete(id);
  }
  return next;
}

export function examSelectableLectureIds(lectures: Lecture[]) {
  return new Set(lectures.filter(lectureHasQuizText).map((lecture) => lecture.id));
}
