"use client";

import { useMemo, useState } from "react";

const contents = [
  { page: 3, title: "Learning objectives" }, { page: 5, title: "Receptor binding and affinity" },
  { page: 9, title: "Dose-response relationships" }, { page: 13, title: "Agonists and antagonists" },
  { page: 17, title: "Receptor states" }, { page: 21, title: "Constitutive activity" },
  { page: 27, title: "Partial agonism" }, { page: 34, title: "Clinical applications" },
];

function SlideFixture({ page, zoom, pen }: { page: number; zoom: number; pen: boolean }) {
  return <article className={`control-study-slide functional-slide ${pen ? "pen-on" : ""}`} style={{ width:`${Math.round(760 * zoom / 100)}px` }}>
    <h3>{contents.find((item) => item.page === page)?.title ?? "Receptor States"}</h3><div/>
    <section><p>Receptor basal states</p><ul><li>Reversible equilibrium between active and inactive states</li><li>Usually favors the inactive receptor</li><li><strong>Constitutive activity</strong> occurs in the absence of ligand</li></ul></section>
    {pen && <span className="control-study-ink" aria-label="Pen preview">Pen enabled — draw on the live PDF</span>}
  </article>;
}

export function PdfControlBarProposals() {
  const [page, setPage] = useState(17);
  const [zoom, setZoom] = useState(100);
  const [marked, setMarked] = useState<number[]>([9, 13]);
  const [pen, setPen] = useState(false);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(true);
  const activePage = useMemo(() => [...contents].reverse().find((item) => item.page <= page)?.page, [page]);
  const move = (amount: number) => setPage((current) => Math.min(41, Math.max(1, current + amount)));
  const toggleMark = () => setMarked((current) => current.includes(page) ? current.filter((item) => item !== page) : [...current, page].sort((a, b) => a - b));

  if (!viewerOpen) return <section className="pdf-control-functional-closed"><strong>Viewer closed</strong><button type="button" onClick={() => setViewerOpen(true)}>Reopen prototype</button></section>;

  return <section className="pdf-control-proposal proposal-canvas functional" aria-label="Canvas controls functionality test">
    <header className="pdf-control-proposal-heading"><div><h2>Canvas controls · Functionality test</h2><p>Controls stay at the edges of the PDF and disappear from the reading path.</p></div></header>
    <div className="control-study-viewer">
      <div className="control-study-canvas-title"><strong>Introduction to Pharmacodynamics</strong><small>PDF page {page} of 41</small></div>
      <div className="control-study-canvas-left"><div className="control-study-navigation"><button type="button" aria-label="Previous page" onClick={() => move(-1)}>←</button><span><b>{page}</b> / 41</span><button type="button" aria-label="Next page" onClick={() => move(1)}>→</button></div></div>
      <div className="control-study-canvas-right"><div className="control-study-zoom"><button type="button" aria-label="Zoom out" onClick={() => setZoom((current) => Math.max(60, current - 10))}>−</button><button type="button" onClick={() => setZoom(100)}>Fit {zoom}%</button><button type="button" aria-label="Zoom in" onClick={() => setZoom((current) => Math.min(180, current + 10))}>+</button></div><div className="control-study-tools"><button type="button" className={contentsOpen ? "active" : ""} onClick={() => setContentsOpen((current) => !current)}>Contents</button><button type="button" className={pen ? "active" : ""} onClick={() => setPen((current) => !current)}>Pen</button><button type="button" className={marked.includes(page) ? "active" : ""} onClick={toggleMark}>{marked.includes(page) ? "Marked" : "Mark"}</button><button type="button" onClick={() => setViewerOpen(false)}>Close</button></div></div>
      {contentsOpen && <aside className="control-study-contents-drawer"><header><div><small>Contents</small><strong>Introduction to Pharmacodynamics</strong></div><button type="button" aria-label="Close contents" onClick={() => setContentsOpen(false)}>×</button></header><nav>{contents.map((item) => <button type="button" className={item.page === activePage ? "active" : ""} key={item.page} onClick={() => { setPage(item.page); setContentsOpen(false); }}><span>{item.page}</span><strong>{item.title}</strong></button>)}</nav><footer><small>Marked slides</small><div>{marked.length ? marked.map((item) => <button type="button" key={item} onClick={() => { setPage(item); setContentsOpen(false); }}>{item}</button>) : <span>None</span>}</div><button type="button">Rebuild</button></footer></aside>}
      <div className="control-study-surface"><SlideFixture page={page} zoom={zoom} pen={pen}/></div>
    </div>
  </section>;
}
