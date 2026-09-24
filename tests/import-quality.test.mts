import test from "node:test";
import assert from "node:assert/strict";
import { assessImportQuality, findImportDuplicates } from "../lib/import-quality.ts";
import type { Lecture } from "../lib/lecture-store.ts";

function lecture(overrides: Partial<Lecture> = {}): Lecture {
  return {
    id: crypto.randomUUID(), title: "Carbohydrate Structure and Glycolysis", lecturer: "Katherine Mitsouras", week: 2,
    course: "MCF", academicYear: "2026-2027", favorite: false, pages: 2, slos: ["Explain glycolysis."], outline: [], toc: [],
    summary: "A lecture.", slides: [{ page: 1, heading: "Glycolysis", text: "Glucose glycolysis pyruvate phosphofructokinase metabolism regulation energy adenosine triphosphate" }, { page: 2, heading: "Control", text: "Hexokinase glucokinase insulin liver muscle enzyme kinetics metabolism glucose regulation" }],
    notes: {}, markups: {}, markedSlides: [], flaggedSLOs: [], sloStrengths: {}, studySLOs: [], fileName: "glycolysis.pdf", createdAt: new Date().toISOString(),
    ...overrides,
  };
}

test("detects an existing lecture with the same normalized filename and page count", () => {
  const existing = lecture();
  const candidate = lecture({ id: crypto.randomUUID(), fileName: "glycolysis (1).pdf" });
  const matches = findImportDuplicates(candidate, candidate.fileName!, [existing], []);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].location, "library");
  assert.match(matches[0].reason, /filename/);
});

test("detects duplicate content inside the staged batch", () => {
  const other = lecture({ fileName: "lecture-a.pdf" });
  const candidate = lecture({ id: crypto.randomUUID(), fileName: "renamed.pdf", title: "A different generated title" });
  const matches = findImportDuplicates(candidate, candidate.fileName!, [], [other]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].location, "batch");
  assert.match(matches[0].reason, /slide text/);
});

test("blocks a PDF with missing pages or no extracted text", () => {
  const candidate = lecture({ pages: 3, slides: [{ page: 1, heading: "Slide 1", text: "" }], slos: [] });
  const report = assessImportQuality({ lecture: candidate, fileName: "scan.pdf", library: [], batch: [] });
  assert.equal(report.blocksFinalization, true);
  assert.ok(report.issues.some((issue) => issue.code === "incomplete-pages"));
  assert.ok(report.issues.some((issue) => issue.code === "no-text"));
});

test("warnings do not block a usable lecture", () => {
  const candidate = lecture({ slos: [] });
  const report = assessImportQuality({ lecture: candidate, fileName: "new.pdf", aiFailed: true, library: [], batch: [] });
  assert.equal(report.blocksFinalization, false);
  assert.ok(report.issues.some((issue) => issue.code === "no-slos"));
  assert.ok(report.issues.some((issue) => issue.code === "ai-fallback"));
});

