import type { Lecture } from "./lecture-store";

export type ImportQualitySeverity = "error" | "warning";
export type ImportDuplicateLocation = "library" | "batch";

export type ImportDuplicateMatch = {
  lectureId: string;
  title: string;
  location: ImportDuplicateLocation;
  reason: string;
};

export type ImportQualityIssue = {
  code: "missing-pages" | "incomplete-pages" | "no-text" | "sparse-text" | "no-slos" | "ai-fallback" | "duplicate";
  severity: ImportQualitySeverity;
  message: string;
};

export type ImportQualityReport = {
  issues: ImportQualityIssue[];
  duplicates: ImportDuplicateMatch[];
  blocksFinalization: boolean;
};

type ImportQualityInput = {
  lecture: Lecture;
  fileName: string;
  aiFailed?: boolean;
  library: Lecture[];
  batch: Lecture[];
};

function normalizedText(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizedFileName(value: string) {
  return normalizedText(value.replace(/\.pdf$/i, "").replace(/\s*(?:\(\d+\)|copy)\s*$/i, ""));
}

function lectureText(lecture: Lecture) {
  return normalizedText(lecture.slides.map((slide) => slide.text).join(" ")).slice(0, 60_000);
}

function contentTokens(value: string) {
  return new Set(value.split(" ").filter((token) => token.length >= 4).slice(0, 8_000));
}

function contentSimilarity(left: string, right: string) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftTokens = contentTokens(left);
  const rightTokens = contentTokens(right);
  if (leftTokens.size < 40 || rightTokens.size < 40) return 0;
  let intersection = 0;
  leftTokens.forEach((token) => { if (rightTokens.has(token)) intersection += 1; });
  return intersection / Math.max(leftTokens.size, rightTokens.size);
}

function duplicateReason(candidate: Lecture, candidateFileName: string, other: Lecture) {
  const samePages = candidate.pages === other.pages;
  const otherFileName = other.fileName ?? "";
  if (samePages && normalizedFileName(candidateFileName) && normalizedFileName(candidateFileName) === normalizedFileName(otherFileName)) return "same PDF filename and page count";

  const candidateContent = lectureText(candidate);
  const otherContent = lectureText(other);
  const similarity = contentSimilarity(candidateContent, otherContent);
  if (samePages && candidateContent.length >= 80 && similarity >= .97) return "matching slide text and page count";
  if (Math.abs(candidate.pages - other.pages) <= 1 && candidateContent.length >= 600 && similarity >= .9) return "very similar slide text";

  const sameTitle = normalizedText(candidate.title) === normalizedText(other.title) && normalizedText(candidate.title).length >= 8;
  const sameCourse = normalizedText(candidate.course) === normalizedText(other.course);
  if (samePages && sameTitle && sameCourse) return "same title, course, and page count";
  return "";
}

export function findImportDuplicates(candidate: Lecture, fileName: string, library: Lecture[], batch: Lecture[]) {
  const seen = new Set<string>();
  const matches: ImportDuplicateMatch[] = [];
  const inspect = (other: Lecture, location: ImportDuplicateLocation) => {
    if (other.id === candidate.id || seen.has(other.id)) return;
    const reason = duplicateReason(candidate, fileName, other);
    if (!reason) return;
    seen.add(other.id);
    matches.push({ lectureId: other.id, title: other.title, location, reason });
  };
  library.forEach((lecture) => inspect(lecture, "library"));
  batch.forEach((lecture) => inspect(lecture, "batch"));
  return matches;
}

export function assessImportQuality({ lecture, fileName, aiFailed = false, library, batch }: ImportQualityInput): ImportQualityReport {
  const issues: ImportQualityIssue[] = [];
  const uniquePages = new Set(lecture.slides.map((slide) => slide.page).filter((page) => Number.isInteger(page) && page > 0));
  const readablePages = lecture.slides.filter((slide) => normalizedText(slide.text).length >= 20).length;
  const totalText = lecture.slides.reduce((total, slide) => total + normalizedText(slide.text).length, 0);

  if (lecture.pages < 1) issues.push({ code: "missing-pages", severity: "error", message: "The PDF contains no readable pages." });
  else if (uniquePages.size < lecture.pages) issues.push({ code: "incomplete-pages", severity: "error", message: `Only ${uniquePages.size} of ${lecture.pages} pages were extracted.` });

  if (totalText < 20) issues.push({ code: "no-text", severity: "error", message: "No readable slide text was extracted. The PDF may be scanned or protected." });
  else if (lecture.pages >= 4 && readablePages / lecture.pages < .25) issues.push({ code: "sparse-text", severity: "warning", message: `Readable text was found on only ${readablePages} of ${lecture.pages} pages.` });

  if (!lecture.slos.length) issues.push({ code: "no-slos", severity: "warning", message: "No SLOs were detected." });
  if (aiFailed) issues.push({ code: "ai-fallback", severity: "warning", message: "AI analysis was unavailable. Review the title, course, and instructor." });

  const duplicates = findImportDuplicates(lecture, fileName, library, batch);
  duplicates.slice(0, 3).forEach((match) => issues.push({
    code: "duplicate",
    severity: "warning",
    message: `Possible duplicate of “${match.title}” ${match.location === "library" ? "already in the library" : "in this batch"} (${match.reason}).`,
  }));

  return { issues, duplicates, blocksFinalization: issues.some((issue) => issue.severity === "error") };
}
