"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { InkPoint, InkStroke } from "../../lib/lecture-store";

type PdfDocument = {
  numPages: number;
  getPage(page: number): Promise<{
    getViewport(options: { scale: number }): { width: number; height: number };
    getTextContent(): Promise<unknown>;
    render(options: { canvas: HTMLCanvasElement; canvasContext: CanvasRenderingContext2D; viewport: unknown; transform?: number[] }): { promise: Promise<void> };
  }>;
};

type PdfTextLayer = { render(): Promise<unknown>; cancel(): void };

function conceptHighlightRanges(layer: HTMLElement, phrases: string[]) {
  const walker = window.document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  const starts: Array<{ node: Node; offset: number }> = [];
  const ends: Array<{ node: Node; offset: number }> = [];
  let normalized = "";
  let node = walker.nextNode();
  while (node) {
    const value = node.textContent ?? "";
    for (let offset = 0; offset < value.length; offset += 1) {
      const character = value[offset];
      if (/\s/.test(character)) {
        if (normalized.endsWith(" ")) ends[ends.length - 1] = { node, offset: offset + 1 };
        else {
          normalized += " ";
          starts.push({ node, offset });
          ends.push({ node, offset: offset + 1 });
        }
      } else {
        normalized += character;
        starts.push({ node, offset });
        ends.push({ node, offset: offset + 1 });
      }
    }
    node = walker.nextNode();
  }

  const ranges: Range[] = [];
  const searchable = normalized.toLocaleLowerCase();
  for (const phrase of phrases) {
    const needle = phrase.replace(/\s+/g, " ").trim().toLocaleLowerCase();
    if (!needle) continue;
    let match = searchable.indexOf(needle);
    while (match >= 0) {
      const start = starts[match];
      const end = ends[match + needle.length - 1];
      if (start && end) {
        const range = window.document.createRange();
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset);
        ranges.push(range);
      }
      match = searchable.indexOf(needle, match + needle.length);
    }
  }
  return ranges;
}

function drawInkStrokes(canvas: HTMLCanvasElement, strokes: InkStroke[]) {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#a62828";
  context.fillStyle = "#a62828";
  context.lineWidth = Math.max(2, canvas.width / 420);
  context.lineCap = "round";
  context.lineJoin = "round";
  strokes.forEach((stroke) => {
    if (!stroke.points.length) return;
    context.beginPath();
    context.moveTo(stroke.points[0].x * canvas.width, stroke.points[0].y * canvas.height);
    stroke.points.slice(1).forEach((point) => context.lineTo(point.x * canvas.width, point.y * canvas.height));
    if (stroke.points.length === 1) {
      context.arc(stroke.points[0].x * canvas.width, stroke.points[0].y * canvas.height, context.lineWidth / 2, 0, Math.PI * 2);
      context.fill();
    } else context.stroke();
  });
}

const pdfDocumentCache = new Map<string, Promise<PdfDocument>>();

function loadPdfDocument(lectureId: string, file: Blob) {
  const cached = pdfDocumentCache.get(lectureId);
  if (cached) return cached;
  const promise = (async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
    const data = new Uint8Array(await file.arrayBuffer());
    return await pdfjs.getDocument({ data }).promise as unknown as PdfDocument;
  })();
  pdfDocumentCache.set(lectureId, promise);
  promise.catch(() => pdfDocumentCache.delete(lectureId));
  return promise;
}

export function PdfCanvasViewer({ file, lectureId, page, selectedText, bankedConceptTexts, inkStrokes, penEnabled, onSelectionChange, onAddConcept, onInkChange }: { file: Blob; lectureId: string; page: number; selectedText: string; bankedConceptTexts: string[]; inkStrokes: InkStroke[]; penEnabled: boolean; onSelectionChange(text: string): void; onAddConcept(): void; onInkChange(strokes: InkStroke[]): void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inkCanvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const draftInkRef = useRef<InkPoint[] | null>(null);
  const [document, setDocument] = useState<PdfDocument | null>(null);
  const [width, setWidth] = useState(800);
  const [status, setStatus] = useState("Loading PDF…");
  const [textLayerVersion, setTextLayerVersion] = useState(0);

  useEffect(() => {
    const style = window.document.createElement("style");
    style.textContent = "::highlight(fcom-lib-banked-concepts){background:rgba(229,197,92,.45);color:transparent}";
    window.document.head.append(style);
    return () => style.remove();
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(320, entry.contentRect.width - 36)));
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
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const pdfPage = await document.getPage(Math.min(Math.max(page, 1), document.numPages));
      if (cancelled) return;
      const base = pdfPage.getViewport({ scale: 1 });
      const scale = Math.min(width / base.width, 2.2);
      const viewport = pdfPage.getViewport({ scale });
      const stagingCanvas = window.document.createElement("canvas");
      const context = stagingCanvas.getContext("2d");
      if (!context) return;
      const outputScale = Math.min(window.devicePixelRatio || 1, 2);
      stagingCanvas.width = Math.floor(viewport.width * outputScale);
      stagingCanvas.height = Math.floor(viewport.height * outputScale);
      const renderTask = pdfPage.render({ canvas: stagingCanvas, canvasContext: context, viewport, transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0] });
      const textContent = await pdfPage.getTextContent();
      const textLayerContainer = textLayerRef.current;
      if (!textLayerContainer) return;
      textLayerContainer.replaceChildren();
      textLayerContainer.style.setProperty("--total-scale-factor", String(scale));
      textLayerContainer.style.setProperty("--scale-round-x", "1px");
      textLayerContainer.style.setProperty("--scale-round-y", "1px");
      const TextLayer = pdfjs.TextLayer as unknown as new (options: { textContentSource: unknown; container: HTMLElement; viewport: unknown }) => PdfTextLayer;
      renderedTextLayer = new TextLayer({ textContentSource: textContent, container: textLayerContainer, viewport });
      await Promise.all([renderTask.promise, renderedTextLayer.render()]);
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
    })().catch(() => { if (!cancelled) setStatus("The PDF page could not be rendered."); });
    return () => { cancelled = true; renderedTextLayer?.cancel(); };
  }, [document, page, width]);

  useEffect(() => {
    function captureSelection() {
      const selection = window.getSelection();
      const layer = textLayerRef.current;
      if (!selection || selection.isCollapsed || !layer || !selection.rangeCount || !layer.contains(selection.getRangeAt(0).commonAncestorContainer)) {
        onSelectionChange("");
        return;
      }
      onSelectionChange(selection.toString().replace(/\s+/g, " ").trim().slice(0, 500));
    }
    window.document.addEventListener("selectionchange", captureSelection);
    return () => window.document.removeEventListener("selectionchange", captureSelection);
  }, [onSelectionChange, page]);

  useEffect(() => {
    const layer = textLayerRef.current;
    const registry = CSS.highlights;
    if (!layer || !registry) return;
    const highlightName = "fcom-lib-banked-concepts";
    const ranges = conceptHighlightRanges(layer, bankedConceptTexts);
    if (ranges.length > 0) registry.set(highlightName, new Highlight(...ranges));
    else registry.delete(highlightName);
    return () => { registry.delete(highlightName); };
  }, [bankedConceptTexts, page, textLayerVersion]);

  useEffect(() => {
    if (inkCanvasRef.current) drawInkStrokes(inkCanvasRef.current, inkStrokes);
  }, [inkStrokes, textLayerVersion]);

  function inkPoint(event: PointerEvent<HTMLCanvasElement>): InkPoint {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)), y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)) };
  }

  function startInk(event: PointerEvent<HTMLCanvasElement>) {
    if (!penEnabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    draftInkRef.current = [inkPoint(event)];
    drawInkStrokes(event.currentTarget, [...inkStrokes, { id: "draft", points: draftInkRef.current }]);
  }

  function continueInk(event: PointerEvent<HTMLCanvasElement>) {
    if (!penEnabled || !draftInkRef.current || !(event.buttons & 1)) return;
    draftInkRef.current.push(inkPoint(event));
    drawInkStrokes(event.currentTarget, [...inkStrokes, { id: "draft", points: draftInkRef.current }]);
  }

  function finishInk(event: PointerEvent<HTMLCanvasElement>) {
    const points = draftInkRef.current;
    if (!penEnabled || !points?.length) return;
    draftInkRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    onInkChange([...inkStrokes, { id: crypto.randomUUID(), points }]);
  }

  return <div className="pdf-canvas-wrap" ref={containerRef}>
    {status && <span className="pdf-status">{status}</span>}
    <div className="pdf-canvas-content"><div className={`pdf-page-stack ${penEnabled ? "pen-active" : ""}`}><canvas ref={canvasRef} aria-label={`PDF page ${page}`} /><div ref={textLayerRef} className="pdf-text-layer textLayer" aria-label={`Selectable text for PDF page ${page}`} /><canvas ref={inkCanvasRef} className={`pdf-ink-layer ${penEnabled ? "drawing" : ""}`} aria-label={`Pen markup for PDF page ${page}`} onPointerDown={startInk} onPointerMove={continueInk} onPointerUp={finishInk} onPointerCancel={finishInk} /></div>
      <div className="concept-capture-slot">{selectedText && <button className="concept-capture" onMouseDown={(event) => event.preventDefault()} onClick={onAddConcept}><span>Add to concept bank</span><small>{selectedText}</small></button>}</div>
    </div>
  </div>;
}


