"use client";

import { useState, type ReactNode } from "react";
import { initialObjectives, confidenceLevels, reviewLectures, slideTitles, type Confidence, type ReviewLecture } from "./fixtures";
import { DeskSlide } from "./DeskReader";
import "./nineties.css";

function IndexLink({to, onClick, children, visited = false}: {to:string; onClick():void; children:ReactNode; visited?:boolean}) {
  return <a href={`#${to}`} className={visited ? "retro-visited" : undefined} onClick={e => {e.preventDefault();onClick();}}>{children}</a>;
}

export function NinetiesReview() {
  const [section, setSection] = useState<"lectures" | "objectives" | "upload">("lectures");
  const [week, setWeek] = useState("");
  const [query, setQuery] = useState("");
  const [finding, setFinding] = useState(false);
  const [pictures, setPictures] = useState(true);
  const [priority, setPriority] = useState(false);
  const [objectives, setObjectives] = useState(initialObjectives.map(o => ({...o,selected:false})));
  const [visited, setVisited] = useState<string[]>([]);
  const [lecture, setLecture] = useState<ReviewLecture | null>(null);
  const [page, setPage] = useState(1);
  const [contents, setContents] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [session, setSession] = useState<number[] | null>(null);
  const [position, setPosition] = useState(0);
  const [done, setDone] = useState(false);
  const [uploadWeek, setUploadWeek] = useState("");
  const [uploadName, setUploadName] = useState("Regulation of Metabolism");
  const [uploadInstructor, setUploadInstructor] = useState("Mitsouras");
  const [uploaded, setUploaded] = useState(false);
  function navigate(next:typeof section) {setSection(next);setLecture(null);setSession(null);}
  function open(l:ReviewLecture, p=1) {setLecture(l);setPage(p);setZoom(100);setVisited(items => [...new Set([...items,l.id])]);}
  function update(id:number, patch:Partial<typeof objectives[number]>) {setObjectives(items => items.map(o => o.id===id?{...o,...patch}:o));}
  const shownLectures = reviewLectures.filter(l => (!week || l.week === week) && `${l.title} ${l.instructor}`.toLowerCase().includes(query.toLowerCase()));
  const shownObjectives = objectives.filter(o => {
    const l = reviewLectures.find(l=>l.id===o.lectureId)!;
    return (!week || l.week === week) && (!priority || o.priority) && `${o.text} ${l.title} ${l.instructor}`.toLowerCase().includes(query.toLowerCase());
  });
  const selected = objectives.filter(o => o.selected);
  const current = session ? objectives.find(o=>o.id===session[position]) : null;
  return <section className="retro-page">
    <header className="retro-header">
    <nav className="retro-navigation" aria-label="1990s prototype navigation">
      [ <IndexLink to="lecture-index" onClick={()=>navigate("lectures")}>Lecture index</IndexLink> ]{" "}
      [ <IndexLink to="learning-objectives" onClick={()=>navigate("objectives")}>Learning objectives</IndexLink> ]{" "}
      [ <IndexLink to="find" onClick={()=>{setFinding(!finding);setQuery("");}}>Find</IndexLink> ]{" "}
      [ <IndexLink to="upload" onClick={()=>navigate("upload")}>Add lectures</IndexLink> ]
    </nav>
    <span>2026–2027</span>
    </header>
    <hr />
    {finding && <div className="retro-find"><label>Find: <input type="search" value={query} onChange={e=>{setQuery(e.target.value);setLecture(null);setSession(null);if(section==="upload")setSection("lectures");}} /></label> <button onClick={()=>{setQuery("");setFinding(false);}}>Close</button></div>}

    {lecture ? <>
      <div className="retro-location"><IndexLink to="return" onClick={()=>setLecture(null)}>Back to {session?"study set":section==="objectives"?"objectives":"index"}</IndexLink> &gt; {lecture.title}</div>
      <div className="retro-reader-controls"><span>Page {page} of {slideTitles.length}</span> <button disabled={page===1} onClick={()=>setPage(page-1)}>Previous</button> <button disabled={page===slideTitles.length} onClick={()=>setPage(page+1)}>Next</button> <button aria-expanded={contents} onClick={()=>setContents(!contents)}>Contents</button><label> Zoom <select value={zoom} onChange={e=>setZoom(Number(e.target.value))}>{[100,125,150,200,300,400].map(z=><option key={z} value={z}>{z}%</option>)}</select></label></div>
      {current && <p className="retro-studying"><b>Objective:</b> {current.text}</p>}
      <div className="retro-reader">
        {contents && <ol className="retro-contents">{slideTitles.map((t,i)=><li key={t}><IndexLink to={`slide-${i+1}`} onClick={()=>setPage(i+1)}>{i===0?lecture.title:t}</IndexLink></li>)}</ol>}
        <div className="retro-slide-scroll"><div style={{width:`${zoom}%`}}><DeskSlide title={page===1?lecture.title:slideTitles[page-1]} cover={page===1}/></div></div>
      </div>
    </> : session && current ? <>
      <div className="retro-location"><IndexLink to="objectives" onClick={()=>setSession(null)}>Back to objectives</IndexLink> &gt; Study set</div>
      {done ? <div className="retro-study"><h2>Study set complete.</h2><button onClick={()=>setSession(null)}>Return to objectives</button></div> : <div className="retro-study"><h2>Objective {position+1} of {session.length}</h2><p>{current.text}</p><p><IndexLink to="source" onClick={()=>open(reviewLectures.find(l=>l.id===current.lectureId)!,9)}>View lecture</IndexLink></p><fieldset><legend>Confidence</legend>{confidenceLevels.map(level=><label key={level}><input type="radio" name="retro-study-confidence" checked={current.strength===level} onChange={()=>update(current.id,{strength:level})}/>{level}</label>)}</fieldset><div className="retro-actions"><button disabled={!position} onClick={()=>setPosition(position-1)}>Previous</button><button onClick={()=>position===session.length-1?setDone(true):setPosition(position+1)}>{position===session.length-1?"Finish":"Next"}</button></div></div>}
    </> : section === "upload" ? <>
      <h2>Add lectures</h2>
      <p className="retro-small">Sample PDF — review before adding.</p>
      <div className="retro-table-scroll"><table><thead><tr><th>Lecture</th><th>Course</th><th>Week</th><th>Instructor</th></tr></thead><tbody><tr><td><input aria-label="1990s sample lecture title" value={uploadName} onChange={e=>setUploadName(e.target.value)}/></td><td>MCF</td><td><select aria-label="1990s sample upload week" value={uploadWeek} onChange={e=>setUploadWeek(e.target.value)}><option value="">Choose...</option><option value="3">Week 3</option><option value="2">Week 2</option></select></td><td><input aria-label="1990s sample instructor" value={uploadInstructor} onChange={e=>setUploadInstructor(e.target.value)}/></td></tr></tbody></table></div>
      <p><button disabled={!uploadWeek||!uploadName.trim()||!uploadInstructor.trim()} onClick={()=>setUploaded(true)}>Finalize</button> <button onClick={()=>navigate("lectures")}>Cancel</button></p>
      {uploaded&&<p role="status">Sample review complete. No file was uploaded.</p>}
    </> : <>
      <div className="retro-filter"><label>Course: <select aria-label="1990s course"><option>MCF</option></select></label><label>Week: <select value={week} onChange={e=>setWeek(e.target.value)}><option value="">All</option><option value="3">3</option><option value="2">2</option></select></label>{section==="lectures"?<label><input type="checkbox" checked={pictures} onChange={e=>setPictures(e.target.checked)}/> Show previews</label>:<label><input type="checkbox" checked={priority} onChange={e=>setPriority(e.target.checked)}/> Priority only</label>}</div>
      {section==="lectures" ? <>
        {["3","2"].map(w => shownLectures.some(l=>l.week===w) && <section key={w} className="retro-week"><h2>MCF — Week {w}</h2><table className="retro-lecture-table"><thead><tr>{pictures&&<th scope="col" className="retro-preview-heading">PDF</th>}<th scope="col">Lecture</th><th scope="col">Instructor</th></tr></thead><tbody>{shownLectures.filter(l=>l.week===w).map((l,i)=><tr key={l.id}>{pictures&&<td className="retro-thumbnail"><IndexLink to={`lecture-${l.id}`} onClick={()=>open(l)}><DeskSlide title={l.title} cover variant={i}/></IndexLink></td>}<td><IndexLink to={`lecture-${l.id}`} visited={visited.includes(l.id)} onClick={()=>open(l)}>{l.title}</IndexLink></td><td>{l.instructor}</td></tr>)}</tbody></table></section>)}
        {!shownLectures.length&&<p>No matching lectures. <IndexLink to="clear" onClick={()=>{setQuery("");setWeek("");}}>Clear filters</IndexLink></p>}
      </> : <>
        <h2>Session learning objectives</h2>
        <div className="retro-objective-actions"><button disabled={!shownObjectives.length} onClick={()=>{const all=shownObjectives.every(o=>o.selected);const ids=new Set(shownObjectives.map(o=>o.id));setObjectives(items=>items.map(o=>ids.has(o.id)?{...o,selected:!all}:o));}}>Select / deselect all shown</button></div>
        <div className="retro-table-scroll"><table className="retro-objective-table"><thead><tr><th scope="col">Select</th><th scope="col">Objective / source</th><th scope="col">Priority</th>{confidenceLevels.map(level=><th scope="col" key={level}>{level}</th>)}</tr></thead><tbody>{shownObjectives.map(o=>{const l=reviewLectures.find(l=>l.id===o.lectureId)!;return <tr key={o.id}><td className="retro-choice"><label><input type="checkbox" aria-label={`1990s select objective ${o.id}`} checked={o.selected} onChange={e=>update(o.id,{selected:e.target.checked})}/></label></td><td><p>{o.text}</p><IndexLink to={`source-${o.id}`} onClick={()=>open(l,9)}>{l.title}</IndexLink></td><td className="retro-choice"><label><input type="checkbox" aria-label={`1990s priority objective ${o.id}`} checked={o.priority} onChange={e=>update(o.id,{priority:e.target.checked})}/></label></td>{confidenceLevels.map(level=><td className="retro-choice" key={level}><label><input type="radio" name={`retro-confidence-${o.id}`} aria-label={`Objective ${o.id}: ${level}`} checked={o.strength===level} onChange={()=>update(o.id,{strength:level as Confidence})}/></label></td>)}</tr>;})}</tbody></table></div>
        {!shownObjectives.length&&<p>No matching objectives.</p>}
        <div className="retro-actions"><button disabled={!selected.length} onClick={()=>{setSession(selected.map(o=>o.id));setPosition(0);setDone(false);}}>Study selected</button><span>{selected.length} selected</span></div>
      </>}
    </>}
    <footer className="retro-footer"><hr/><span>FCOM.lib</span> · <IndexLink to="index" onClick={()=>navigate("lectures")}>Index</IndexLink> · <span>Prototype / sample data</span></footer>
  </section>;
}
