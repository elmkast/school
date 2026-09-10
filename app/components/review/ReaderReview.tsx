"use client";

import { useState, type PointerEvent } from "react";
import { slideTitles, type ReviewLecture } from "./fixtures";

export function SlideFixture({title,variant=0}:{title:string;variant?:number}) {
  return <div className={`ux-slide-fixture ux-slide-v${variant%3}`}><div className="ux-slide-overline">Medical &amp; Clinical Foundations</div><h3>{title}</h3><div className="ux-slide-rule"/><div className="ux-slide-columns"><div className="ux-slide-lines" aria-hidden="true">{[86,98,70,90,62].map((w,i)=><span key={i} style={{width:`${w}%`}}/>)}</div><svg viewBox="0 0 180 110" aria-hidden="true"><path d="M15 5V95H175" fill="none" stroke="currentColor" strokeWidth="2"/><path d={variant%2 ? "M18 90Q65 83 88 44T170 10" : "M18 90Q40 20 80 17T170 12"} fill="none" stroke="currentColor" strokeWidth="3"/><path d="M18 90L164 26" fill="none" stroke="currentColor" strokeDasharray="4 4"/></svg></div><span className="ux-slide-footer">FCOM · Lecture material</span></div>;
}

type Point={x:number;y:number};
type Mark={id:string;points:Point[];color:string;width:number;highlight:boolean};
type Marks={ink:Mark[];redo:Mark[]};
const emptyMarks:Marks={ink:[],redo:[]};

export function ReaderReview({lecture,onClose}:{lecture:ReviewLecture;onClose():void}) {
  const [page,setPage]=useState(9);
  const [contents,setContents]=useState(false);
  const [tools,setTools]=useState(true);
  const [mode,setMode]=useState("Pen");
  const [width,setWidth]=useState(2);
  const [color,setColor]=useState("#242a30");
  const [zoom,setZoom]=useState(100);
  const [marked,setMarked]=useState<number[]>([3]);
  const [pages,setPages]=useState<Record<number,Marks>>({});
  const [draft,setDraft]=useState<{pointer:number;mark:Mark}|null>(null);
  const [query,setQuery]=useState("");
  const marks=pages[page]??emptyMarks;
  const title=page===1?lecture.title:slideTitles[page-1];
  function point(e:PointerEvent<SVGSVGElement>){const b=e.currentTarget.getBoundingClientRect();return {x:(e.clientX-b.left)/b.width*1000,y:(e.clientY-b.top)/b.height*625};}
  function end(e:PointerEvent<SVGSVGElement>){if(!draft||draft.pointer!==e.pointerId)return;const mark=draft.mark;setPages(all=>({...all,[page]:{ink:[...(all[page]?.ink??[]),mark],redo:[]}}));setDraft(null);}
  function undo(){setPages(all=>{const m=all[page]??emptyMarks;return {...all,[page]:{ink:m.ink.slice(0,-1),redo:m.ink.length?[...m.redo,m.ink[m.ink.length-1]]:m.redo}};});}
  function redo(){setPages(all=>{const m=all[page]??emptyMarks;return {...all,[page]:{ink:m.redo.length?[...m.ink,m.redo[m.redo.length-1]]:m.ink,redo:m.redo.slice(0,-1)}};});}
  return <section className="ux-reader"><header className="ux-reader-top"><button aria-expanded={contents} onClick={()=>setContents(!contents)}>Contents</button><strong>{lecture.title}</strong><button onClick={onClose}>Close</button></header><div className="ux-reader-middle">
    {contents&&<aside className="ux-reader-contents"><input type="search" aria-label="Find slide" value={query} onChange={e=>setQuery(e.target.value)}/><nav aria-label="Slide contents">{slideTitles.map((t,i)=>({t:i===0?lecture.title:t,p:i+1})).filter(s=>s.t.toLowerCase().includes(query.toLowerCase())).map(s=><button key={s.p} aria-current={page===s.p?"page":undefined} onClick={()=>{setDraft(null);setPage(s.p);}}><span>{s.p}</span>{s.t}</button>)}</nav></aside>}
    <div className="ux-reader-viewport"><div className="ux-reader-paper" style={{width:`${zoom}%`,maxWidth:zoom===100?"880px":"none"}}><SlideFixture title={title} variant={page}/><svg aria-label="Sample annotation surface" className={`ux-review-ink ${tools?"ux-drawing":""}`} viewBox="0 0 1000 625" onPointerDown={e=>{if(!tools||e.pointerType==="touch")return;e.currentTarget.setPointerCapture(e.pointerId);const p=point(e);if(mode==="Eraser"){const keep=marks.ink.filter(m=>!m.points.some(v=>Math.hypot(v.x-p.x,v.y-p.y)<30));setPages(all=>({...all,[page]:{ink:keep,redo:[]}}));return;}setDraft({pointer:e.pointerId,mark:{id:crypto.randomUUID(),points:[p],color,width,highlight:mode==="Highlight"}});}} onPointerMove={e=>{if(!draft||draft.pointer!==e.pointerId)return;const p=point(e);setDraft(d=>d?{...d,mark:{...d.mark,points:[...d.mark.points,p]}}:null);}} onPointerUp={end} onPointerCancel={()=>setDraft(null)}>{[...marks.ink,...(draft?[draft.mark]:[])].map(m=><polyline key={m.id} points={m.points.map(p=>`${p.x},${p.y}`).join(" ")} stroke={m.highlight?"#d6bb56":m.color} strokeWidth={m.width*(m.highlight?9:2)} strokeOpacity={m.highlight?.4:1} fill="none" strokeLinecap="round" strokeLinejoin="round"/>)}</svg></div></div>
    </div><footer className="ux-reader-bottom"><div className="ux-reader-controls"><div><button aria-label="Previous slide" disabled={page===1} onClick={()=>setPage(page-1)}>←</button><span>{page} / 12</span><button aria-label="Next slide" disabled={page===12} onClick={()=>setPage(page+1)}>→</button></div><div><button aria-label="Zoom out" disabled={zoom<=100} onClick={()=>setZoom(Math.max(100,zoom-25))}>−</button><button aria-label="Fit slide" onClick={()=>setZoom(100)}>{zoom}%</button><button aria-label="Zoom in" disabled={zoom>=400} onClick={()=>setZoom(Math.min(400,zoom+25))}>+</button></div><div><button aria-pressed={marked.includes(page)} onClick={()=>setMarked(m=>m.includes(page)?m.filter(p=>p!==page):[...m,page])}>{marked.includes(page)?"Marked":"Mark"}</button><button aria-expanded={tools} aria-pressed={tools} onClick={()=>setTools(!tools)}>Annotate</button></div></div>
    {tools&&<div className="ux-annotation-strip"><div>{["Pen","Highlight","Eraser"].map(t=><button key={t} aria-pressed={mode===t} onClick={()=>setMode(t)}>{t}</button>)}</div><select aria-label="Stroke width" value={width} onChange={e=>setWidth(Number(e.target.value))}><option value="1">Fine</option><option value="2">Medium</option><option value="3">Broad</option></select><div className="ux-swatches">{[["Black","#242a30"],["Red","#923f3b"],["Blue","#425f82"],["Green","#4f6c56"]].map(([name,hex])=><button key={name} aria-label={`${name} ink`} aria-pressed={color===hex} onClick={()=>{setColor(hex);setMode("Pen");}}><span style={{background:hex}}/></button>)}</div><div className="ux-push"><button disabled={!marks.ink.length} onClick={undo}>Undo</button><button disabled={!marks.redo.length} onClick={redo}>Redo</button></div></div>}
    </footer></section>;
}
