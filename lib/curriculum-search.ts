import type { Lecture, PreRead } from "./lecture-store";
import { lectureDateTimestamp } from "./curriculum";

export type SearchKind = "lecture" | "slo" | "slide" | "preread";

export type LectureSearchResult = {
  kind: "lecture" | "slo" | "slide";
  lecture: Lecture;
  title: string;
  text: string;
  score: number;
  page?: number;
  sloIndex?: number;
};

export type PreReadSearchResult = {
  kind: "preread";
  preRead: PreRead;
  title: string;
  text: string;
  score: number;
  page?: number;
};

export type SearchResult = LectureSearchResult | PreReadSearchResult;

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

export function searchResultTimestamp(result: SearchResult) {
  return result.kind === "preread" ? Date.parse(result.preRead.createdAt) || 0 : lectureDateTimestamp(result.lecture.date);
}

export function searchResultCollectionTitle(result: SearchResult) {
  return result.kind === "preread" ? result.preRead.title : result.lecture.title;
}

