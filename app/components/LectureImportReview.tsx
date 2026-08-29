"use client";

import { LECTURE_WEEK_OPTIONS, lectureWeekLabel } from "../../lib/curriculum";
import type { Lecture } from "../../lib/lecture-store";
import { AppIcon } from "./AppIcon";

export type LectureImportStatus = "queued" | "extracting" | "analyzing" | "ready" | "error";

export type LectureImportJob = {
  id: string;
  name: string;
  file: File;
  status: LectureImportStatus;
  lecture?: Lecture;
  error?: string;
  aiFailed?: boolean;
};

const statusLabel: Record<LectureImportStatus, string> = {
  queued: "Waiting",
  extracting: "Extracting PDF",
  analyzing: "Processing",
  ready: "Ready for review",
  error: "Processing failed",
};

function courseNeedsReview(value: string) { return !value.trim() || value.trim().toLowerCase() === "unsorted"; }
function instructorNeedsReview(value: string) { return !value.trim() || /not detected/i.test(value); }

export function LectureImportReview({ jobs, courses, instructors, finalizing, onUpdate, onRemove, onAddMore, onClose, onFinalize }: {
  jobs: LectureImportJob[];
  courses: string[];
  instructors: string[];
  finalizing: boolean;
  onUpdate(id: string, changes: Partial<Lecture>): void;
  onRemove(id: string): void;
  onAddMore(): void;
  onClose(): void;
  onFinalize(): void;
}) {
  const ready = jobs.length > 0 && jobs.every((job) => job.status === "ready" && job.lecture && job.lecture.title.trim() && !courseNeedsReview(job.lecture.course) && !instructorNeedsReview(job.lecture.lecturer) && job.lecture.week !== null);

  return <div className="live-upload-backdrop" role="presentation">
    <section className="upload-review-prototype upload-review-live" role="dialog" aria-modal="true" aria-label="Review lecture imports">
      <header className="upload-review-header">
        <h2>Review</h2>
        <button className="upload-review-close" aria-label="Close review" onClick={onClose}><AppIcon name="x"/></button>
      </header>

      <div className="upload-review-toolbar">
        <div><strong>{jobs.length} {jobs.length === 1 ? "lecture" : "lectures"}</strong></div>
        <button aria-label="Add more PDFs" onClick={onAddMore}><AppIcon name="upload"/></button>
      </div>

      <datalist id="import-course-options">{courses.map((course) => <option key={course} value={course}/>)}</datalist>
      <datalist id="import-instructor-options">{instructors.map((instructor) => <option key={instructor} value={instructor}/>)}</datalist>

      <div className="upload-review-list">
        {jobs.map((job) => {
          const lecture = job.lecture;
          const processed = job.status === "ready" && lecture;
          return <article className="upload-review-row" key={job.id}>
            <div className="upload-review-file">
              <div>
                <small>{job.name}{lecture ? ` · ${lecture.pages} pages` : ""}</small>
                {processed ? <input aria-label={`Lecture title for ${job.name}`} value={lecture.title} onChange={(event) => onUpdate(job.id, { title: event.target.value })}/> : <strong className={job.status === "error" ? "upload-review-error" : "upload-review-processing"}>{job.error || statusLabel[job.status]}</strong>}
              </div>
            </div>
            <div className="upload-review-fields">
              <label><span>Course</span><input aria-label={`Course for ${job.name}`} list="import-course-options" disabled={!processed} className={processed && courseNeedsReview(lecture.course) ? "field-needed" : ""} value={lecture?.course ?? ""} onChange={(event) => onUpdate(job.id, { course: event.target.value })}/></label>
              <label><span>Week</span><select aria-label={`Week for ${job.name}`} disabled={!processed} className={processed && lecture.week === null ? "field-needed" : ""} value={lecture?.week ?? ""} onChange={(event) => onUpdate(job.id, { week: event.target.value ? Number(event.target.value) : null })}><option value="">Select week</option>{LECTURE_WEEK_OPTIONS.map((week) => <option key={week} value={week}>{lectureWeekLabel(week)}</option>)}</select></label>
              <label><span>Instructor</span><input aria-label={`Instructor for ${job.name}`} list="import-instructor-options" disabled={!processed} className={processed && instructorNeedsReview(lecture.lecturer) ? "field-needed" : ""} value={lecture?.lecturer ?? ""} onChange={(event) => onUpdate(job.id, { lecturer: event.target.value })}/></label>
            </div>
            <div className="upload-review-row-status"><button aria-label={`Remove ${job.name}`} onClick={() => onRemove(job.id)}><AppIcon name="trash"/></button></div>
          </article>;
        })}
      </div>

      <footer className="upload-review-footer"><div><button className="upload-review-cancel" onClick={onClose}>Cancel</button><button className="upload-review-finalize" disabled={!ready || finalizing} onClick={onFinalize}>{finalizing ? "Finalizing…" : "Finalize"}</button></div></footer>
    </section>
  </div>;
}
