"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import type { Lecture } from "../../lib/lecture-store";
import { buildExamSourceIndex } from "../../lib/exam-sources";
import { changeExamSelection, filterExamLectures, examSelectableLectureIds } from "../../lib/exam-selection";
import { ExamPool, type ExamPoolSnapshot } from "../../lib/exam-pool";
import { EXAM_BUFFER_SIZE, freshExamProgress, getExamTopicProgress, type ExamQuestion } from "../../lib/exam-prep";
import { liveExamService, type ExamService } from "../../lib/exam-client";
import { downloadDiagnostics } from "../../lib/diagnostics";
import { QuizQuestionView } from "./QuizQuestionView";
import "./adaptive-quiz.css";
import "./exam-prep.css";

function GroupCheckbox({ checked, indeterminate, onChange, label }: { checked: boolean; indeterminate: boolean; onChange(value: boolean): void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return <input ref={ref} type="checkbox" checked={checked} aria-label={label} onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.checked)} />;
}

const weekLabel = (week: number | null) => week ? `Week ${week}` : "Unassigned week";
const levelLabel = (level: number) => level === 1 ? "Foundation" : level === 2 ? "Application" : "Integration";

export function ExamPrep({ lectures, onExit, returnFocusRef, service = liveExamService }: {
  lectures: Lecture[]; onExit(): void; returnFocusRef?: RefObject<HTMLElement | null>; service?: ExamService;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const questionHeading = useRef<HTMLHeadingElement>(null);
  const pool = useRef<ExamPool | null>(null);
  const indexController = useRef<AbortController | null>(null);
  const submitted = useRef(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [courseFilter, setCourseFilter] = useState("all");
  const [weekFilter, setWeekFilter] = useState("all");
  const [lecturerFilter, setLecturerFilter] = useState("all");
  const [visibleCount, setVisibleCount] = useState(100);
  const [building, setBuilding] = useState(false);
  const [indexProgress, setIndexProgress] = useState({ done: 0, total: 0 });
  const [started, setStarted] = useState(false);
  const [snapshot, setSnapshot] = useState<ExamPoolSnapshot>({ progress: freshExamProgress(), current: null, ready: 0, initialized: false, busy: false, error: "", retrying: false, mappingRetrying: false, questionRetrying: false, mappingActive: false, mappedUnits: 0, totalUnits: 0, eligibleUnits: 0, sampledLectures: 0, selectedLectures: 0, parked: 0 });
  const [feedback, setFeedback] = useState<ExamQuestion | null>(null);
  const [choice, setChoice] = useState<number | null>(null);
  const [setupError, setSetupError] = useState("");
  const [progressOpen, setProgressOpen] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      indexController.current?.abort();
      pool.current?.dispose();
      element?.close();
    };
  }, []);

  const eligibleIds = useMemo(() => examSelectableLectureIds(lectures), [lectures]);
  const courses = useMemo(() => [...new Set(lectures.map((lecture) => lecture.course))].sort((a, b) => a.localeCompare(b)), [lectures]);
  const weeks = useMemo(() => [...new Set(lectures.map((lecture) => lecture.week))].sort((a, b) => (b ?? -1) - (a ?? -1)), [lectures]);
  const instructors = useMemo(() => [...new Set(lectures.map((lecture) => lecture.lecturer))].sort((a, b) => a.localeCompare(b)), [lectures]);
  const visible = useMemo(() => filterExamLectures(lectures, { query, course: courseFilter, week: weekFilter, instructor: lecturerFilter }), [lectures, courseFilter, weekFilter, lecturerFilter, query]);
  const shown = visible.slice(0, visibleCount);
  const groups = useMemo(() => {
    const result = new Map<string, Lecture[]>();
    for (const lecture of shown) {
      const key = `${lecture.course}\u0000${lecture.week ?? "unassigned"}\u0000${lecture.academicYear}`;
      result.set(key, [...(result.get(key) ?? []), lecture]);
    }
    return [...result.entries()];
  }, [shown]);
  const question = feedback ?? snapshot.current;
  const answered = Boolean(feedback);
  const progress = snapshot.progress;
  const feedbackCorrect = Boolean(question && choice === question.correctIndex);
  const error = setupError || snapshot.error;
  const preparationStatus = snapshot.mappingRetrying && snapshot.questionRetrying
    ? "Retrying source analysis and question generation…"
    : snapshot.mappingRetrying
      ? `Retrying source analysis · ${snapshot.mappedUnits}/${snapshot.totalUnits} sections analyzed`
      : snapshot.questionRetrying
        ? "Retrying question generation…"
        : snapshot.mappingActive
          ? `Analyzing sections · ${snapshot.mappedUnits}/${snapshot.totalUnits} · questions ${Math.min(snapshot.ready, EXAM_BUFFER_SIZE)}/${EXAM_BUFFER_SIZE}`
          : !snapshot.initialized
            ? `Preparing questions · ${Math.min(snapshot.ready, EXAM_BUFFER_SIZE)}/${EXAM_BUFFER_SIZE}`
            : "Preparing next question…";
  const levelTotals = useMemo(() => {
    const totals = { 1: 0, 2: 0, 3: 0 };
    for (const state of Object.values(progress.topics)) {
      totals[1] += state.levelAttempts["1"];
      totals[2] += state.levelAttempts["2"];
      totals[3] += state.levelAttempts["3"];
    }
    return totals;
  }, [progress.topics]);

  function close() {
    indexController.current?.abort();
    pool.current?.dispose();
    onExit();
    requestAnimationFrame(() => returnFocusRef?.current?.focus());
  }

  function toggleSelection(ids: string[], checked: boolean) {
    setSelectedIds((current) => changeExamSelection(current, ids, eligibleIds, checked));
  }

  async function start() {
    if (building || started) return;
    const selected = lectures.filter((lecture) => selectedIds.has(lecture.id) && eligibleIds.has(lecture.id));
    if (!selected.length) { setSetupError("Select at least one lecture with readable slide text."); return; }
    const controller = new AbortController();
    indexController.current = controller;
    setBuilding(true); setSetupError(""); setIndexProgress({ done: 0, total: selected.length });
    try {
      const index = await buildExamSourceIndex(selected, { signal: controller.signal, onProgress: (done, total) => setIndexProgress({ done, total }) });
      if (controller.signal.aborted) return;
      if (!index.units.length) throw new Error("The selected lectures do not have extractable slide text.");
      const session = new ExamPool(index.units, index.lecturesById, service, setSnapshot);
      pool.current = session;
      setStarted(true);
      setSnapshot(session.snapshot());
      await session.start();
    } catch (cause) {
      if (!controller.signal.aborted) setSetupError(cause instanceof Error ? cause.message : "Could not prepare these lecture sources.");
    } finally {
      if (!controller.signal.aborted) setBuilding(false);
    }
  }

  function submit() {
    if (choice === null || !question || submitted.current || !pool.current) return;
    submitted.current = true;
    setFeedback(question);
    try { pool.current.answer(question.id, choice); }
    catch { submitted.current = false; setFeedback(null); }
  }

  function advance() {
    if (!snapshot.current) return;
    setFeedback(null); setChoice(null); submitted.current = false; dialog.current?.scrollTo({ top: 0 });
  }

  function shownGroupIds(items: Lecture[]) { return items.filter((lecture) => eligibleIds.has(lecture.id)).map((lecture) => lecture.id); }

  return createPortal(<dialog className="adaptive-quiz exam-prep" ref={dialog} aria-label="Exam prep" onCancel={(event) => { event.preventDefault(); close(); }}>
    <header><div><strong>{started ? "Exam prep" : "Exam prep"}</strong></div><button type="button" onClick={close}>Exit</button></header>
    {!started ? <div className="exam-setup">
      <div className="exam-filters">
        <label><span>Search</span><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(100); }} placeholder="Lecture title" /></label>
        <label><span>Course</span><select value={courseFilter} onChange={(event) => { setCourseFilter(event.target.value); setVisibleCount(100); }}><option value="all">All courses</option>{courses.map((course) => <option key={course}>{course}</option>)}</select></label>
        <label><span>Week</span><select value={weekFilter} onChange={(event) => { setWeekFilter(event.target.value); setVisibleCount(100); }}><option value="all">All weeks</option>{weeks.map((week) => <option key={week ?? "unassigned"} value={week ?? "unassigned"}>{weekLabel(week)}</option>)}</select></label>
        <label><span>Instructor</span><select value={lecturerFilter} onChange={(event) => { setLecturerFilter(event.target.value); setVisibleCount(100); }}><option value="all">All instructors</option>{instructors.map((instructor) => <option key={instructor}>{instructor}</option>)}</select></label>
      </div>
      <div className="exam-selection-toolbar"><span>{selectedIds.size} selected</span><div><button type="button" onClick={() => toggleSelection(shownGroupIds(shown), true)}>Select shown</button><button type="button" onClick={() => setSelectedIds(new Set())}>Clear</button></div></div>
      <div className="exam-lecture-list" aria-label="Lectures">
        {!visible.length && <p className="exam-empty">No lectures match these filters.</p>}
        {groups.map(([key, items]) => {
          const ids = shownGroupIds(items);
          const count = ids.filter((id) => selectedIds.has(id)).length;
          const [course, week, year] = key.split("\u0000");
          return <section className="exam-group" key={key}>
            <header><GroupCheckbox label={`Select ${course} ${week === "unassigned" ? "unassigned week" : week} ${year} lectures`} checked={ids.length > 0 && count === ids.length} indeterminate={count > 0 && count < ids.length} onChange={(checked) => toggleSelection(ids, checked)} /><h2>{course} · {week === "unassigned" ? "Unassigned week" : `Week ${week}`} · {year}</h2><small>{ids.length}</small></header>
            {items.map((lecture) => {
              const usable = eligibleIds.has(lecture.id);
              return <label className={`exam-lecture-row ${usable ? "" : "disabled"}`} key={lecture.id}>
                <input type="checkbox" disabled={!usable} checked={selectedIds.has(lecture.id)} onChange={(event) => toggleSelection([lecture.id], event.target.checked)} />
                <span><strong>{lecture.title}</strong><small>{lecture.lecturer} · {lecture.academicYear} · {weekLabel(lecture.week)}</small></span>
                {!usable && <small className="exam-no-text">No readable text</small>}
              </label>;
            })}
          </section>;
        })}
        {visible.length > shown.length && <button className="exam-show-more" type="button" onClick={() => setVisibleCount((count) => count + 100)}>Show more ({visible.length - shown.length} remaining)</button>}
      </div>
      {setupError && <p className="aq-error" role="alert">{setupError}</p>}
      <footer className="exam-setup-footer">{building && <span role="status">Indexing sources · {indexProgress.done}/{indexProgress.total}</span>}<button className="aq-primary" type="button" disabled={building || selectedIds.size === 0} onClick={() => void start()}>{building ? "Preparing…" : "Start exam"}</button></footer>
    </div> : <>
      <div className="aq-status exam-status"><span>Question {progress.answered + (answered ? 0 : 1)}</span><span>{progress.correct} / {progress.answered} correct</span><span>{levelTotals[1]} foundation · {levelTotals[2]} application · {levelTotals[3]} integration</span><button type="button" className="exam-progress-toggle" aria-expanded={progressOpen} onClick={() => setProgressOpen((value) => !value)}>Progress</button></div>
      {progressOpen && <section className="exam-progress-panel"><div><strong>{snapshot.sampledLectures} / {snapshot.selectedLectures}</strong><span>lectures sampled</span></div><div><strong>{Object.keys(progress.topics).filter((id) => getExamTopicProgress(progress, id).correct + getExamTopicProgress(progress, id).incorrect > 0).length}</strong><span>topics practiced</span></div><div><strong>{snapshot.mappedUnits} / {snapshot.totalUnits}</strong><span>sections analyzed</span></div></section>}
      {question && <QuizQuestionView question={question} questionHeading={questionHeading} choice={choice} answered={answered} feedbackCorrect={feedbackCorrect} onChoice={setChoice} onSubmit={submit}>
        {answered && <details><summary>Lecture source · {question.lectureTitle} · {question.sourcePages.map((page) => `p. ${page}`).join(", ")}</summary><p className="exam-source-meta">{question.topicTitle} · {question.level}/3 {levelLabel(question.level)} · {question.purpose}</p>{question.evidence.map((item) => <div className="aq-source-text" key={item.id}><b>{question.lectureTitle} · page {item.page}</b><p>{item.text}</p></div>)}</details>}
      </QuizQuestionView>}
      {((snapshot.busy && (!snapshot.initialized || !snapshot.current || snapshot.retrying)) || error || answered) && <footer className="aq-generation">
        {snapshot.busy && (!snapshot.initialized || !snapshot.current || snapshot.retrying) && <span role="status">{preparationStatus}</span>}
        {error && <div className="aq-error" role="alert"><p>{error}</p><button type="button" onClick={() => downloadDiagnostics()}>Diagnostics</button></div>}
        {answered && <button className="aq-primary" disabled={!snapshot.current} onClick={advance}>Next question</button>}
      </footer>}
    </>}
  </dialog>, document.body);
}
