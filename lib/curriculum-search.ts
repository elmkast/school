import type { Lecture } from "./lecture-store";
import { lectureWeekValue } from "./curriculum";

export type SearchKind = "lecture" | "slo" | "slide";

export type LectureSearchResult = {
  kind: "lecture" | "slo" | "slide";
  lecture: Lecture;
  title: string;
  text: string;
  score: number;
  page?: number;
  sloIndex?: number;
};

export type SearchResult = LectureSearchResult;

export function searchMatchScore(needle: string, title: string, body: string) {
  const normalizedTitle = title.toLowerCase();
  const normalizedBody = body.toLowerCase();
  let score = 0;
  if (normalizedTitle === needle) score += 100;
  else if (normalizedTitle.startsWith(needle)) score += 60;
  else if (normalizedTitle.includes(needle)) score += 40;
  if (normalizedBody.includes(needle)) score += 25;
  for (const token of needle.split(/\s+/).filter((value) => value.length > 1)) {
    if (normalizedTitle.includes(token)) score += 8;
    if (normalizedBody.includes(token)) score += 3;
  }
  return score;
}

export function searchResultWeek(result: SearchResult) {
  return lectureWeekValue(result.lecture.week) ?? Number.POSITIVE_INFINITY;
}

export function searchResultCollectionTitle(result: SearchResult) {
  return result.lecture.title;
}
