"use client";

import { useEffect, useRef, useState } from "react";
import { confidenceLevels, initialObjectives, reviewLectures, type Confidence, type ReviewLecture } from "./fixtures";
import { DeskReader, DeskSlide } from "./DeskReader";
import "./study-desk.css";

type Objective = typeof initialObjectives[number];
type Destination = "Lectures" | "SLOs";
type Reading = { lecture: ReviewLecture; page: number; objective?: string };

export function StudyDeskReview() {
  const [destination, setDestination] = useState<Destination>("Lectures");
  const [week, setWeek] = useState("3");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [lectures, setLectures] = useState(reviewLectures);
  const [objectives, setObjectives] = useState(initialObjectives.map(o => ({ ...o, selected: false })));
  const [priorityOnly, setPriorityOnly] = useState(false);
  const [reading, setReading] = useState<Reading | null>(null);
  const [lastRead, setLastRead] = useState({ lecture: reviewLectures[0], page: 9 });
  const [session, setSession] = useState<number[] | null>(null);
  const [sessionIndex, setSessionIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(""), 3500); return () => clearTimeout(timer); } }, [notice]);

  function update(id: number, patch: Partial<Objective>) {
    setObjectives(items => items.map(o => o.id === id ? { ...o, ...patch } : o));
  }
  function navigate(next: Destination) { setDestination(next); setReading(null); setSession(null); }
  function open(lecture: ReviewLecture, page = 1, objective?: string) {
    setReading({ lecture, page, objective }); setLastRead({ lecture, page });
  }
  const matches = (l: ReviewLecture) => (!week || l.week === week) && `${l.title} ${l.instructor}`.toLowerCase().includes(query.toLowerCase());
  const visibleLectures = lectures.filter(matches);
  const shown = objectives.filter(o => {
    const lecture = lectures.find(l => l.id === o.lectureId)!;
    return (!week || lecture.week === week) && (!priorityOnly || o.priority) && `${o.text} ${lecture.title} ${lecture.instructor}`.toLowerCase().includes(query.toLowerCase());
  });
  const selected = objectives.filter(o => o.selected);
  const current = session ? objectives.find(o => o.id === session[sessionIndex]) : null;
  const strengths = confidenceLevels.map(level => shown.filter(o => o.strength === level).length);

  return <section className="study-desk">
    <header className="desk-masthead">
      <button className="desk-wordmark" onClick={() => navigate("Lectures")}>lectures.lib<span> /</span></button>
      <nav aria-label="Study desk navigation">{(["Lectures", "SLOs"] as const).map(item => <button key={item} aria-current={!reading && !session && destination === item ? "page" : undefined} onClick={() => navigate(item)}>{item}</button>)}</nav>
      <div className="desk-masthead-actions"><button aria-expanded={searching} onClick={() => { setSearching(!searching); setQuery(""); }}>Search</button><button className="desk-add" aria-label="Add sample lectures" onClick={() => setImporting(true)}>Add +</button></div>
    </header>
    {searching && <div className="desk-search"><input type="search" aria-label="Search study desk sample material" value={query} onChange={e => {setQuery(e.target.value);setReading(null);setSession(null);}} /><button onClick={() => {setSearching(false);setQuery("");}}>Close</button></div>}
    {notice && <div role="status" className="desk-notice">{notice}</div>}

    {reading ? <DeskReader key={reading.lecture.id + reading.page} lecture={reading.lecture} initialPage={reading.page} objective={reading.objective} onBack={() => setReading(null)} onPage={page => setLastRead({ lecture: reading.lecture, page })} />
      : session && current ? <div className="desk-focus">
        <header><button onClick={() => setSession(null)}>← SLOs</button><span>{sessionIndex + 1} / {session.length}</span><span>Study set</span></header>
        {finished ? <div className="desk-focus-main"><h1>Set complete.</h1><button className="desk-solid" onClick={() => setSession(null)}>Back to SLOs →</button></div> : <>
          <div className="desk-focus-main"><span>{lectures.find(l => l.id === current.lectureId)!.title}</span><h1>{current.text}</h1><button className="desk-source-link" onClick={() => open(lectures.find(l => l.id === current.lectureId)!, 9, current.text)}>Open source ↗</button></div>
          <footer><div className="desk-confidence-options">{confidenceLevels.map(level => <button key={level} aria-pressed={current.strength === level} onClick={() => update(current.id, {strength: level})}>{level}</button>)}</div><button disabled={sessionIndex === 0} onClick={() => setSessionIndex(sessionIndex - 1)}>Previous</button><button className="desk-solid" onClick={() => sessionIndex + 1 === session.length ? setFinished(true) : setSessionIndex(sessionIndex + 1)}>{sessionIndex + 1 === session.length ? "Finish" : "Next →"}</button></footer>
        </>}
      </div> : <>
        <div className="desk-context">
          <div><span className="desk-term">2026–2027</span><h1>MCF<span className="desk-context-slash"> / </span><span>{week ? `Week ${week}` : "All weeks"}</span></h1></div>
          <nav aria-label="Study desk week"><button aria-pressed={!week} onClick={() => setWeek("")}>All</button>{["3", "2"].map(w => <button key={w} aria-pressed={week === w} onClick={() => setWeek(w)}>Week {w}</button>)}</nav>
        </div>
        {destination === "Lectures" ? <div className="desk-archive">
          <div className="desk-resume"><span>Continue</span><button onClick={() => open(lastRead.lecture, lastRead.page)}>{lastRead.lecture.title}<span>Slide {lastRead.page} ↗</span></button></div>
          {["3", "2"].map(w => visibleLectures.some(l => l.week === w) && <section className="desk-shelf" key={w} aria-label={`Week ${w} lectures`}>
            {!week && <h2>Week {w}</h2>}
            <div className="desk-gallery">{visibleLectures.filter(l => l.week === w).map((l, i) => <button className="desk-lecture" key={l.id} onClick={() => open(l)}>
              <div className={`desk-preview desk-preview-${i % 3}`}><DeskSlide title={l.title} cover variant={i} /><span className="desk-open-cue" aria-hidden="true">↗</span></div>
              <span className="desk-lecture-title">{l.title}</span><span className="desk-lecture-meta">{l.instructor}</span>
            </button>)}</div>
          </section>)}
          {!visibleLectures.length && <div className="desk-empty">No matching lectures.<button onClick={() => { setQuery(""); setWeek(""); }}>Clear filters</button></div>}
          <button className="desk-next-section" onClick={() => navigate("SLOs")}><span>Study this week</span><span>SLOs →</span></button>
        </div> : <div className="desk-slos">
          <div className="desk-slo-tools"><div className="desk-slo-views"><button aria-pressed={!priorityOnly} onClick={() => setPriorityOnly(false)}>All SLOs</button><button aria-pressed={priorityOnly} onClick={() => setPriorityOnly(true)}>Priority</button></div><button onClick={() => { const all = shown.every(o => o.selected); const ids = new Set(shown.map(o => o.id));setObjectives(items => items.map(o => ids.has(o.id) ? {...o, selected: !all} : o));}} disabled={!shown.length}>{shown.length > 0 && shown.every(o => o.selected) ? "Deselect shown" : "Select shown"}</button></div>
          <div className="desk-confidence-line" aria-label={`${strengths[0]} weak, ${strengths[1]} O.K., ${strengths[2]} strong`}>
            {confidenceLevels.map((level, i) => <span key={level} style={{flex: Math.max(strengths[i], .15)}} className={`desk-strength-${i}`}><span>{level}</span></span>)}
          </div>
          <div className="desk-objectives">{shown.map(o => {
            const lecture = lectures.find(l => l.id === o.lectureId)!;
            return <article key={o.id} className={`desk-objective ${o.selected ? "desk-objective-selected" : ""}`}>
              <label className="desk-check"><input type="checkbox" aria-label={`Select SLO ${o.id}`} checked={o.selected} onChange={e => update(o.id, {selected: e.target.checked})} /></label>
              <div className="desk-objective-copy"><p>{o.text}</p><button className="desk-source-link" onClick={() => open(lecture, 9, o.text)}>{lecture.title} ↗</button></div>
              <button className="desk-priority" aria-label={`Prioritize SLO ${o.id}`} aria-pressed={o.priority} onClick={() => update(o.id, {priority: !o.priority})}>{o.priority ? "●" : "○"}</button>
              <select aria-label={`SLO ${o.id} confidence`} value={o.strength} onChange={e => update(o.id, {strength: e.target.value as Confidence})}>{confidenceLevels.map(level => <option key={level}>{level}</option>)}</select>
            </article>;
          })}</div>
          {!shown.length && <div className="desk-empty">No matching SLOs.<button onClick={() => {setQuery("");setWeek("");setPriorityOnly(false);}}>Clear filters</button></div>}
          <footer className="desk-selection"><span>{selected.length ? `${selected.length} selected` : "Select SLOs to study"}</span>{selected.length > 0 && <button onClick={() => setObjectives(items => items.map(o => ({...o,selected:false})))}>Clear</button>}<button className="desk-solid" disabled={!selected.length} onClick={() => {setSession(selected.map(o => o.id));setSessionIndex(0);setFinished(false);}}>Study set →</button></footer>
        </div>}
      </>}
    {importing && <DeskImport onClose={() => setImporting(false)} onFinalize={rows => {setLectures(items => [...items, ...rows]);setImporting(false);setNotice("Sample lectures added. Your real library is unchanged.");navigate("Lectures");}} />}
  </section>;
}

function DeskImport({onClose, onFinalize}: {onClose():void;onFinalize(rows: ReviewLecture[]):void}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [rows, setRows] = useState([{id: "desk-import-1", title: "Regulation of Metabolism", instructor: "Mitsouras", course: "MCF", week: ""}]);
  useEffect(() => { const el = dialog.current; el?.showModal(); return () => el?.close(); }, []);
  const ready = rows.length > 0 && rows.every(r => r.week && r.title.trim() && r.instructor.trim());
  return <dialog className="desk-import-dialog" ref={dialog} onCancel={onClose}>
    <header><h1>Review</h1><button onClick={onClose}>Close</button></header>
    <div className="desk-import-table">
      <div className="desk-import-labels"><span>Lecture</span><span>Week</span><span>Instructor</span></div>
      {rows.map(row => <div className="desk-import-entry" key={row.id}>
        <input aria-label="Sample lecture title" aria-invalid={!row.title.trim()} value={row.title} onChange={e => setRows(items => items.map(r => r.id === row.id ? {...r,title:e.target.value} : r))}/>
        <select aria-label="Sample import week" aria-invalid={!row.week} value={row.week} onChange={e => setRows(items => items.map(r => r.id === row.id ? {...r,week:e.target.value} : r))}><option value="">Week</option><option value="3">Week 3</option><option value="2">Week 2</option></select>
        <input aria-label="Sample instructor" aria-invalid={!row.instructor.trim()} value={row.instructor} onChange={e => setRows(items => items.map(r => r.id === row.id ? {...r,instructor:e.target.value} : r))}/>
      </div>)}
    </div>
    <footer><span>MCF · Sample PDF</span><button className="desk-solid" disabled={!ready} onClick={() => onFinalize(rows.map(r => ({...r,id:crypto.randomUUID()})))}>Finalize →</button></footer>
  </dialog>;
}
