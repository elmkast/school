"use client";

import { useMemo, useState } from "react";
import { LECTURE_WEEK_OPTIONS, lectureWeekLabel } from "../../lib/curriculum";
import type { Lecture, SloStrength } from "../../lib/lecture-store";
import { AppIcon } from "./AppIcon";

type StudyObjective = { lecture:Lecture; index:number };

const strengthLabel: Record<SloStrength, string> = { weak:"Weak", okay:"O.K.", strong:"Strong" };

export function SloWorkspace({ lectures, studyObjectives, courses, instructors, courseFilter, weekFilter, instructorFilter, viewFilter, onCourseFilter, onWeekFilter, onInstructorFilter, onViewFilter, onExport, onTogglePriority, onStrengthChange, onSetStudySelection, onReparse, onOpenLecture }: {
  lectures: Lecture[];
  studyObjectives: StudyObjective[];
  courses: string[];
  instructors: string[];
  courseFilter: string;
  weekFilter: string;
  instructorFilter: string;
  viewFilter: "all" | "flagged";
  onCourseFilter(value: string): void;
  onWeekFilter(value: string): void;
  onInstructorFilter(value: string): void;
  onViewFilter(value: "all" | "flagged"): void;
  onExport(): void;
  onTogglePriority(lectureId: string, objectiveIndex: number): void;
  onStrengthChange(lectureId: string, objectiveIndex: number, strength: SloStrength): void;
  onSetStudySelection(items: Array<{ lectureId:string; index:number }>, selected:boolean): void;
  onReparse(lectureId: string): void;
  onOpenLecture(lecture: Lecture): void;
}) {
  const [studyOpen, setStudyOpen] = useState(false);
  const [studyIndex, setStudyIndex] = useState(0);
  const priorityOnly = viewFilter === "flagged";
  const visibleObjectives = useMemo(() => lectures.flatMap((lecture) => lecture.slos.flatMap((text, index) => priorityOnly && !lecture.flaggedSLOs.includes(index) ? [] : [{ lecture, index, text, strength:lecture.sloStrengths[index] ?? "okay" as SloStrength }])), [lectures, priorityOnly]);
  const visibleRefs = useMemo(() => visibleObjectives.map(({ lecture, index }) => ({ lectureId:lecture.id, index })), [visibleObjectives]);
  const allVisibleSelected = visibleObjectives.length > 0 && visibleObjectives.every(({ lecture, index }) => lecture.studySLOs.includes(index));
  const currentStudyIndex = Math.min(studyIndex, Math.max(0, studyObjectives.length - 1));
  const currentStudyObjective = studyObjectives[currentStudyIndex];

  return <section className="slo-study-prototype slo-board-proposal slo-board-live" aria-label="Session learning objectives">
    <header className="slo-study-header">
      <div><h2>Session learning objectives</h2><span>{studyObjectives.length} in study set</span></div>
      <div className="slo-study-header-actions">
        <button type="button" className={priorityOnly ? "secondary active" : "secondary"} aria-pressed={priorityOnly} onClick={() => onViewFilter(priorityOnly ? "all" : "flagged")}>Priority only</button>
        <button type="button" className="secondary" onClick={onExport}>Export</button>
        {studyObjectives.length > 0 && <button type="button" className="secondary" onClick={() => onSetStudySelection(studyObjectives.map(({ lecture, index }) => ({ lectureId:lecture.id, index })), false)}>Clear set</button>}
        <button type="button" disabled={!studyObjectives.length} onClick={() => { setStudyIndex(0); setStudyOpen(true); }}>Study selected</button>
      </div>
    </header>

    <div className="slo-study-filters slo-board-live-filters">
      <label><span>Course</span><select value={courseFilter} onChange={(event) => onCourseFilter(event.target.value)}><option value="all">All courses</option>{courses.map((course) => <option key={course}>{course}</option>)}</select></label>
      <label><span>Week</span><select value={weekFilter} onChange={(event) => onWeekFilter(event.target.value)}><option value="all">All weeks</option>{LECTURE_WEEK_OPTIONS.map((week) => <option key={week} value={week}>Week {week}</option>)}<option value="unassigned">Unassigned</option></select></label>
      <label><span>Instructor</span><select value={instructorFilter} onChange={(event) => onInstructorFilter(event.target.value)}><option value="all">All instructors</option>{instructors.map((instructor) => <option key={instructor}>{instructor}</option>)}</select></label>
    </div>

    <div className="slo-board-meta"><span>{visibleObjectives.length} objectives shown</span><button type="button" disabled={!visibleObjectives.length} onClick={() => onSetStudySelection(visibleRefs, !allVisibleSelected)}>{allVisibleSelected ? "Clear shown" : "Select all shown"}</button></div>

    <div className="slo-confidence-board">
      {(["weak", "okay", "strong"] as SloStrength[]).map((strength) => {
        const objectives = visibleObjectives.filter((objective) => objective.strength === strength);
        return <section key={strength} className="slo-confidence-column">
          <header><h3>{strengthLabel[strength]}</h3><span>{objectives.length}</span></header>
          <div>{objectives.map(({ lecture, index, text }) => {
            const selected = lecture.studySLOs.includes(index);
            const priority = lecture.flaggedSLOs.includes(index);
            return <article key={`${lecture.id}-${index}`} className={selected ? "selected" : ""}>
              <header><label><input type="checkbox" aria-label={`Add SLO ${index + 1} from ${lecture.title} to study set`} checked={selected} onChange={(event) => onSetStudySelection([{ lectureId:lecture.id, index }], event.target.checked)}/><span>SLO {index + 1}</span></label><button type="button" className={priority ? "active" : ""} aria-pressed={priority} onClick={() => onTogglePriority(lecture.id, index)}>Priority</button></header>
              <small>{lectureWeekLabel(lecture.week)} · {lecture.title}</small>
              <p>{text}</p>
              <footer><div><button type="button" onClick={() => onOpenLecture(lecture)}>Open lecture</button><button type="button" onClick={() => onReparse(lecture.id)}>Re-parse</button></div><select aria-label={`Confidence for SLO ${index + 1} from ${lecture.title}`} value={strength} onChange={(event) => onStrengthChange(lecture.id, index, event.target.value as SloStrength)}><option value="weak">Weak</option><option value="okay">O.K.</option><option value="strong">Strong</option></select></footer>
            </article>;
          })}{!objectives.length && <p className="slo-confidence-empty">No objectives</p>}</div>
        </section>;
      })}
    </div>

    {studyOpen && currentStudyObjective && <div className="slo-study-session-backdrop">
      <section className="slo-study-session" role="dialog" aria-modal="true" aria-label="Study selected SLOs">
        <header><div><small>STUDY SET</small><h2>Objective {currentStudyIndex + 1} of {studyObjectives.length}</h2></div><button type="button" aria-label="Close study set" onClick={() => setStudyOpen(false)}><AppIcon name="x"/></button></header>
        <div className="slo-study-session-body">
          <small>{currentStudyObjective.lecture.course} · {lectureWeekLabel(currentStudyObjective.lecture.week)} · {currentStudyObjective.lecture.title}</small>
          <p>{currentStudyObjective.lecture.slos[currentStudyObjective.index]}</p>
          <section><span>How strong do you feel?</span><div className="slo-strength-buttons">{(["weak", "okay", "strong"] as SloStrength[]).map((strength) => <button type="button" className={(currentStudyObjective.lecture.sloStrengths[currentStudyObjective.index] ?? "okay") === strength ? "active" : ""} key={strength} onClick={() => onStrengthChange(currentStudyObjective.lecture.id, currentStudyObjective.index, strength)}>{strengthLabel[strength]}</button>)}</div></section>
          <div className="slo-study-session-actions"><button type="button" className={currentStudyObjective.lecture.flaggedSLOs.includes(currentStudyObjective.index) ? "active" : ""} onClick={() => onTogglePriority(currentStudyObjective.lecture.id, currentStudyObjective.index)}>Priority</button><button type="button" onClick={() => { setStudyOpen(false); onOpenLecture(currentStudyObjective.lecture); }}>Open lecture</button></div>
        </div>
        <footer><button type="button" disabled={currentStudyIndex === 0} onClick={() => setStudyIndex(currentStudyIndex - 1)}>Previous</button><button type="button" disabled={currentStudyIndex >= studyObjectives.length - 1} onClick={() => setStudyIndex(currentStudyIndex + 1)}>Next</button></footer>
      </section>
    </div>}
  </section>;
}
