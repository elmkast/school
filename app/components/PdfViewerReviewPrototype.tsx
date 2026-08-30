"use client";

import { useMemo, useState } from "react";
import { AppIcon } from "./AppIcon";

const contents = [
  { page: 3, title: "Learning objectives" },
  { page: 5, title: "Receptor binding and affinity" },
  { page: 9, title: "Dose-response relationships" },
  { page: 13, title: "Agonists and antagonists" },
  { page: 17, title: "Receptor states" },
  { page: 21, title: "Constitutive activity" },
  { page: 27, title: "Partial agonism" },
  { page: 34, title: "Clinical applications" },
];

export function PdfViewerReviewPrototype({ typeface = "georgia" }: { typeface?: "georgia" | "arial" | "segoe" }) {
  const [page, setPage] = useState(17);
  const [zoom, setZoom] = useState(100);
  const [contentsOpen, setContentsOpen] = useState(true);
  const [marked, setMarked] = useState<number[]>([9, 13]);
  const activePage = useMemo(() => [...contents].reverse().find((item) => item.page <= page)?.page, [page]);

  function movePage(offset: number) {
    setPage((current) => Math.min(41, Math.max(1, current + offset)));
  }

  function toggleMarked() {
    setMarked((current) => current.includes(page) ? current.filter((item) => item !== page) : [...current, page].sort((a, b) => a - b));
  }

  return <section className={`pdf-review-prototype pdf-review-type-${typeface} ${contentsOpen ? "" : "contents-collapsed"}`} aria-label={`PDF viewer prototype · ${typeface}`}>
    {contentsOpen && <aside className="pdf-review-contents">
      <header><div><small>Contents</small><h2>Introduction to Pharmacodynamics</h2></div><button type="button" aria-label="Hide contents" onClick={() => setContentsOpen(false)}>‹</button></header>
      <nav aria-label="Lecture contents">{contents.map((item) => <button type="button" className={item.page === activePage ? "active" : ""} key={item.page} onClick={() => setPage(item.page)}><span>{item.page}</span><strong>{item.title}</strong></button>)}</nav>
      <footer><small>Marked slides</small><div>{marked.length ? marked.map((item) => <button type="button" key={item} onClick={() => setPage(item)}>{item}</button>) : <span>None</span>}</div><button type="button">Rebuild</button></footer>
    </aside>}
    <div className="pdf-review-stage">
      <header className="pdf-review-toolbar">
        <div className="pdf-review-title">{!contentsOpen && <button type="button" onClick={() => setContentsOpen(true)}>Contents</button>}<div><strong>Introduction to Pharmacodynamics</strong><small>PDF page {page} of 41</small></div></div>
        <div className="pdf-review-controls">
          <button type="button" onClick={() => movePage(-1)}>Previous</button>
          <label><span className="sr-only">PDF page</span><input type="number" min="1" max="41" value={page} onChange={(event) => setPage(Math.min(41, Math.max(1, Number(event.target.value))))}/><small>/ 41</small></label>
          <button type="button" onClick={() => movePage(1)}>Next</button>
          <button type="button" aria-label="Zoom out" onClick={() => setZoom((current) => Math.max(60, current - 10))}>−</button>
          <button type="button" onClick={() => setZoom(100)}>Fit · {zoom}%</button>
          <button type="button" aria-label="Zoom in" onClick={() => setZoom((current) => Math.min(180, current + 10))}>+</button>
          <button type="button">Pen</button>
          <button type="button" className={marked.includes(page) ? "active" : ""} onClick={toggleMarked}>{marked.includes(page) ? "Marked" : "Mark"}</button>
          <button type="button" aria-label="Close viewer"><AppIcon name="x"/></button>
        </div>
      </header>
      <div className="pdf-review-canvas">
        <article className="pdf-review-slide" style={{ width:`${zoom}%` }}>
          <h3>Receptor States</h3><div className="pdf-review-rule"/>
          <div className="pdf-review-slide-grid">
            <div><p><i/>Receptor basal states:</p><ul><li>Reversible equilibrium between R<sub>a</sub> (produces effect) and R<sub>i</sub> (no effect)</li><li>Usually favors inactive receptor</li><li><strong>Constitutive activity:</strong> activity of R<sub>a</sub> &gt; R<sub>i</sub> in the absence of ligand</li></ul><p><i/>Drug (D) + Receptor (R) ↔ DR complex</p><p className="pdf-review-effect">↓<br/>Biological effect ← DR<sub>a</sub> (activated)</p></div>
            <figure><div><span>R<sub>i</sub></span><b>↔</b><span>R<sub>a</sub></span></div><div><b>↕</b><b>↕</b></div><div><span>R<sub>i</sub>–D</span><b>↔</b><span>R<sub>a</sub>–D</span></div><figcaption>Receptor equilibrium model</figcaption></figure>
          </div>
        </article>
      </div>
    </div>
  </section>;
}
