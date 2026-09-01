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

export function PdfCanvasViewer({ file, lectureId, page, zoom, inkStrokes, penEnabled, onInkChange }: { file: Blob; lectureId: string; page: number; zoom:number; inkStrokes: InkStroke[]; penEnabled: boolean; onInkChange(strokes: InkStroke[]): void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inkCanvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const draftInkRef = useRef<InkPoint[] | null>(null);
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
    <div className="pdf-canvas-content"><div className={`pdf-page-stack ${penEnabled ? "pen-active" : ""}`}><canvas ref={canvasRef} aria-label={`PDF page ${page}`} /><div ref={textLayerRef} className="pdf-text-layer textLayer" aria-label={`Selectable text for PDF page ${page}`} /><canvas ref={inkCanvasRef} className={`pdf-ink-layer ${penEnabled ? "drawing" : ""}`} aria-label={`Pen markup for PDF page ${page}`} onPointerDown={startInk} onPointerMove={continueInk} onPointerUp={finishInk} onPointerCancel={finishInk} /></div></div>
  </div>;
}

