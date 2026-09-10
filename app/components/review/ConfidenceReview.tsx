"use client";

import { useState } from "react";
import { ReviewNav } from "./ReviewNav";
import { initialObjectives, confidenceLevels, reviewLectures, type Confidence, type ReviewLecture } from "./fixtures";

export function ConfidenceReview({onOpen,onArchive}:{onOpen(lecture:ReviewLecture):void;onArchive():void}) {
  const [objectives,setObjectives] = useState(initialObjectives);
  const [priority,setPriority] = useState(false);
  const [week,setWeek] = useState("3");
  const [instructor,setInstructor] = useState("");
  const [session,setSession] = useState<number[] | null>(null);
  const [index,setIndex] = useState(0);
  const [complete,setComplete] = useState(false);
  const [exporting,setExporting] = useState(false);
  const [exported,setExported] = useState(false);
  const selected = objectives.filter(o=>o.selected);
  const visible = objectives.filter(o=>{const l=reviewLectures.find(l=>l.id===o.lectureId)!;return (!week||l.week===week)&&(!instructor||l.instructor===instructor)&&(!priority||o.priority);});
  const current = session ? objectives.find(o=>o.id===session[index]) : null;
  function update(id:number, changes:Partial<typeof initialObjectives[number]>) { setObjectives(items=>items.map(o=>o.id===id?{...o,...changes}:o)); }
  function rate(strength:Confidence) { if(current) update(current.id,{strength}); }
  return <section className="ux-confidence">
    {!session && <>
    <ReviewNav active="SLOs" onArchive={onArchive} onSlos={()=>{setSession(null);setComplete(false);}}><button onClick={()=>setExporting(!exporting)}>Export</button><button className="ux-primary" disabled={!selected.length} onClick={()=>{setSession(selected.map(o=>o.id));setIndex(0);setComplete(false);}}>Study{selected.length ? ` · ${selected.length}` : ""}</button></ReviewNav>
    <div className="ux-confidence-body"><div className="ux-filter-row"><span>MCF</span><select aria-label="SLO week" value={week} onChange={e=>setWeek(e.target.value)}><option value="">All weeks</option><option value="3">Week 3</option><option value="2">Week 2</option></select><select aria-label="SLO instructor" value={instructor} onChange={e=>setInstructor(e.target.value)}><option value="">All instructors</option>{["Mitsouras","Huwe","Vansal"].map(i=><option key={i}>{i}</option>)}</select><button className="ux-push" aria-pressed={priority} onClick={()=>setPriority(!priority)}>Priority</button><button disabled={!visible.length} onClick={()=>{const all=visible.every(o=>o.selected);setObjectives(items=>items.map(o=>visible.some(v=>v.id===o.id)?{...o,selected:!all}:o));}}>{visible.length>0&&visible.every(o=>o.selected)?"Clear shown":"Select shown"}</button></div>
      {exporting && <div className="ux-inline-panel"><span>Export selected objectives</span><button disabled={!selected.length} onClick={()=>setExported(true)}>PDF</button><button disabled={!selected.length} onClick={()=>setExported(true)}>Excel</button><button className="ux-push" onClick={()=>{setExporting(false);setExported(false);}}>Close</button>{exported&&<span role="status">Export preview only</span>}</div>}
      <div className="ux-confidence-board">{confidenceLevels.map(level=><section className="ux-lane" key={level}><header><h2>{level}</h2><span className="ux-lane-line" /></header><div>{visible.filter(o=>o.strength===level).map(o=>{const l=reviewLectures.find(l=>l.id===o.lectureId)!;return <article className={`ux-objective ${o.selected?"ux-selected":""}`} key={o.id}><header><input type="checkbox" checked={o.selected} onChange={e=>update(o.id,{selected:e.target.checked})} aria-label={`Select objective ${o.id}`}/><button className="ux-source" onClick={()=>onOpen(l)}>{l.title}</button><button className="ux-priority" aria-label={`Priority for objective ${o.id}`} aria-pressed={o.priority} onClick={()=>update(o.id,{priority:!o.priority})}>{o.priority?"●":"○"}</button></header><p>{o.text}</p><footer><span>{l.instructor}</span><select aria-label={`Confidence for objective ${o.id}`} value={o.strength} onChange={e=>update(o.id,{strength:e.target.value as Confidence})}>{confidenceLevels.map(s=><option key={s}>{s}</option>)}</select></footer></article>;})}{!visible.some(o=>o.strength===level)&&<p className="ux-muted ux-empty-lane">No objectives</p>}</div></section>)}</div>
      <div className="ux-set-strip"><span>{selected.length} selected</span><button disabled={!selected.length} onClick={()=>setObjectives(items=>items.map(o=>({...o,selected:false})))}>Clear set</button></div>
    </div>
    </>}
    {session&&current&&<div className="ux-focus"><header><button onClick={()=>setSession(null)}>← Board</button><span>{index+1} / {session.length}</span></header>{complete?<div className="ux-focus-copy"><h2>Set complete</h2><button className="ux-primary" onClick={()=>setSession(null)}>Back to board</button></div>:<><div className="ux-focus-copy"><button className="ux-source" onClick={()=>onOpen(reviewLectures.find(l=>l.id===current.lectureId)!)}>{reviewLectures.find(l=>l.id===current.lectureId)!.title} ↗</button><h2>{current.text}</h2><div className="ux-rating">{confidenceLevels.map(s=><button key={s} aria-pressed={current.strength===s} onClick={()=>rate(s)}>{s}</button>)}</div></div><footer><button disabled={!index} onClick={()=>setIndex(index-1)}>Previous</button><button className="ux-primary" onClick={()=>index===session.length-1?setComplete(true):setIndex(index+1)}>{index===session.length-1?"Finish":"Next →"}</button></footer></>}</div>}
  </section>;
}
