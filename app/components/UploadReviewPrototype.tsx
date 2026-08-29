"use client";

import { useMemo, useState } from "react";
import { AppIcon } from "./AppIcon";

type UploadDraft = {
  id: string;
  fileName: string;
  pages: number;
  title: string;
  course: string;
  week: string;
  instructor: string;
  confidence: "high" | "review";
};

const initialDrafts: UploadDraft[] = [
  { id: "glycolysis", fileName: "Carbohydrate Structure and Glycolysis.pdf", pages: 48, title: "Carbohydrate Structure and Glycolysis", course: "MCF", week: "3", instructor: "Katherine Mitsouras", confidence: "high" },
  { id: "pharm", fileName: "Introduction to Pharmacology II.pdf", pages: 61, title: "Introduction to Pharmacology — II", course: "MCF", week: "3", instructor: "Sandeep Vansal", confidence: "high" },
  { id: "chromatin", fileName: "Biochemistry_Nucleic_Acid_Chromatin.pdf", pages: 37, title: "Biochemistry — Nucleic Acid and Chromatin Structure", course: "MCF", week: "", instructor: "Peter J. Huwe", confidence: "review" },
];

const courses = ["MCF", "IMD", "Hem Onc"];
const instructors = ["Peter J. Huwe", "Katherine Mitsouras", "Caroline E. Rinaldi", "Sandeep Vansal"];

export function UploadReviewPrototype() {
  const [drafts, setDrafts] = useState(initialDrafts);
  const readyCount = useMemo(() => drafts.filter((draft) => draft.course && draft.week && draft.instructor).length, [drafts]);
  const canFinalize = readyCount === drafts.length;

  function updateDraft(id: string, changes: Partial<UploadDraft>) {
    setDrafts((current) => current.map((draft) => draft.id === id ? { ...draft, ...changes } : draft));
  }

  return <section className="upload-review-prototype" aria-label="Add lectures review prototype">
    <header className="upload-review-header">
      <div><h2>Review</h2></div>
      <button className="upload-review-close" aria-label="Close upload review"><AppIcon name="x"/></button>
    </header>

    <div className="upload-review-toolbar">
      <div><strong>{drafts.length} lectures</strong></div>
      <button aria-label="Add more PDFs"><AppIcon name="upload"/></button>
    </div>

    <div className="upload-review-list">
      {drafts.map((draft) => {
        return <article className="upload-review-row" key={draft.id}>
          <div className="upload-review-file">
            <div><small>{draft.fileName} · {draft.pages} pages</small><input aria-label={`Lecture title for ${draft.fileName}`} value={draft.title} onChange={(event) => updateDraft(draft.id, { title: event.target.value })}/></div>
          </div>
          <div className="upload-review-fields">
            <label><span>Course</span><select aria-label={`Course for ${draft.title}`} value={draft.course} onChange={(event) => updateDraft(draft.id, { course: event.target.value })}><option value="">Select course</option>{courses.map((course) => <option key={course}>{course}</option>)}<option value="new">Add a new course…</option></select></label>
            <label><span>Week</span><select aria-label={`Week for ${draft.title}`} className={!draft.week ? "field-needed" : ""} value={draft.week} onChange={(event) => updateDraft(draft.id, { week: event.target.value, confidence: "high" })}><option value="">Select week</option>{Array.from({ length: 12 }, (_, week) => <option key={week + 1} value={week + 1}>Week {week + 1}</option>)}</select></label>
            <label><span>Instructor</span><select aria-label={`Instructor for ${draft.title}`} value={draft.instructor} onChange={(event) => updateDraft(draft.id, { instructor: event.target.value })}><option value="">Select instructor</option>{instructors.map((instructor) => <option key={instructor}>{instructor}</option>)}<option value="new">Add a new instructor…</option></select></label>
          </div>
          <div className="upload-review-row-status"><button aria-label={`Remove ${draft.fileName}`} onClick={() => setDrafts((current) => current.filter((item) => item.id !== draft.id))}><AppIcon name="trash"/></button></div>
        </article>;
      })}
    </div>

    <footer className="upload-review-footer">
      <div><button className="upload-review-cancel">Cancel</button><button className="upload-review-finalize" disabled={!canFinalize}>Finalize</button></div>
    </footer>
  </section>;
}
