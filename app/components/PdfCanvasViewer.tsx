"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { InkPoint, InkStroke } from "../../lib/lecture-store";
import { pdfjs } from "../../lib/pdf-runtime";

type PdfDocument = {
  numPages: number;
  getPage(page: number): Promise<{
    getViewport(options: { scale: number }): { width: number; height: number };
    getTextContent(): Promise<unknown>;
    render(options: { canvas: HTMLCanvasElement; canvasContext: CanvasRenderingContext2D; viewport: unknown; transform?: number[] }): { promise: Promise<void> };
  }>;
};

type PdfTextLayer = { render(): Promise<unknown>; cancel(): void };

function drawInkStrokes(canvas: HTMLCanvasElement, strokes: InkStroke[]) {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.lineCap = "round";
  context.lineJoin = "round";
  strokes.forEach((stroke) => {
    if (!stroke.points.length) return;
    const highlighter = stroke.tool === "highlighter";
    const color = highlighter ? "#f2cf45" : stroke.color ?? "#a62828";
    const width = stroke.width ?? 2;
    context.globalAlpha = highlighter ? .32 : 1;
    context.globalCompositeOperation = highlighter ? "multiply" : "source-over";
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = Math.max(2, canvas.width / (highlighter ? 120 / width : 720 / width));
    context.beginPath();
    context.moveTo(stroke.points[0].x * canvas.width, stroke.points[0].y * canvas.height);
    stroke.points.slice(1).forEach((point) => context.lineTo(point.x * canvas.width, point.y * canvas.height));
    if (stroke.points.length === 1) {
      context.arc(stroke.points[0].x * canvas.width, stroke.points[0].y * canvas.height, context.lineWidth / 2, 0, Math.PI * 2);
      context.fill();
    } else context.stroke();
  });
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
}

function distanceToSegment(point: InkPoint, start: InkPoint, end: InkPoint) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return Math.hypot(point.x - start.x, point.y - start.y);
  const amount = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + amount * dx), point.y - (start.y + amount * dy));
}

function strokeTouchesPoint(stroke: InkStroke, point: InkPoint) {
  if (stroke.points.length === 1) return Math.hypot(point.x - stroke.points[0].x, point.y - stroke.points[0].y) < .025;
  return stroke.points.slice(1).some((end, index) => distanceToSegment(point, stroke.points[index], end) < .025);
}

const pdfDocumentCache = new Map<string, Promise<PdfDocument>>();
const MAX_CANVAS_AREA = 12_000_000;
const MAX_CANVAS_EDGE = 4096;

function safeOutputScale(width: number, height: number) {
  const requested = Math.min(window.devicePixelRatio || 1, 2);
  const areaScale = Math.sqrt(MAX_CANVAS_AREA / Math.max(1, width * height));
  const edgeScale = Math.min(MAX_CANVAS_EDGE / Math.max(1, width), MAX_CANVAS_EDGE / Math.max(1, height));
  return Math.max(.5, Math.min(requested, areaScale, edgeScale));
}

function loadPdfDocument(lectureId: string, file: Blob) {
  const cached = pdfDocumentCache.get(lectureId);
  if (cached) return cached;
  const promise = (async () => {
    const data = new Uint8Array(await file.arrayBuffer());
    return await pdfjs.getDocument({ data }).promise as unknown as PdfDocument;
  })();
  pdfDocumentCache.set(lectureId, promise);
  promise.catch(() => pdfDocumentCache.delete(lectureId));
  return promise;
}

export function PdfCanvasViewer({ file, lectureId, page, zoom, inkStrokes, penEnabled, onInkChange, onZoomChange }: { file: Blob; lectureId: string; page: number; zoom:number; inkStrokes: InkStroke[]; penEnabled: boolean; onInkChange(strokes: InkStroke[]): void; onZoomChange(zoom: number): void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inkCanvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const draftInkRef = useRef<InkPoint[] | null>(null);
  const inkPointerIdRef = useRef<number | null>(null);
  const touchPointsRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; zoom: number; targetZoom: number } | null>(null);
  const currentInkRef = useRef(inkStrokes);
  const eraserStartRef = useRef<InkStroke[] | null>(null);
  const eraserDraftRef = useRef<InkStroke[] | null>(null);
  const undoStackRef = useRef<InkStroke[][]>([]);
  const redoStackRef = useRef<InkStroke[][]>([]);
  const [pinchScale, setPinchScale] = useState(1);
  const [inkMode, setInkMode] = useState<"pen" | "highlighter" | "eraser">("pen");
  const [inkColor, setInkColor] = useState("#1f2326");
  const [inkWidth, setInkWidth] = useState(2);
  const [history, setHistory] = useState({ undo:0, redo:0 });
  const [document, setDocument] = useState<PdfDocument | null>(null);
  const [availableSize, setAvailableSize] = useState({ width:800, height:600 });
  const [status, setStatus] = useState("Loading PDF…");
  const [textLayerVersion, setTextLayerVersion] = useState(0);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setAvailableSize({ width:Math.max(320, entry.contentRect.width - 36), height:Math.max(260, entry.contentRect.height - 36) }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loaded = await loadPdfDocument(lectureId, file);
      if (!cancelled) { setDocument(loaded); setStatus(""); }
    })().catch(() => !cancelled && setStatus("The PDF page could not be rendered."));
    return () => { cancelled = true; };
  }, [file, lectureId]);

  useEffect(() => {
    if (!document || !canvasRef.current || !inkCanvasRef.current || !textLayerRef.current) return;
    let cancelled = false;
    let renderedTextLayer: PdfTextLayer | null = null;
    setStatus("Rendering page…");
    void (async () => {
      const pdfPage = await document.getPage(Math.min(Math.max(page, 1), document.numPages));
      if (cancelled) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const fitScale = Math.min(availableSize.width / base.width, availableSize.height / base.height, 2.2);
      const scale = fitScale * zoom;
      const viewport = pdfPage.getViewport({ scale });
      const stagingCanvas = window.document.createElement("canvas");
      const context = stagingCanvas.getContext("2d");
      if (!context) return;
      const outputScale = safeOutputScale(viewport.width, viewport.height);
      stagingCanvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
      stagingCanvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
      const renderTask = pdfPage.render({ canvas: stagingCanvas, canvasContext: context, viewport, transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0] });
      await renderTask.promise;
      if (cancelled || !canvasRef.current) return;
      const canvas = canvasRef.current;
      const visibleContext = canvas.getContext("2d");
      if (!visibleContext) return;
      canvas.width = stagingCanvas.width;
      canvas.height = stagingCanvas.height;
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      visibleContext.drawImage(stagingCanvas, 0, 0);
      const inkCanvas = inkCanvasRef.current;
      if (inkCanvas) {
        inkCanvas.width = stagingCanvas.width;
        inkCanvas.height = stagingCanvas.height;
        inkCanvas.style.width = `${Math.floor(viewport.width)}px`;
        inkCanvas.style.height = `${Math.floor(viewport.height)}px`;
      }
      setTextLayerVersion((current) => current + 1);
      setStatus("");
      // Selection is additive. A browser-specific text-layer failure must not
      // suppress an otherwise successfully rendered PDF page.
      try {
        const textContent = await pdfPage.getTextContent();
        const textLayerContainer = textLayerRef.current;
        if (!textLayerContainer || cancelled) return;
        textLayerContainer.replaceChildren();
        textLayerContainer.style.setProperty("--total-scale-factor", String(scale));
        textLayerContainer.style.setProperty("--scale-round-x", "1px");
        textLayerContainer.style.setProperty("--scale-round-y", "1px");
        const TextLayer = pdfjs.TextLayer as unknown as new (options: { textContentSource: unknown; container: HTMLElement; viewport: unknown }) => PdfTextLayer;
        renderedTextLayer = new TextLayer({ textContentSource: textContent, container: textLayerContainer, viewport });
        await renderedTextLayer.render();
      } catch (error) {
        console.warn("FCOM.lib could not render selectable PDF text on this browser.", error);
      }
    })().catch(() => { if (!cancelled) setStatus("The PDF page could not be rendered."); });
    return () => { cancelled = true; renderedTextLayer?.cancel(); };
  }, [availableSize, document, page, zoom]);

  useEffect(() => {
    if (inkCanvasRef.current) drawInkStrokes(inkCanvasRef.current, inkStrokes);
  }, [inkStrokes, textLayerVersion]);

  function inkPoint(event: PointerEvent<HTMLDivElement>): InkPoint {
    const bounds = inkCanvasRef.current?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)), y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)) };
  }

  function commitInk(next: InkStroke[], previous = currentInkRef.current) {
    undoStackRef.current.push(previous);
    redoStackRef.current = [];
    currentInkRef.current = next;
    setHistory({ undo:undoStackRef.current.length, redo:0 });
    onInkChange(next);
  }

  function undoInk() {
    const previous = undoStackRef.current.pop();
    if (!previous) return;
    redoStackRef.current.push(currentInkRef.current);
    currentInkRef.current = previous;
    setHistory({ undo:undoStackRef.current.length, redo:redoStackRef.current.length });
    onInkChange(previous);
  }

  function redoInk() {
    const next = redoStackRef.current.pop();
    if (!next) return;
    undoStackRef.current.push(currentInkRef.current);
    currentInkRef.current = next;
    setHistory({ undo:undoStackRef.current.length, redo:redoStackRef.current.length });
    onInkChange(next);
  }

  function startInk(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") {
      touchPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      event.currentTarget.setPointerCapture(event.pointerId);
      if (touchPointsRef.current.size === 2) {
        const [first, second] = Array.from(touchPointsRef.current.values());
        pinchRef.current = { distance: Math.hypot(second.x - first.x, second.y - first.y), zoom, targetZoom: zoom };
      }
      return;
    }
    if (!penEnabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    inkPointerIdRef.current = event.pointerId;
    if (inkMode === "eraser") {
      eraserStartRef.current = currentInkRef.current;
      eraserDraftRef.current = currentInkRef.current.filter((stroke) => !strokeTouchesPoint(stroke, inkPoint(event)));
      if (inkCanvasRef.current) drawInkStrokes(inkCanvasRef.current, eraserDraftRef.current);
      return;
    }
    draftInkRef.current = [inkPoint(event)];
    if (inkCanvasRef.current) drawInkStrokes(inkCanvasRef.current, [...currentInkRef.current, { id: "draft", points: draftInkRef.current, tool:inkMode, color:inkColor, width:inkWidth }]);
  }

  function continueInk(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") {
      if (!touchPointsRef.current.has(event.pointerId)) return;
      touchPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const pinch = pinchRef.current;
      if (pinch && touchPointsRef.current.size >= 2) {
        const [first, second] = Array.from(touchPointsRef.current.values());
        const distance = Math.hypot(second.x - first.x, second.y - first.y);
        const targetZoom = Math.min(2.5, Math.max(.6, pinch.zoom * distance / Math.max(1, pinch.distance)));
        pinch.targetZoom = targetZoom;
        setPinchScale(targetZoom / pinch.zoom);
      }
      return;
    }
    if (!penEnabled || inkPointerIdRef.current !== event.pointerId) return;
    if (inkMode === "eraser" && eraserDraftRef.current) {
      eraserDraftRef.current = eraserDraftRef.current.filter((stroke) => !strokeTouchesPoint(stroke, inkPoint(event)));
      if (inkCanvasRef.current) drawInkStrokes(inkCanvasRef.current, eraserDraftRef.current);
      return;
    }
    if (!draftInkRef.current) return;
    draftInkRef.current.push(inkPoint(event));
    if (inkCanvasRef.current) drawInkStrokes(inkCanvasRef.current, [...currentInkRef.current, { id: "draft", points: draftInkRef.current, tool:inkMode, color:inkColor, width:inkWidth }]);
  }

  function finishInk(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") {
      touchPointsRef.current.delete(event.pointerId);
      if (touchPointsRef.current.size < 2 && pinchRef.current) {
        const targetZoom = pinchRef.current.targetZoom;
        pinchRef.current = null;
        setPinchScale(1);
        onZoomChange(Number(targetZoom.toFixed(2)));
      }
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    if (!penEnabled || inkPointerIdRef.current !== event.pointerId) return;
    if (inkMode === "eraser" && eraserStartRef.current && eraserDraftRef.current) {
      const previous = eraserStartRef.current;
      const next = eraserDraftRef.current;
      eraserStartRef.current = null;
      eraserDraftRef.current = null;
      inkPointerIdRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      if (next.length !== previous.length) commitInk(next, previous);
      return;
    }
    const points = draftInkRef.current;
    if (!points?.length) return;
    draftInkRef.current = null;
    inkPointerIdRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    commitInk([...currentInkRef.current, { id: crypto.randomUUID(), points, tool:inkMode, color:inkColor, width:inkWidth }]);
  }

  return <div className="pdf-canvas-wrap" ref={containerRef}>
    {status && <span className="pdf-status">{status}</span>}
    {penEnabled && <div className="pdf-ink-toolbar" aria-label="Annotation tools">
      <button className={inkMode === "pen" ? "active" : ""} onClick={() => setInkMode("pen")}>Pen</button>
      <button className={inkMode === "highlighter" ? "active" : ""} onClick={() => setInkMode("highlighter")}>Highlight</button>
      <button className={inkMode === "eraser" ? "active" : ""} onClick={() => setInkMode("eraser")}>Eraser</button>
      <span className="pdf-ink-divider" />
      {[1, 2, 3].map((width) => <button key={width} className={`pdf-ink-width ${inkWidth === width ? "active" : ""}`} aria-label={`${width === 1 ? "Fine" : width === 2 ? "Medium" : "Broad"} stroke`} onClick={() => setInkWidth(width)}><i style={{ width:`${width * 3 + 2}px`, height:`${width * 3 + 2}px` }} /></button>)}
      <span className="pdf-ink-divider" />
      {["#1f2326", "#a62828", "#285f9e", "#397052"].map((color) => <button key={color} className={`pdf-ink-color ${inkColor === color ? "active" : ""}`} aria-label={`Use ${color} ink`} onClick={() => { setInkColor(color); setInkMode("pen"); }}><i style={{ background:color }} /></button>)}
      <span className="pdf-ink-divider" />
      <button disabled={!history.undo} onClick={undoInk}>Undo</button>
      <button disabled={!history.redo} onClick={redoInk}>Redo</button>
    </div>}
    <div className="pdf-canvas-content"><div className={`pdf-page-stack ${penEnabled ? "pen-active" : ""}`} style={{ transform:`scale(${pinchScale})`, transformOrigin:"center center", touchAction:"none" }} onPointerDown={startInk} onPointerMove={continueInk} onPointerUp={finishInk} onPointerCancel={finishInk}><canvas ref={canvasRef} aria-label={`PDF page ${page}`} /><div ref={textLayerRef} className="pdf-text-layer textLayer" aria-label={`Selectable text for PDF page ${page}`} /><canvas ref={inkCanvasRef} className={`pdf-ink-layer ${penEnabled ? "drawing" : ""}`} aria-label={`Pen markup for PDF page ${page}`} /></div></div>
  </div>;
}

