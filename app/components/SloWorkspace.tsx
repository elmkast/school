"use client";

import { LECTURE_WEEK_OPTIONS, lectureWeekLabel } from "../../lib/curriculum";
import type { Lecture } from "../../lib/lecture-store";
import { AppIcon } from "./AppIcon";

export function SloWorkspace({ lectures, courses, instructors, courseFilter, weekFilter, instructorFilter, viewFilter, sort, onCourseFilter, onWeekFilter, onInstructorFilter, onViewFilter, onSort, onExport, onToggleFlag, onReparse, onOpenLecture }: {
  lectures: Lecture[];
  courses: string[];
  instructors: string[];
  courseFilter: string;
  weekFilter: string;
  instructorFilter: string;
  viewFilter: "all" | "flagged";
  sort: "week-asc" | "name-asc";
  onCourseFilter(value: string): void;
  onWeekFilter(value: string): void;
  onInstructorFilter(value: string): void;
  onViewFilter(value: "all" | "flagged"): void;
  onSort(value: "week-asc" | "name-asc"): void;
  onExport(): void;
  onToggleFlag(lectureId: string, objectiveIndex: number): void;
  onReparse(lectureId: string): void;
  onOpenLecture(lecture: Lecture): void;
}) {
  return <section className="slo-review-prototype slo-review-live" aria-label="Session learning objectives">
    <header className="slo-review-header"><h2>Session learning objectives</h2><button className="slo-export" onClick={onExport}><AppIcon name="download"/>Export</button></header>
    <div className="slo-review-toolbar slo-review-toolbar-live">
      <label><span>Course</span><select value={courseFilter} onChange={(event) => onCourseFilter(event.target.value)}><option value="all">All courses</option>{courses.map((course) => <option key={course}>{course}</option>)}</select></label>
      <label><span>Week</span><select value={weekFilter} onChange={(event) => onWeekFilter(event.target.value)}><option value="all">All weeks</option>{LECTURE_WEEK_OPTIONS.map((week) => <option key={week} value={week}>Week {week}</option>)}<option value="unassigned">Unassigned</option></select></label>
      <label><span>Instructor</span><select value={instructorFilter} onChange={(event) => onInstructorFilter(event.target.value)}><option value="all">All instructors</option>{instructors.map((instructor) => <option key={instructor}>{instructor}</option>)}</select></label>
      <label><span>View</span><select value={viewFilter} onChange={(event) => onViewFilter(event.target.value as "all" | "flagged")}><option value="all">All objectives</option><option value="flagged">Flagged only</option></select></label>
      <label><span>Sort</span><select value={sort} onChange={(event) => onSort(event.target.value as "week-asc" | "name-asc")}><option value="week-asc">Week</option><option value="name-asc">Lecture name</option></select></label>
    </div>
    <div className="slo-review-list">
      {lectures.map((lecture) => {
        const objectives = lecture.slos.flatMap((objective, index) => viewFilter === "flagged" && !lecture.flaggedSLOs.includes(index) ? [] : [{ objective, index }]);
        return <article className="slo-lecture" key={lecture.id}>
          <header><div><small>{lecture.course} · {lectureWeekLabel(lecture.week)} · {lecture.lecturer}</small><h3>{lecture.title}</h3></div><div className="slo-lecture-actions"><button onClick={() => onReparse(lecture.id)}>Luna re-parse</button><button className="slo-open-lecture" onClick={() => onOpenLecture(lecture)}>Open lecture</button></div></header>
          <ol>{objectives.map(({ objective, index }) => <li key={`${index}-${objective}`}><span>{String(index + 1).padStart(2, "0")}</span><p>{objective}</p><button className={lecture.flaggedSLOs.includes(index) ? "flagged" : ""} aria-label={lecture.flaggedSLOs.includes(index) ? `Unflag SLO ${index + 1}` : `Flag SLO ${index + 1}`} onClick={() => onToggleFlag(lecture.id, index)}><AppIcon name="flag"/></button></li>)}</ol>
        </article>;
      })}
      {!lectures.length && <div className="slo-review-empty">No learning objectives match these filters.</div>}
    </div>
  </section>;
}
