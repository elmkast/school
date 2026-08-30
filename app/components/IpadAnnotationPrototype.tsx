"use client";

import { useRef, useState, type PointerEvent } from "react";

type Tool = "pen" | "highlighter" | "eraser";
type Point = { x: number; y: number; pressure: number };
type Stroke = { id: string; tool: Exclude<Tool, "eraser">; color: string; points: Point[] };

function segments(stroke: Stroke) {
  return stroke.points.slice(1).map((point, index) => {
    const previous = stroke.points[index];
    const width = stroke.tool === "highlighter" ? 22 : 2.2 + Math.max(previous.pressure, point.pressure) * 5.5;
    return <line key={`${stroke.id}-${index}`} x1={previous.x} y1={previous.y} x2={point.x} y2={point.y} stroke={stroke.color} strokeWidth={width} strokeOpacity={stroke.tool === "highlighter" ? .28 : .92} strokeLinecap="round"/>;
  });
}

export function IpadAnnotationPrototype() {
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#a52828");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redo, setRedo] = useState<Stroke[]>([]);
  const [draft, setDraft] = useState<Stroke | null>(null);
  const [saved, setSaved] = useState(true);
  const surfaceRef = useRef<SVGSVGElement>(null);
  const saveTimeoutRef = useRef<number | null>(null);

  function scheduleSave() { setSaved(false); if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current); saveTimeoutRef.current = window.setTimeout(() => setSaved(true), 550); }

  function pointFor(event: PointerEvent<SVGSVGElement>): Point {
    const bounds = event.currentTarget.getBoundingClientRect();
    const pressure = event.pointerType === "mouse" ? .45 : Math.max(.12, event.pressure || .35);
    return { x:(event.clientX - bounds.left) / bounds.width * 1000, y:(event.clientY - bounds.top) / bounds.height * 562.5, pressure };
  }

  function start(event: PointerEvent<SVGSVGElement>) {
    if (event.pointerType === "touch") return;
    const point = pointFor(event);
    if (tool === "eraser") {
      let closest = ""; let distance = 28;
      strokes.forEach((stroke) => stroke.points.forEach((candidate) => { const current = Math.hypot(candidate.x - point.x, candidate.y - point.y); if (current < distance) { distance = current; closest = stroke.id; } }));
      if (closest) { const removed = strokes.find((stroke) => stroke.id === closest); setStrokes((current) => current.filter((stroke) => stroke.id !== closest)); if (removed) setRedo((current) => [...current, removed]); scheduleSave(); }
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraft({ id:crypto.randomUUID(), tool, color, points:[point] });
  }

  function move(event: PointerEvent<SVGSVGElement>) {
    if (!draft || event.pointerType === "touch" || !(event.buttons & 1)) return;
    const next = pointFor(event); setDraft((current) => current ? { ...current, points:[...current.points, next] } : null);
  }

  function finish(event: PointerEvent<SVGSVGElement>) {
    if (!draft) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (draft.points.length > 1) { setStrokes((current) => [...current, draft]); scheduleSave(); }
    setDraft(null); setRedo([]);
  }

  function undo() { const removed = strokes.at(-1); if (!removed) return; setStrokes(strokes.slice(0, -1)); setRedo([...redo, removed]); scheduleSave(); }
  function redoStroke() { const restored = redo.at(-1); if (!restored) return; setRedo(redo.slice(0, -1)); setStrokes([...strokes, restored]); scheduleSave(); }

  return <section className="ipad-annotation-prototype" aria-label="iPad annotation mode prototype">
    <header><div><h2>iPad Annotation Mode</h2><p>Apple Pencil draws. One finger navigates. Mouse simulates Pencil here.</p></div><span className={saved ? "saved" : "saving"}>{saved ? "Saved" : "Saving…"}</span></header>
    <div className="ipad-annotation-viewer">
      <nav className="ipad-tool-palette" aria-label="Annotation tools"><button className={tool === "pen" ? "active" : ""} onClick={() => setTool("pen")}>Pen</button><button className={tool === "highlighter" ? "active" : ""} onClick={() => setTool("highlighter")}>Highlight</button><button className={tool === "eraser" ? "active" : ""} onClick={() => setTool("eraser")}>Erase</button><i/><button disabled={!strokes.length} onClick={undo}>Undo</button><button disabled={!redo.length} onClick={redoStroke}>Redo</button><i/><label aria-label="Ink color"><input type="color" value={color} onChange={(event) => setColor(event.target.value)}/></label><button disabled={!strokes.length} onClick={() => { setRedo(strokes); setStrokes([]); scheduleSave(); }}>Clear</button></nav>
      <div className="ipad-slide-frame">
        <article className="ipad-slide-fixture"><h3>Receptor States</h3><div/><section><p>Receptor basal states</p><ul><li>Reversible equilibrium between active and inactive states</li><li>Usually favors the inactive receptor</li><li><strong>Constitutive activity</strong> occurs in the absence of ligand</li></ul><p>Drug + Receptor ↔ Drug–Receptor complex</p></section></article>
        <svg ref={surfaceRef} className={`ipad-ink-surface tool-${tool}`} viewBox="0 0 1000 562.5" onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}>{strokes.map((stroke) => <g key={stroke.id}>{segments(stroke)}</g>)}{draft && <g>{segments(draft)}</g>}</svg>
      </div>
      <footer><span>Page 17 / 41</span><span>{strokes.length} stroke{strokes.length === 1 ? "" : "s"}</span></footer>
    </div>
  </section>;
}
