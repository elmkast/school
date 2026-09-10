"use client";

import { useState } from "react";
import { reviewLectures, type ReviewLecture } from "./fixtures";
import { ConfidenceReview } from "./ConfidenceReview";
import { ReaderReview, SlideFixture } from "./ReaderReview";
import { ImportReview } from "./ImportReview";
import { ReviewNav } from "./ReviewNav";
import { StudyDeskReview } from "./StudyDeskReview";
import { NinetiesReview } from "./NinetiesReview";
import { QuizReview } from "./QuizReview";
import "./review.css";

const proposals = ["1997", "Study desk", "Archive", "Confidence", "Reader", "Import", "Quiz preview"] as const;
type Proposal = typeof proposals[number];

export function InterfaceReview() {
  const [proposal, setProposal] = useState<Proposal>("1997");
  const [reader, setReader] = useState<ReviewLecture>(reviewLectures[0]);
  const [compact, setCompact] = useState(false);
  const [revision, setRevision] = useState(0);
  function openLecture(lecture: ReviewLecture) { setReader(lecture); setProposal("Reader"); }
  return <main className="ux-review">
    <header className="ux-review-bar"><span>UI review <span className="ux-muted">/ September 2026</span></span><span className="ux-muted">Sample data</span><button onClick={() => {window.location.href="/";}}>Back to app ↗</button></header>
    <div className="ux-review-controls"><nav aria-label="UI proposals">{proposals.map((name, i) => <button key={name} aria-pressed={proposal === name} onClick={() => setProposal(name)}><span>0{i + 1}</span> {name}</button>)}</nav><div><button aria-pressed={compact} onClick={() => setCompact(!compact)}>iPad width</button><button onClick={() => setRevision(revision + 1)}>Reset</button></div></div>
    <div className={`ux-preview-frame ${compact ? "ux-compact" : ""}`} key={revision}>
      {proposal === "1997" && <NinetiesReview />}
      {proposal === "Quiz preview" && <QuizReview />}
      {proposal === "Study desk" && <StudyDeskReview />}
      {proposal === "Archive" && <ArchiveReview onOpen={openLecture} onImport={() => setProposal("Import")} onSlos={() => setProposal("Confidence")} />}
      {proposal === "Confidence" && <ConfidenceReview onOpen={openLecture} onArchive={() => setProposal("Archive")} />}
      {proposal === "Reader" && <ReaderReview lecture={reader} onClose={() => setProposal("Archive")} />}
      {proposal === "Import" && <ImportReview onClose={() => setProposal("Archive")} />}
    </div>
    <footer className="ux-review-caption">{({"Quiz preview":"Adaptive quiz interaction test. Production uses Luna; this preview uses deterministic fixtures.", "1997":"1990s university web. Documents, links, tables. Sample data only.", "Study desk":"From scratch: one desk for your lectures, objectives, and study sets. Sample data only.", Archive:"A quieter archive. Titles stay available to touch, mouse, and keyboard.", Confidence:"The objective comes first. Confidence and priority stay one tap away.", Reader:"One edge for navigation. One for tools. A clear slide in between.", Import:"One row per lecture. Shared labels. Batch week assignment."})[proposal]}</footer>
  </main>;
}

function ArchiveReview({ onOpen, onImport, onSlos }: {onOpen(lecture:ReviewLecture):void; onImport():void; onSlos():void}) {
  const [query, setQuery] = useState("");
  const [week, setWeek] = useState("");
  const [titles, setTitles] = useState(false);
  const lectures = reviewLectures.filter(l => (!week || l.week === week) && `${l.title} ${l.instructor}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="ux-archive">
    <ReviewNav active="Lectures" onArchive={() => {setQuery(""); setWeek("");}} onSlos={onSlos}><input aria-label="Search preview lectures" type="search" value={query} onChange={e => setQuery(e.target.value)} /><button className="ux-primary" onClick={onImport}>Add lectures</button></ReviewNav>
    <div className="ux-archive-body"><div className="ux-filter-row"><span>2026–2027</span><span className="ux-divider">/</span><span>MCF</span><select aria-label="Archive week" value={week} onChange={e=>setWeek(e.target.value)}><option value="">All weeks</option><option value="3">Week 3</option><option value="2">Week 2</option></select><button className="ux-push ux-title-toggle" aria-pressed={titles} onClick={()=>setTitles(!titles)}>Titles {titles ? "on" : "off"}</button></div>
      {["3","2"].map(w => lectures.some(l=>l.week === w) && <section className="ux-week" key={w}><h2>Week {w}</h2><div className={`ux-thumbnails ${titles ? "ux-show-titles" : ""}`}>{lectures.filter(l=>l.week===w).map((l,i)=><button className="ux-lecture" key={l.id} onClick={()=>onOpen(l)} aria-label={`Open ${l.title}`}><div className="ux-thumb"><SlideFixture title={l.title} variant={i} /></div><span className="ux-thumb-caption"><strong>{l.title}</strong><span>{l.instructor}</span></span></button>)}</div></section>)}
      {!lectures.length && <div className="ux-empty">No lectures found.<button onClick={()=>{setQuery("");setWeek("");}}>Clear filters</button></div>}
    </div>
  </section>;
}
