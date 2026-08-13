"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { deleteLecture, deletePreRead, getLectureFile, getPreReadFile, loadCloudLibrary, loadConcepts, loadLectures, loadPreReads, migrateLocalLibraryToCloud, normalizeLecture, saveConcept, saveLecture, saveLectures, savePreRead, setCloudUser, type ConceptRecord, type InkPoint, type InkStroke, type Lecture, type MigrationProgress, type PreRead, type PreReadStatus, type Slide } from "../lib/lecture-store";
import { downloadSloExcel } from "../lib/slo-excel";
import { downloadSloPdf } from "../lib/slo-pdf";
import { cloudConfigured, supabase, type CloudSession } from "../lib/supabase-client";
import { clearUploadDiagnosticCheckpoint, downloadDiagnostics, recordDiagnostic, setUploadDiagnosticCheckpoint } from "../lib/diagnostics";

const seedLectures: Lecture[] = [
  {
    id: "dna-tech",
    title: "DNA Technology and its Applications",
    lecturer: "Katherine Mitsouras, PhD",
    date: "August 10, 2026",
    course: "Medical & Clinical Foundations",
    academicYear: "2026-2027",
    favorite: false,
    pages: 57,
    slos: [
      "Describe genetic linkage analysis, its use in identifying disease genes, and its limitations.",
      "Describe how whole-genome and whole-exome sequencing identify genes for monogenic disease.",
      "Select WES or linkage analysis for an appropriate clinical scenario.",
      "Compare molecular diagnostic techniques used in genetic testing.",
      "Describe Northern blotting and gene-expression microarrays.",
      "Explain basic gene-therapy approaches and DNA-delivery methods.",
      "Describe drawbacks of gene-therapy approaches.",
      "Explain genome editing and CRISPR/Cas treatment of monogenic disease.",
    ],
    concepts: ["Linkage analysis", "WES / WGS", "GWAS", "PCR", "Southern blot", "Sanger sequencing", "Gene therapy", "CRISPR/Cas"],
    outline: ["Identifying the genetic basis of disease", "Diagnostic testing and screening", "Gene expression methods", "DNA methods for treatment", "Genome editing with CRISPR/Cas"],
    summary: "Methods for identifying disease genes, diagnosing monogenic disorders, measuring gene expression, and treating genetic disease through gene therapy and genome editing.",
    notes: {},
    markups: {},
    markedSlides: [],
    flaggedSLOs: [],
    slides: [
      { page: 7, heading: "Disease gene identification", text: "Linkage analysis maps a region containing a disease gene; whole-genome and exome sequencing identify causative genes and mutations." },
      { page: 16, heading: "Whole Exome Sequencing", text: "WES captures and sequences exons, which comprise about 2% of the genome and contain many disease-causing mutations." },
      { page: 39, heading: "Diagnostic testing methods", text: "PCR, PCR-RFLP, ARMS-PCR, ASO hybridization, Southern blotting and Sanger sequencing differ by whether the mutation is known and by mutation type." },
      { page: 49, heading: "CRISPR/Cas", text: "CRISPR-associated proteins and guide RNA enable targeted genome editing; repair can introduce a desired DNA sequence." },
    ],
    createdAt: "2026-08-10T08:00:00.000Z",
  },
  {
    id: "intro-cytogenetics",
    title: "Introduction to Cytogenetics",
    lecturer: "Katherine Mitsouras, PhD",
    date: "August 3, 2026",
    course: "Medical & Clinical Foundations",
    academicYear: "2026-2027",
    favorite: false,
    pages: 40,
    slos: [
      "Explain the uses and limitations of G-banded karyotype, FISH, and array CGH.",
      "Describe structural chromosome variation and how it causes disease.",
      "Describe mechanisms underlying changes in chromosome ploidy and the association with maternal age.",
      "Define reciprocal and Robertsonian translocations and familial trisomy 21.",
      "Explain clinical manifestations in offspring of balanced-translocation carriers.",
      "Describe the three viable autosomal trisomies and prenatal measurement of nuchal translucency.",
      "Select an appropriate laboratory method for a cytogenetic abnormality.",
    ],
    concepts: ["ISCN nomenclature", "Karyotype", "FISH", "Array CGH", "Aneuploidy", "Mosaicism", "Translocations", "Deletions", "Inversions"],
    outline: ["Chromosome morphology and ISCN nomenclature", "Methods for chromosome analysis", "Numerical chromosome abnormalities", "Structural chromosome abnormalities", "Clinical syndromes and laboratory selection"],
    summary: "Chromosome morphology and nomenclature, cytogenetic testing methods, numerical abnormalities, structural rearrangements, and associated clinical syndromes.",
    notes: {},
    markups: {},
    markedSlides: [],
    flaggedSLOs: [],
    slides: [
      { page: 8, heading: "Chromosome nomenclature", text: "ISCN positions use chromosome number, p or q arm, region, band and sub-band." },
      { page: 18, heading: "Comparison of chromosome analysis", text: "Chromosome banding, FISH and array CGH differ in resolution and ability to detect balanced rearrangements or DNA copy-number changes." },
      { page: 21, heading: "Changes in ploidy", text: "Meiotic nondisjunction produces disomic and nullisomic gametes and occurs more frequently with advanced maternal age." },
      { page: 29, heading: "Translocations", text: "Reciprocal translocations exchange material between chromosomes. Robertsonian translocations fuse two acrocentric chromosomes." },
    ],
    createdAt: "2026-08-03T08:00:00.000Z",
  },
];

function readableError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "An unexpected cloud error occurred.";
}

function detectSLOs(slides: Slide[]) {
  const objectiveSlide = slides.find((slide) => /learning objectives?|session objectives?/i.test(slide.text));
  if (!objectiveSlide) return [];
  const body = objectiveSlide.text.replace(/^.*?(learning objectives?|session objectives?)[:\s-]*/i, "");
  const numbered = body.split(/\s+(?=\d+[.)]\s+)/).map((value) => value.replace(/^\d+[.)]\s*/, "").trim()).filter(Boolean);
  return numbered.length > 1 ? numbered : body.split(/\n+/).map((value) => value.trim()).filter((value) => value.length > 25);
}

function deriveConcepts(slides: Slide[]) {
  return Array.from(new Set(slides.map((slide) => slide.heading.replace(/^\d+\s*/, "").replace(/[:–-].*$/, "").trim()).filter((heading) => heading.length > 3 && !/^slide \d+$/i.test(heading)))).slice(0, 14);
}

function currentAcademicYear() {
  const now = new Date();
  const start = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${start + 1}`;
}

const ALL_LECTURERS = "__all_lecturers__";
const NEW_LECTURER = "__new_lecturer__";

function compareText(left: unknown, right: unknown) {
  return String(left ?? "").localeCompare(String(right ?? ""));
}

function lecturerFolderLabel(lecturer: unknown) {
  const safeLecturer = typeof lecturer === "string" && lecturer.trim() ? lecturer : "Lecturer not detected";
  if (/not detected|unknown|unassigned/i.test(safeLecturer)) return "Unassigned";
  const name = safeLecturer.split(",")[0].trim();
  return name.split(/\s+/).at(-1) || safeLecturer;
}

function lectureDateTimestamp(value: unknown) {
  const timestamp = Date.parse(typeof value === "string" ? value : "");
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function dateInputValue(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayDateFromInput(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function mergeAiLectureBrief(base: Lecture, response: unknown, sourceSlides: Slide[], academicYear: string) {
  const brief = response && typeof response === "object" && !Array.isArray(response) ? response as Record<string, unknown> : {};
  const accepted: Record<string, unknown> = {};
  const rejectedFields: string[] = [];
  const stringFields = ["title", "lecturer", "date", "course", "summary"] as const;
  const listFields = ["outline", "slos"] as const;

  stringFields.forEach((field) => {
    if (!(field in brief)) return;
    if (typeof brief[field] === "string" && brief[field].trim()) accepted[field] = brief[field];
    else rejectedFields.push(field);
  });
  listFields.forEach((field) => {
    if (!(field in brief)) return;
    const values = Array.isArray(brief[field]) ? brief[field].filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
    if (values.length) accepted[field] = values;
    else rejectedFields.push(field);
  });

  const aiSlides = Array.isArray(brief.slides) ? brief.slides : [];
  if ("slides" in brief && !Array.isArray(brief.slides)) rejectedFields.push("slides");
  const aiSlidesByPage = new Map<number, Record<string, unknown>>();
  aiSlides.forEach((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const record = value as Record<string, unknown>;
    if (typeof record.page === "number" && Number.isInteger(record.page) && record.page > 0) aiSlidesByPage.set(record.page, record);
  });
  const slides = sourceSlides.map((source) => {
    const candidate = aiSlidesByPage.get(source.page);
    if (!candidate) return source;
    return {
      page: source.page,
      heading: typeof candidate.heading === "string" && candidate.heading.trim() ? candidate.heading : source.heading,
      text: typeof candidate.text === "string" && candidate.text.trim() ? candidate.text : source.text,
    };
  });
  const normalized = normalizeLecture({
    ...base,
    ...accepted,
    slides,
    notes: {},
    markups: {},
    markedSlides: [],
    flaggedSLOs: [],
    academicYear,
    favorite: false,
  });
  return { lecture: normalized ?? base, rejectedFields };
}

type UploadStatus = "queued" | "extracting" | "analyzing" | "saving" | "done" | "error";
type UploadJob = { id: string; name: string; status: UploadStatus; error?: string };
type PendingUpload = { id: string; file: File };
type SearchKind = "lecture" | "slo" | "slide" | "preread";
type LectureSearchResult = {
  kind: "lecture" | "slo" | "slide";
  lecture: Lecture;
  title: string;
  text: string;
  score: number;
  page?: number;
  sloIndex?: number;
};
type PreReadSearchResult = {
  kind: "preread";
  preRead: PreRead;
  title: string;
  text: string;
  score: number;
  page?: number;
};
type SearchResult = LectureSearchResult | PreReadSearchResult;

type PreReadDraft = {
  title: string;
  author: string;
  course: string;
  academicYear: string;
  sourceType: "pdf" | "web";
  sourceUrl: string;
  text: string;
};

type LunaChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  page: number;
};

function searchMatchScore(needle: string, title: string, body: string) {
  const normalizedTitle = title.toLowerCase();
  const normalizedBody = body.toLowerCase();
  let score = 0;
  if (normalizedTitle === needle) score += 100;
  else if (normalizedTitle.startsWith(needle)) score += 60;
  else if (normalizedTitle.includes(needle)) score += 40;
  if (normalizedBody.includes(needle)) score += 25;
  for (const token of needle.split(/\s+/).filter((value) => value.length > 1)) {
    if (normalizedTitle.includes(token)) score += 8;
    if (normalizedBody.includes(token)) score += 3;
  }
  return score;
}

function searchResultTimestamp(result: SearchResult) {
  return result.kind === "preread" ? Date.parse(result.preRead.createdAt) || 0 : lectureDateTimestamp(result.lecture.date);
}

function searchResultCollectionTitle(result: SearchResult) {
  return result.kind === "preread" ? result.preRead.title : result.lecture.title;
}

function aiEndpoint(action: "analyze" | "chat" | "reparse-slos") {
  if (typeof window !== "undefined" && !["localhost", "127.0.0.1"].includes(window.location.hostname)) {
    return `/.netlify/functions/${action}`;
  }
  return `/api/${action}`;
}

const uploadStatusLabel: Record<UploadStatus, string> = {
  queued: "Waiting",
  extracting: "Extracting text",
  analyzing: "Structuring with Luna",
  saving: "Saving locally",
  done: "Complete",
  error: "Failed",
};

const preReadStatusLabel: Record<PreReadStatus, string> = {
  unread: "Unread",
  read: "Read",
  rereview: "Re-review",
};

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

function PdfCanvasViewer({ file, lectureId, page, selectedText, bankedConceptTexts, inkStrokes, penEnabled, onSelectionChange, onAddConcept, onInkChange }: { file: Blob; lectureId: string; page: number; selectedText: string; bankedConceptTexts: string[]; inkStrokes: InkStroke[]; penEnabled: boolean; onSelectionChange(text: string): void; onAddConcept(): void; onInkChange(strokes: InkStroke[]): void }) {
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

  function inkPoint(event: React.PointerEvent<HTMLCanvasElement>): InkPoint {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)), y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)) };
  }

  function startInk(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!penEnabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    draftInkRef.current = [inkPoint(event)];
    drawInkStrokes(event.currentTarget, [...inkStrokes, { id: "draft", points: draftInkRef.current }]);
  }

  function continueInk(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!penEnabled || !draftInkRef.current || !(event.buttons & 1)) return;
    draftInkRef.current.push(inkPoint(event));
    drawInkStrokes(event.currentTarget, [...inkStrokes, { id: "draft", points: draftInkRef.current }]);
  }

  function finishInk(event: React.PointerEvent<HTMLCanvasElement>) {
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

function AppIcon({ name }: { name: "library" | "search" | "target" | "upload" | "file" | "spark" | "arrow" | "x" | "star" | "trash" | "folder" | "bookmark" | "flag" | "download" | "link" | "check" }) {
  const paths: Record<string, React.ReactNode> = {
    library: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5v-16Z"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    target: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M22 12h-3M12 22v-3M2 12h3"/></>,
    upload: <><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M5 14v5h14v-5"/></>,
    file: <><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/></>,
    spark: <><path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z"/><path d="m18.5 14 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/></>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>,
    x: <path d="m6 6 12 12M18 6 6 18"/>,
    star: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>,
    trash: <path d="M5 7h14M9 7V4h6v3M8 10v8M12 10v8M16 10v8M6 7l1 14h10l1-14"/>,
    folder: <path d="M3 6h7l2 2h9v11H3z"/>,
    bookmark: <path d="M7 3h10v18l-5-3.5L7 21V3Z"/>,
    flag: <><path d="M6 21V4"/><path d="M6 5h11l-2.5 4L17 13H6"/></>,
    download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M5 19h14"/></>,
    link: <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

type CurriculumTreeProps = {
  lectures: Lecture[];
  academicYears: string[];
  coursesByYear: Record<string, string[]>;
  expandedYear: string | null;
  expandedCourse: string | null;
  selectedYear: string;
  selectedCourse: string;
  selectedLecturer: string;
  allSelected: boolean;
  isCurrentSection: boolean;
  showCounts?: boolean;
  flaggedSelected?: boolean;
  onSelectFlagged?: () => void;
  onSelectYear: (year: string) => void;
  onSelectCourse: (year: string, course: string, courseKey: string) => void;
  onSelectLecturer: (year: string, course: string, lecturer: string) => void;
};

function CurriculumTree({ lectures, academicYears, coursesByYear, expandedYear, expandedCourse, selectedYear, selectedCourse, selectedLecturer, allSelected, isCurrentSection, showCounts = true, flaggedSelected = false, onSelectFlagged, onSelectYear, onSelectCourse, onSelectLecturer }: CurriculumTreeProps) {
  const countItems = (items: Lecture[]) => items.length;
  const folderSelectionIsCurrent = isCurrentSection && !allSelected && !flaggedSelected;
  return <div className="nav-tree">
    {onSelectFlagged && <button className={`tree-all flagged-node ${isCurrentSection && flaggedSelected ? "active" : ""}`} onClick={onSelectFlagged}><span><AppIcon name="flag"/>Flagged SLOs</span></button>}
    {academicYears.map((year) => {
      const yearLectures = lectures.filter((lecture) => lecture.academicYear === year);
      const yearSelected = folderSelectionIsCurrent && selectedYear === year && selectedCourse === "All courses" && selectedLecturer === ALL_LECTURERS;
      return <div className="tree-branch" key={year}>
        <button className={`year-toggle ${expandedYear === year ? "expanded" : ""} ${yearSelected ? "active" : ""}`} aria-expanded={expandedYear === year} onClick={() => onSelectYear(year)}><span className="tree-chevron">›</span><AppIcon name="folder"/><strong>{year}</strong>{showCounts && <b>{countItems(yearLectures)}</b>}</button>
        {expandedYear === year && <div className="tree-children">{(coursesByYear[year] ?? []).map((course) => {
          const courseLectures = yearLectures.filter((lecture) => lecture.course === course);
          const courseKey = `${year}::${course}`;
          const lecturers = Array.from(new Set(courseLectures.map((lecture) => lecture.lecturer))).sort((a, b) => compareText(lecturerFolderLabel(a), lecturerFolderLabel(b)));
          const courseSelected = folderSelectionIsCurrent && selectedYear === year && selectedCourse === course;
          return <div className="course-branch" key={course}>
            <button className={`course-toggle ${expandedCourse === courseKey ? "expanded" : ""} ${courseSelected && selectedLecturer === ALL_LECTURERS ? "active" : ""}`} aria-expanded={expandedCourse === courseKey} onClick={() => onSelectCourse(year, course, courseKey)}><span className="tree-chevron">›</span><AppIcon name="folder"/><span>{course}</span>{showCounts && <b>{countItems(courseLectures)}</b>}</button>
            {expandedCourse === courseKey && <div className="lecturer-children">{lecturers.map((lecturer) => {
              const lecturerLectures = courseLectures.filter((lecture) => lecture.lecturer === lecturer);
              return <button key={lecturer} className={courseSelected && selectedLecturer === lecturer ? "active" : ""} onClick={() => onSelectLecturer(year, course, lecturer)}><span>{lecturerFolderLabel(lecturer)}</span>{showCounts && <b>{countItems(lecturerLectures)}</b>}</button>;
            })}</div>}
          </div>;
        })}</div>}
      </div>;
    })}
  </div>;
}

export default function Home() {
  const [lectures, setLectures] = useState<Lecture[]>(seedLectures);
  const [preReads, setPreReads] = useState<PreRead[]>([]);
  const [concepts, setConcepts] = useState<ConceptRecord[]>([]);
  const [activeId, setActiveId] = useState(seedLectures[0].id);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"home" | "library" | "favorites" | "search" | "slos" | "prereads" | "concepts">("home");
  const [activeYear, setActiveYear] = useState(currentAcademicYear());
  const [expandedYear, setExpandedYear] = useState<string | null>(currentAcademicYear());
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);
  const [activeCourse, setActiveCourse] = useState("All courses");
  const [activeLecturer, setActiveLecturer] = useState(ALL_LECTURERS);
  const [allLecturesSelected, setAllLecturesSelected] = useState(true);
  const [libraryTreeExpanded, setLibraryTreeExpanded] = useState(true);
  const [preReadTreeExpanded, setPreReadTreeExpanded] = useState(false);
  const [preReadFilter, setPreReadFilter] = useState<"all" | PreReadStatus>("all");
  const [preReadDialogOpen, setPreReadDialogOpen] = useState(false);
  const [preReadSaving, setPreReadSaving] = useState(false);
  const [preReadPdfFile, setPreReadPdfFile] = useState<File | null>(null);
  const [previewPreReadId, setPreviewPreReadId] = useState("");
  const [preReadDraft, setPreReadDraft] = useState<PreReadDraft>({ title: "", author: "", course: "", academicYear: currentAcademicYear(), sourceType: "pdf", sourceUrl: "", text: "" });
  const [sloTreeExpanded, setSloTreeExpanded] = useState(false);
  const [expandedSloYear, setExpandedSloYear] = useState<string | null>(currentAcademicYear());
  const [expandedSloCourse, setExpandedSloCourse] = useState<string | null>(null);
  const [activeSloYear, setActiveSloYear] = useState(currentAcademicYear());
  const [activeSloCourse, setActiveSloCourse] = useState("All courses");
  const [activeSloLecturer, setActiveSloLecturer] = useState(ALL_LECTURERS);
  const [allSLOsSelected, setAllSLOsSelected] = useState(true);
  const [flaggedSLOsSelected, setFlaggedSLOsSelected] = useState(false);
  const [sloExportOpen, setSloExportOpen] = useState(false);
  const [selectedExportLectureIds, setSelectedExportLectureIds] = useState<Set<string>>(new Set());
  const [sloExportFormat, setSloExportFormat] = useState<"pdf" | "excel">("pdf");
  const [sloExportSort, setSloExportSort] = useState<"date" | "lecturer">("date");
  const [includeProgressTracker, setIncludeProgressTracker] = useState(false);
  const [sloReparseLectureId, setSloReparseLectureId] = useState("");
  const [sloReparseInstruction, setSloReparseInstruction] = useState("");
  const [sloReparseProposal, setSloReparseProposal] = useState<string[] | null>(null);
  const [sloReparseLoading, setSloReparseLoading] = useState(false);
  const [searchMode, setSearchMode] = useState<"catalog" | "slides">("catalog");
  const [searchYear, setSearchYear] = useState("all");
  const [searchCourse, setSearchCourse] = useState("all");
  const [searchLecturer, setSearchLecturer] = useState("all");
  const [searchSort, setSearchSort] = useState<"relevance" | "date-desc" | "name-asc">("relevance");
  const [lectureSort, setLectureSort] = useState<"date-desc" | "name-asc">("date-desc");
  const [uploading, setUploading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadJob[]>([]);
  const [queueVisible, setQueueVisible] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState("");
  const [viewerLectureId, setViewerLectureId] = useState("");
  const [selectedPage, setSelectedPage] = useState(1);
  const [viewerFile, setViewerFile] = useState<Blob | null>(null);
  const [viewerFileLectureId, setViewerFileLectureId] = useState("");
  const [selectedPdfText, setSelectedPdfText] = useState("");
  const [conceptFilter, setConceptFilter] = useState<"active" | "archived">("active");
  const [chatMessages, setChatMessages] = useState<LunaChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [penEnabled, setPenEnabled] = useState(false);
  const [editingMetadataId, setEditingMetadataId] = useState("");
  const [courseDraft, setCourseDraft] = useState("");
  const [lecturerChoice, setLecturerChoice] = useState(NEW_LECTURER);
  const [newLecturerDraft, setNewLecturerDraft] = useState("");
  const [dateDraft, setDateDraft] = useState("");
  const [localReady, setLocalReady] = useState(false);
  const [authReady, setAuthReady] = useState(!cloudConfigured);
  const [cloudReady, setCloudReady] = useState(!cloudConfigured);
  const [cloudSession, setCloudSession] = useState<CloudSession | null>(null);
  const [cloudHasData, setCloudHasData] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [migrationRunning, setMigrationRunning] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState<MigrationProgress | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const preReadFileInput = useRef<HTMLInputElement>(null);
  const pendingUploads = useRef<PendingUpload[]>([]);
  const uploadRunnerActive = useRef(false);

  useEffect(() => {
    void (async () => {
      try {
        const [saved, savedPreReads, savedConcepts] = await Promise.all([loadLectures(), loadPreReads(), loadConcepts()]);
        setPreReads(savedPreReads);
        setConcepts(savedConcepts);
        if (saved.length) {
          setLectures(saved);
          setActiveId(saved[0].id);
          setActiveYear(saved[0].academicYear);
          setExpandedYear(saved[0].academicYear);
          setActiveSloYear(saved[0].academicYear);
          setExpandedSloYear(saved[0].academicYear);
          await saveLectures(saved);
        }
        else await saveLectures(seedLectures);
      } catch { setNotice("Local database is unavailable; using an in-memory trial library."); }
      finally { setLocalReady(true); }
    })();
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setAuthMessage(error.message);
      setCloudSession(data.session);
      setCloudUser(data.session?.user.id ?? null);
      setAuthReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setCloudSession(session);
      setCloudUser(session?.user.id ?? null);
      setAuthReady(true);
      if (!session) setCloudReady(true);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!localReady || !cloudSession) return;
    let cancelled = false;
    setCloudReady(false);
    setCloudUser(cloudSession.user.id);
    void loadCloudLibrary()
      .then((library) => {
        if (cancelled) return;
        const total = library.lectures.length + library.preReads.length + library.concepts.length;
        setCloudHasData(total > 0);
        if (!total) return;
        setLectures(library.lectures);
        setPreReads(library.preReads);
        setConcepts(library.concepts);
        if (library.lectures[0]) {
          setActiveId(library.lectures[0].id);
          setActiveYear(library.lectures[0].academicYear);
          setExpandedYear(library.lectures[0].academicYear);
          setActiveSloYear(library.lectures[0].academicYear);
          setExpandedSloYear(library.lectures[0].academicYear);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setNotice(error instanceof Error ? `Cloud library unavailable: ${error.message}` : "Cloud library unavailable. Run the Supabase setup script.");
      })
      .finally(() => { if (!cancelled) setCloudReady(true); });
    return () => { cancelled = true; };
  }, [cloudSession, localReady]);

  useEffect(() => {
    const handleError = (event: Event) => setNotice((event as CustomEvent<string>).detail || "Cloud sync failed. Your local copy is safe.");
    const handleSuccess = () => setCloudHasData(true);
    window.addEventListener("fcom-cloud-sync-error", handleError);
    window.addEventListener("fcom-cloud-sync-ok", handleSuccess);
    return () => {
      window.removeEventListener("fcom-cloud-sync-error", handleError);
      window.removeEventListener("fcom-cloud-sync-ok", handleSuccess);
    };
  }, []);

  const viewerLecture = lectures.find((lecture) => lecture.id === viewerLectureId);
  const sloReparseLecture = lectures.find((lecture) => lecture.id === sloReparseLectureId);
  const selectedSlide = viewerLecture?.slides.find((slide) => slide.page === selectedPage) ?? { page: selectedPage, heading: `Slide ${selectedPage}`, text: "" };
  const academicYears = useMemo(() => Array.from(new Set(lectures.map((lecture) => lecture.academicYear))).sort().reverse(), [lectures]);
  const coursesByYear = useMemo(() => academicYears.reduce<Record<string, string[]>>((folders, year) => {
    folders[year] = Array.from(new Set(lectures.filter((lecture) => lecture.academicYear === year).map((lecture) => lecture.course))).sort();
    return folders;
  }, {}), [academicYears, lectures]);
  const lecturerOptions = useMemo(() => Array.from(new Set(lectures.map((lecture) => lecture.lecturer).filter((lecturer) => !/not detected|unknown|unassigned/i.test(String(lecturer ?? ""))))).sort(compareText), [lectures]);
  const visibleLectures = useMemo(() => {
    const filtered = view === "favorites"
      ? lectures.filter((lecture) => lecture.favorite)
      : allLecturesSelected
        ? lectures
        : lectures.filter((lecture) => lecture.academicYear === activeYear
          && (activeCourse === "All courses" || lecture.course === activeCourse)
          && (activeLecturer === ALL_LECTURERS || lecture.lecturer === activeLecturer));
    return [...filtered].sort((a, b) => lectureSort === "name-asc"
      ? compareText(a.title, b.title)
      : lectureDateTimestamp(b.date) - lectureDateTimestamp(a.date) || compareText(a.title, b.title));
  }, [lectures, view, allLecturesSelected, activeYear, activeCourse, activeLecturer, lectureSort]);
  const displayActive = visibleLectures.find((lecture) => lecture.id === activeId) ?? visibleLectures[0];
  const visibleSloLectures = useMemo(() => {
    const filtered = flaggedSLOsSelected
      ? lectures.filter((lecture) => lecture.flaggedSLOs.length > 0)
      : allSLOsSelected
        ? lectures
        : lectures.filter((lecture) => lecture.academicYear === activeSloYear
          && (activeSloCourse === "All courses" || lecture.course === activeSloCourse)
          && (activeSloLecturer === ALL_LECTURERS || lecture.lecturer === activeSloLecturer));
    return filtered
      .filter((lecture) => lecture.slos.length > 0)
      .sort((a, b) => lectureDateTimestamp(b.date) - lectureDateTimestamp(a.date) || compareText(a.title, b.title));
  }, [lectures, flaggedSLOsSelected, allSLOsSelected, activeSloYear, activeSloCourse, activeSloLecturer]);
  const homeFlaggedLectures = useMemo(() => lectures
    .filter((lecture) => lecture.flaggedSLOs.some((index) => Boolean(lecture.slos[index])))
    .sort((a, b) => lectureDateTimestamp(b.date) - lectureDateTimestamp(a.date) || compareText(a.title, b.title)), [lectures]);
  const visiblePreReads = useMemo(() => preReads
    .filter((preRead) => preReadFilter === "all" || preRead.status === preReadFilter)
    .sort((a, b) => compareText(b.createdAt, a.createdAt) || compareText(a.title, b.title)), [preReads, preReadFilter]);
  const previewPreRead = preReads.find((preRead) => preRead.id === previewPreReadId);
  const visibleConcepts = useMemo(() => concepts.filter((concept) => concept.archived === (conceptFilter === "archived")), [concepts, conceptFilter]);
  const viewerFlaggedSLOs = viewerLecture?.flaggedSLOs.map((index) => viewerLecture.slos[index]).filter(Boolean) ?? [];
  const viewerPageConceptTexts = useMemo(() => concepts
    .filter((concept) => concept.lectureId === viewerLectureId && concept.page === selectedPage)
    .map((concept) => concept.text), [concepts, viewerLectureId, selectedPage]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!viewerLectureId) return;
      const file = await getLectureFile(viewerLectureId).catch(() => null);
      if (cancelled) return;
      setViewerFile(file);
      setViewerFileLectureId(viewerLectureId);
    })();
    return () => { cancelled = true; };
  }, [viewerLectureId]);

  useEffect(() => {
    if (!viewerLecture) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setViewerLectureId("");
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const page = event.key === "ArrowLeft" ? Math.max(1, selectedPage - 1) : Math.min(viewerLecture.pages, selectedPage + 1);
        setSelectedPage(page);
        setNoteDraft(viewerLecture.notes?.[page] ?? "");
        setSelectedPdfText("");
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [viewerLecture, selectedPage]);
  useEffect(() => {
    if (!sloExportOpen) return;
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") setSloExportOpen(false); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [sloExportOpen]);
  useEffect(() => {
    if (!sloReparseLectureId) return;
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !sloReparseLoading) setSloReparseLectureId(""); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [sloReparseLectureId, sloReparseLoading]);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 4500);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  useEffect(() => {
    if (!preReadDialogOpen && !previewPreReadId) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || preReadSaving) return;
      setPreReadDialogOpen(false);
      setPreviewPreReadId("");
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [preReadDialogOpen, previewPreReadId, preReadSaving]);

  const searchAcademicYears = useMemo(() => Array.from(new Set([...lectures.map((lecture) => lecture.academicYear), ...preReads.map((preRead) => preRead.academicYear)])).sort().reverse(), [lectures, preReads]);
  const searchCourseOptions = useMemo(() => Array.from(new Set([...lectures.map((lecture) => lecture.course), ...preReads.map((preRead) => preRead.course)])).sort(), [lectures, preReads]);
  const results = useMemo<SearchResult[]>(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const matches: SearchResult[] = [];
    lectures
      .filter((lecture) => searchYear === "all" || lecture.academicYear === searchYear)
      .filter((lecture) => searchCourse === "all" || lecture.course === searchCourse)
      .filter((lecture) => searchLecturer === "all" || lecture.lecturer === searchLecturer)
      .forEach((lecture) => {
        const lectureScore = searchMatchScore(needle, lecture.title, `${lecture.summary} ${lecture.course} ${lecture.lecturer} ${lecture.outline.join(" ")}`);
        if (lectureScore > 0 && searchMode === "catalog") matches.push({ kind: "lecture", lecture, title: lecture.title, text: lecture.summary, score: lectureScore });
        if (searchMode === "catalog") lecture.slos.forEach((slo, sloIndex) => {
          const score = searchMatchScore(needle, slo, `${lecture.title} ${lecture.course} ${lecture.lecturer}`);
          if (score > 0) matches.push({ kind: "slo", lecture, title: slo, text: lecture.title, score, sloIndex });
        });
        if (searchMode === "slides") lecture.slides.forEach((slide) => {
          const score = searchMatchScore(needle, slide.heading, `${slide.text} ${lecture.title}`);
          if (score > 0) matches.push({ kind: "slide", lecture, title: slide.heading, text: slide.text, score, page: slide.page });
        });
      });
    if (searchLecturer === "all") preReads
      .filter((preRead) => searchYear === "all" || preRead.academicYear === searchYear)
      .filter((preRead) => searchCourse === "all" || preRead.course === searchCourse)
      .forEach((preRead) => {
        if (searchMode === "catalog") {
          const score = searchMatchScore(needle, preRead.title, `${preRead.author} ${preRead.course} ${preRead.sourceUrl ?? ""}`);
          if (score > 0) matches.push({ kind: "preread", preRead, title: preRead.title, text: `${preRead.author} · ${preRead.sourceType === "pdf" ? "PDF pre-read" : "Web pre-read"}`, score });
          return;
        }
        if (preRead.sourceType === "pdf") preRead.pages.forEach((page) => {
          const score = searchMatchScore(needle, page.heading, `${page.text} ${preRead.title}`);
          if (score > 0) matches.push({ kind: "preread", preRead, title: page.heading, text: page.text, score, page: page.page });
        });
        else {
          const score = searchMatchScore(needle, preRead.title, preRead.text);
          if (score > 0) matches.push({ kind: "preread", preRead, title: preRead.title, text: preRead.text, score });
        }
      });
    return matches.sort((a, b) => searchSort === "date-desc"
      ? searchResultTimestamp(b) - searchResultTimestamp(a) || b.score - a.score
      : searchSort === "name-asc"
        ? compareText(searchResultCollectionTitle(a), searchResultCollectionTitle(b)) || compareText(a.title, b.title)
        : b.score - a.score || searchResultTimestamp(b) - searchResultTimestamp(a));
  }, [lectures, preReads, query, searchMode, searchYear, searchCourse, searchLecturer, searchSort]);
  const groupedResults = useMemo(() => ({
    lecture: results.filter((result) => result.kind === "lecture"),
    slo: results.filter((result) => result.kind === "slo"),
    slide: results.filter((result) => result.kind === "slide"),
    preread: results.filter((result) => result.kind === "preread"),
  }), [results]);

  function openLectureBrief(id: string, page = 1) {
    const lecture = lectures.find((item) => item.id === id);
    const targetPage = Math.min(lecture?.pages ?? page, Math.max(1, page));
    setSelectedPage(targetPage);
    setViewerFile(null);
    setViewerFileLectureId("");
    setSelectedPdfText("");
    setChatMessages([]);
    setChatDraft("");
    setPenEnabled(false);
    setNoteDraft(lecture?.notes?.[targetPage] ?? "");
    setViewerLectureId(id);
  }

  function selectViewerPage(page: number) {
    if (!viewerLecture) return;
    const targetPage = Math.min(viewerLecture.pages, Math.max(1, page));
    setSelectedPage(targetPage);
    setNoteDraft(viewerLecture.notes?.[targetPage] ?? "");
    setSelectedPdfText("");
  }

  function openSearchResult(result: SearchResult) {
    if (result.kind === "preread") {
      if (searchMode === "slides") void openPreReadSource(result.preRead, result.page);
      else {
        setPreReadFilter("all");
        setView("prereads");
        setPreviewPreReadId(result.preRead.id);
      }
      return;
    }
    setActiveId(result.lecture.id);
    if (result.kind === "slide") openLectureBrief(result.lecture.id, result.page ?? 1);
    else openLectureBrief(result.lecture.id);
  }

  async function toggleSloFlag(lectureId: string, sloIndex: number) {
    const lecture = lectures.find((item) => item.id === lectureId);
    if (!lecture) return;
    const wasFlagged = lecture.flaggedSLOs.includes(sloIndex);
    const flaggedSLOs = wasFlagged
      ? lecture.flaggedSLOs.filter((index) => index !== sloIndex)
      : [...lecture.flaggedSLOs, sloIndex].sort((a, b) => a - b);
    const updated = { ...lecture, flaggedSLOs };
    setLectures((current) => current.map((item) => item.id === lectureId ? updated : item));
    await saveLecture(updated);
    setNotice(wasFlagged ? "SLO removed from flagged SLOs." : "SLO flagged for review.");
  }

  function openSloReparse(lectureId: string) {
    setSloReparseLectureId(lectureId);
    setSloReparseInstruction("");
    setSloReparseProposal(null);
  }

  async function runSloReparse() {
    if (!sloReparseLecture) return;
    setSloReparseLoading(true);
    try {
      const response = await fetch(aiEndpoint("reparse-slos"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lecture: sloReparseLecture, instruction: sloReparseInstruction.trim().slice(0, 2000) }),
      });
      const data = await response.json() as { slos?: unknown; error?: string; detail?: string };
      if (!response.ok) throw new Error(data.error || data.detail || "Luna could not re-parse these SLOs.");
      const proposal = Array.isArray(data.slos)
        ? data.slos.filter((slo): slo is string => typeof slo === "string" && Boolean(slo.trim())).map((slo) => slo.trim())
        : [];
      if (!proposal.length) throw new Error("Luna did not return any usable SLOs.");
      setSloReparseProposal(proposal);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Luna could not re-parse these SLOs.");
    } finally {
      setSloReparseLoading(false);
    }
  }

  async function acceptSloReparse() {
    if (!sloReparseLecture || !sloReparseProposal) return;
    const slos = Array.from(new Set(sloReparseProposal.map((slo) => slo.trim()).filter(Boolean)));
    if (!slos.length) { setNotice("Keep at least one SLO before saving."); return; }
    const flaggedTexts = new Set(sloReparseLecture.flaggedSLOs.map((index) => sloReparseLecture.slos[index]?.trim()).filter(Boolean));
    const flaggedSLOs = slos.flatMap((slo, index) => flaggedTexts.has(slo) ? [index] : []);
    const updated = { ...sloReparseLecture, slos, flaggedSLOs };
    setLectures((current) => current.map((lecture) => lecture.id === updated.id ? updated : lecture));
    await saveLecture(updated);
    setSloReparseLectureId("");
    setSloReparseProposal(null);
    setNotice(`Updated ${updated.title} with ${slos.length} SLO${slos.length === 1 ? "" : "s"}.`);
  }

  function openSloExport() {
    setSelectedExportLectureIds(new Set(visibleSloLectures.map((lecture) => lecture.id)));
    setSloExportOpen(true);
  }

  function setExportLectureSelection(ids: string[], selected: boolean) {
    setSelectedExportLectureIds((current) => {
      const next = new Set(current);
      ids.forEach((id) => selected ? next.add(id) : next.delete(id));
      return next;
    });
  }

  function exportSelectedSlos() {
    const selected = lectures
      .filter((lecture) => selectedExportLectureIds.has(lecture.id) && lecture.slos.length > 0)
      .sort((a, b) => {
        const lecturerOrder = compareText(lecturerFolderLabel(a.lecturer), lecturerFolderLabel(b.lecturer));
        const dateOrder = lectureDateTimestamp(b.date) - lectureDateTimestamp(a.date);
        if (sloExportFormat === "excel") {
          return (sloExportSort === "lecturer" ? lecturerOrder || dateOrder : dateOrder)
            || compareText(a.title, b.title);
        }
        return compareText(a.academicYear, b.academicYear)
          || compareText(a.course, b.course)
          || (sloExportSort === "lecturer" ? lecturerOrder : 0)
          || dateOrder
          || compareText(a.title, b.title);
      });
    if (!selected.length) { setNotice("Select at least one lecture with SLOs."); return; }
    if (sloExportFormat === "excel") downloadSloExcel(selected);
    else downloadSloPdf(selected, { includeProgressTracker });
    setSloExportOpen(false);
    setNotice(`Created an SLO ${sloExportFormat === "excel" ? "Excel workbook" : "PDF"} from ${selected.length} lecture${selected.length === 1 ? "" : "s"}.`);
  }

  async function importLecture(file: File, onStage: (status: UploadStatus) => void) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      throw new Error("Please choose a PDF lecture deck.");
    }
    const diagnosticContext = { fileName: file.name, fileSizeBytes: file.size, fileType: file.type || "unknown" };
    recordDiagnostic("upload", "Lecture import started", diagnosticContext);
    setUploadDiagnosticCheckpoint("starting", diagnosticContext);
    onStage("extracting");
    try {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
      let data = new Uint8Array(await file.arrayBuffer());
      const pdf = await pdfjs.getDocument({ data }).promise;
      const pageCount = pdf.numPages;
      recordDiagnostic("upload", "PDF opened for text extraction", { ...diagnosticContext, pageCount });
      setUploadDiagnosticCheckpoint("extracting", { ...diagnosticContext, pageCount });
      const slides: Slide[] = [];
      try {
      for (let page = 1; page <= pageCount; page++) {
        const pdfPage = await pdf.getPage(page);
        try {
        const content = await pdfPage.getTextContent();
        const text = content.items.map((item) => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ").trim();
        const heading = text.split(/(?<=[a-z])\s{2,}|[•]/)[0]?.replace(/^\d+\s*/, "").slice(0, 110) || `Slide ${page}`;
        slides.push({ page, text, heading });
        } finally {
          pdfPage.cleanup();
        }
      }
      } finally {
        try { pdf.cleanup(); } catch { /* PDF.js may already have released these resources. */ }
        try { await pdf.destroy(); } catch { /* Cleanup must not fail an otherwise successful import. */ }
        data = new Uint8Array(0);
      }
      const first = slides[0]?.text ?? file.name.replace(/\.pdf$/i, "");
      const title = first.replace(/^\d+\s*/, "").split(/(?:August|September|October|November|December|January|February|March|April|May|June|July)\s+\d+/i)[0].replace(/[“”"]/g, "").trim().slice(0, 100) || file.name.replace(/\.pdf$/i, "");
      const lecture: Lecture = {
        id: crypto.randomUUID(), title, lecturer: "Lecturer not detected", date: new Date().toLocaleDateString(), course: "Unsorted",
        academicYear: activeYear, favorite: false, pages: pageCount, slos: detectSLOs(slides), concepts: deriveConcepts(slides), outline: [], summary: `Imported ${pageCount} slides. Review the slide index and SLOs below; an AI brief will be added when available.`, slides, notes: {}, markups: {}, markedSlides: [], flaggedSLOs: [], fileName: file.name, createdAt: new Date().toISOString(),
      };
      onStage("analyzing");
      recordDiagnostic("upload", "PDF extraction finished; Luna analysis started", { ...diagnosticContext, pageCount, extractedCharacters: slides.reduce((total, slide) => total + slide.text.length, 0) });
      setUploadDiagnosticCheckpoint("analyzing", { ...diagnosticContext, pageCount });
      let aiFailed = false;
      try {
        let remainingAnalysisCharacters = 90_000;
        const analysisSlides = slides.flatMap((slide) => {
          if (remainingAnalysisCharacters <= 0) return [];
          const text = slide.text.slice(0, remainingAnalysisCharacters);
          remainingAnalysisCharacters -= text.length;
          return [{ ...slide, text }];
        });
        const response = await fetch(aiEndpoint("analyze"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lecture: { ...lecture, slides: analysisSlides } }) });
        if (response.ok) {
          const merged = mergeAiLectureBrief(lecture, await response.json(), slides, activeYear);
          Object.assign(lecture, merged.lecture);
          if (merged.rejectedFields.length) recordDiagnostic("upload", "Invalid Luna metadata was safely ignored", { ...diagnosticContext, rejectedFields: merged.rejectedFields });
        } else aiFailed = true;
      } catch { aiFailed = true; }
      onStage("saving");
      recordDiagnostic("upload", "Luna analysis finished; lecture save started", { ...diagnosticContext, pageCount, aiFailed });
      setUploadDiagnosticCheckpoint("saving", { ...diagnosticContext, pageCount, aiFailed });
      const savedLecture = await saveLecture(lecture, file);
      setLectures((current) => [savedLecture, ...current]);
      recordDiagnostic("upload", "Lecture import completed", { ...diagnosticContext, lectureId: savedLecture.id, pageCount, aiFailed });
      clearUploadDiagnosticCheckpoint();
      if (aiFailed) setNotice(`${file.name} imported with local extraction because Luna was unavailable.`);
      return savedLecture;
    } catch (error) {
      recordDiagnostic("upload", "Lecture import failed", { fileName: file.name, fileSizeBytes: file.size, error });
      clearUploadDiagnosticCheckpoint();
      throw error instanceof Error ? error : new Error("This PDF could not be processed.");
    }
  }

  function updateUploadJob(id: string, changes: Partial<UploadJob>) {
    setUploadQueue((current) => current.map((job) => job.id === id ? { ...job, ...changes } : job));
  }

  async function runUploadQueue() {
    if (uploadRunnerActive.current) return;
    uploadRunnerActive.current = true;
    setUploading(true);
    try {
      while (pendingUploads.current.length) {
        const job = pendingUploads.current.shift();
        if (!job) continue;
        try {
          await importLecture(job.file, (status) => updateUploadJob(job.id, { status }));
          updateUploadJob(job.id, { status: "done" });
        } catch (error) {
          updateUploadJob(job.id, { status: "error", error: error instanceof Error ? error.message : "Import failed" });
        }
        // Give the UI and garbage collector time to release the completed PDF before opening the next one.
        await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
      }
    } finally {
      uploadRunnerActive.current = false;
      setUploading(false);
      setNotice("Lecture import queue finished.");
      // Do not strand a file added at the exact end of a queue run.
      if (pendingUploads.current.length) void runUploadQueue();
    }
  }

  function enqueueFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    if (!files.length) { setNotice("Please choose one or more PDF lecture decks."); return; }
    const entries = files.map((file) => {
      const id = crypto.randomUUID();
      return { pending: { id, file }, display: { id, name: file.name, status: "queued" as const } };
    });
    // Keep raw PDFs out of React state so each completed file can be garbage-collected.
    pendingUploads.current.push(...entries.map(({ pending }) => pending));
    setUploadQueue((current) => [...current, ...entries.map(({ display }) => display)]);
    setQueueVisible(true);
    void runUploadQueue();
  }

  async function addSelectedConcept() {
    if (!viewerLecture || !selectedPdfText.trim()) return;
    const text = selectedPdfText.trim();
    const existing = concepts.find((concept) => !concept.archived && concept.lectureId === viewerLecture.id && concept.page === selectedPage && concept.text.toLowerCase() === text.toLowerCase());
    if (existing) { setNotice("That concept is already in your concept bank."); return; }
    const concept: ConceptRecord = { id: crypto.randomUUID(), text, lectureId: viewerLecture.id, page: selectedPage, archived: false, createdAt: new Date().toISOString() };
    setConcepts((current) => [concept, ...current]);
    await saveConcept(concept);
    setSelectedPdfText("");
    window.getSelection()?.removeAllRanges();
    setNotice("Added to concept bank.");
  }

  async function setConceptArchived(concept: ConceptRecord, archived: boolean) {
    const updated = { ...concept, archived };
    setConcepts((current) => current.map((item) => item.id === concept.id ? updated : item));
    await saveConcept(updated);
    setNotice(archived ? "Concept archived." : "Concept returned to your bank.");
  }

  function openConceptSource(concept: ConceptRecord) {
    const lecture = lectures.find((item) => item.id === concept.lectureId);
    if (!lecture) { setNotice("The source lecture is no longer available in your library."); return; }
    setActiveId(lecture.id);
    openLectureBrief(lecture.id, concept.page);
  }

  async function sendChatMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!viewerLecture || chatLoading || !chatDraft.trim()) return;
    const question = chatDraft.trim();
    const userMessage: LunaChatMessage = { id: crypto.randomUUID(), role: "user", text: question, page: selectedPage };
    setChatMessages((current) => [...current, userMessage]);
    setChatDraft("");
    setChatLoading(true);
    try {
      const surrounding = viewerLecture.slides.filter((item) => item.page !== selectedSlide.page && Math.abs(item.page - selectedSlide.page) <= 2);
      const response = await fetch(aiEndpoint("chat"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question, slide: selectedSlide, surrounding, history: chatMessages.slice(-6).map(({ role, text }) => ({ role, text })) }) });
      const data = await response.json() as { answer?: string; error?: string; detail?: string };
      if (!response.ok || !data.answer) throw new Error(data.error || data.detail || "Luna could not answer.");
      setChatMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: data.answer ?? "", page: selectedPage }]);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Luna could not answer."); }
    finally { setChatLoading(false); }
  }

  async function saveCurrentNote() {
    if (!viewerLecture) return;
    const updated = { ...viewerLecture, notes: { ...(viewerLecture.notes ?? {}), [selectedPage]: noteDraft } };
    setLectures((current) => current.map((lecture) => lecture.id === updated.id ? updated : lecture));
    await saveLecture(updated);
    setNotice(cloudSession ? "Note saved and synced." : "Note saved on this device.");
  }

  async function saveCurrentInk(strokes: InkStroke[]) {
    if (!viewerLecture) return;
    const markups = { ...(viewerLecture.markups ?? {}) };
    if (strokes.length) markups[selectedPage] = strokes;
    else delete markups[selectedPage];
    const updated = { ...viewerLecture, markups };
    setLectures((current) => current.map((lecture) => lecture.id === updated.id ? updated : lecture));
    await saveLecture(updated);
  }

  async function toggleCurrentSlideMark() {
    if (!viewerLecture) return;
    const currentMarks = viewerLecture.markedSlides ?? [];
    const isMarked = currentMarks.includes(selectedPage);
    const markedSlides = isMarked
      ? currentMarks.filter((page) => page !== selectedPage)
      : [...currentMarks, selectedPage].sort((a, b) => a - b);
    const updated = { ...viewerLecture, markedSlides };
    setLectures((current) => current.map((lecture) => lecture.id === updated.id ? updated : lecture));
    await saveLecture(updated);
    setNotice(isMarked ? `Slide ${selectedPage} unmarked.` : `Slide ${selectedPage} marked for later.`);
  }

  async function toggleFavorite(id: string) {
    const lecture = lectures.find((item) => item.id === id);
    if (!lecture) return;
    const updated = { ...lecture, favorite: !lecture.favorite };
    setLectures((current) => current.map((item) => item.id === id ? updated : item));
    await saveLecture(updated);
    setNotice(updated.favorite ? "Added to favorites." : "Removed from favorites.");
  }

  function startMetadataEdit(lecture: Lecture) {
    setCourseDraft(lecture.course);
    if (lecturerOptions.includes(lecture.lecturer)) {
      setLecturerChoice(lecture.lecturer);
      setNewLecturerDraft("");
    } else {
      setLecturerChoice(NEW_LECTURER);
      setNewLecturerDraft(/not detected|unknown|unassigned/i.test(lecture.lecturer) ? "" : lecture.lecturer);
    }
    setDateDraft(dateInputValue(lecture.date));
    setEditingMetadataId(lecture.id);
  }

  async function saveLectureMetadata(lecture: Lecture) {
    const course = courseDraft.trim();
    if (!course) { setNotice("Course designation cannot be empty."); return; }
    const lecturer = lecturerChoice === NEW_LECTURER ? newLecturerDraft.trim() : lecturerChoice;
    if (!lecturer) { setNotice("Choose a lecturer or add a new one."); return; }
    if (!dateDraft) { setNotice("Choose the lecture date."); return; }
    const updated = { ...lecture, course, lecturer, date: displayDateFromInput(dateDraft) };
    setLectures((current) => current.map((item) => item.id === lecture.id ? updated : item));
    await saveLecture(updated);
    if (!allLecturesSelected) {
      if (activeCourse === lecture.course) {
        setActiveCourse(course);
        setExpandedCourse(`${lecture.academicYear}::${course}`);
      }
      if (activeLecturer === lecture.lecturer) setActiveLecturer(lecturer);
    }
    if (!allSLOsSelected) {
      if (activeSloCourse === lecture.course) {
        setActiveSloCourse(course);
        setExpandedSloCourse(`${lecture.academicYear}::${course}`);
      }
      if (activeSloLecturer === lecture.lecturer) setActiveSloLecturer(lecturer);
    }
    setEditingMetadataId("");
    setNotice("Lecture details updated.");
  }

  async function removeLecture(id: string) {
    const lecture = lectures.find((item) => item.id === id);
    if (!lecture || !window.confirm(`Remove “${lecture.title}” and its stored PDF?`)) return;
    await deleteLecture(id);
    const remaining = lectures.filter((item) => item.id !== id);
    setLectures(remaining);
    if (activeId === id) setActiveId(remaining[0]?.id ?? "");
    if (viewerLectureId === id) {
      setViewerLectureId("");
    }
    setNotice("Lecture removed from this device.");
  }

  function openPreReadDialog() {
    const course = !allLecturesSelected && activeCourse !== "All courses" ? activeCourse : lectures[0]?.course ?? "";
    setPreReadDraft({ title: "", author: "", course, academicYear: activeYear || currentAcademicYear(), sourceType: "pdf", sourceUrl: "", text: "" });
    setPreReadPdfFile(null);
    setPreReadDialogOpen(true);
  }

  async function addPreRead() {
    const course = preReadDraft.course.trim();
    const title = preReadDraft.title.trim() || preReadPdfFile?.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim() || "";
    if (!title || !course || !preReadDraft.academicYear.trim()) { setNotice("Add a title, course, and academic year."); return; }
    if (preReadDraft.sourceType === "pdf" && !preReadPdfFile) { setNotice("Choose a PDF pre-read."); return; }
    if (preReadDraft.sourceType === "web" && !preReadDraft.text.trim()) { setNotice("Paste the article text so it can be searched."); return; }
    let sourceUrl = preReadDraft.sourceUrl.trim();
    if (sourceUrl) {
      try {
        const parsed = new URL(sourceUrl);
        if (!/^https?:$/.test(parsed.protocol)) throw new Error();
        sourceUrl = parsed.toString();
      } catch { setNotice("Use a complete http:// or https:// source link."); return; }
    }
    setPreReadSaving(true);
    try {
      const pages: Slide[] = [];
      let text = preReadDraft.text.trim();
      if (preReadDraft.sourceType === "pdf" && preReadPdfFile) {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
        const data = new Uint8Array(await preReadPdfFile.arrayBuffer());
        const pdf = await pdfjs.getDocument({ data }).promise;
        for (let page = 1; page <= pdf.numPages; page++) {
          const pdfPage = await pdf.getPage(page);
          const content = await pdfPage.getTextContent();
          const pageText = content.items.map((item) => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ").trim();
          pages.push({ page, text: pageText, heading: pageText.slice(0, 110) || `Page ${page}` });
        }
        text = pages.map((page) => page.text).filter(Boolean).join("\n\n");
      }
      const preRead: PreRead = {
        id: crypto.randomUUID(), title, author: preReadDraft.author.trim() || "Author not listed", course,
        academicYear: preReadDraft.academicYear.trim(), sourceType: preReadDraft.sourceType,
        sourceUrl: sourceUrl || undefined, text, pages, status: "unread",
        fileName: preReadPdfFile?.name, createdAt: new Date().toISOString(),
      };
      await savePreRead(preRead, preReadPdfFile ?? undefined);
      setPreReads((current) => [preRead, ...current]);
      setPreReadFilter("all");
      setPreReadDialogOpen(false);
      setView("prereads");
      setNotice(`Added “${preRead.title}” to pre-reads.`);
    } catch {
      setNotice("This pre-read could not be saved. Check the PDF and try again.");
    } finally {
      setPreReadSaving(false);
    }
  }

  async function updatePreReadStatus(id: string, status: PreReadStatus) {
    const preRead = preReads.find((item) => item.id === id);
    if (!preRead || preRead.status === status) return;
    const updated = { ...preRead, status };
    setPreReads((current) => current.map((item) => item.id === id ? updated : item));
    await savePreRead(updated);
    setNotice(`Marked “${updated.title}” as ${preReadStatusLabel[status].toLowerCase()}.`);
  }

  async function removePreRead(id: string) {
    const preRead = preReads.find((item) => item.id === id);
    if (!preRead || !window.confirm(`Remove “${preRead.title}” and its locally stored content?`)) return;
    await deletePreRead(id);
    setPreReads((current) => current.filter((item) => item.id !== id));
    if (previewPreReadId === id) setPreviewPreReadId("");
    setNotice("Pre-read removed from this device.");
  }

  async function openPreReadSource(preRead: PreRead, page?: number) {
    if (preRead.sourceType === "web") {
      if (preRead.sourceUrl) window.open(preRead.sourceUrl, "_blank", "noopener,noreferrer");
      else setPreviewPreReadId(preRead.id);
      return;
    }
    const tab = window.open("", "_blank");
    try {
      const file = await getPreReadFile(preRead.id);
      if (!file) throw new Error();
      const objectUrl = URL.createObjectURL(file);
      const target = `${objectUrl}#page=${Math.max(1, page ?? 1)}`;
      if (tab) tab.location.href = target;
      else window.open(target, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch {
      tab?.close();
      setNotice("The stored PDF could not be opened.");
    }
  }

  const exportableLectures = lectures.filter((lecture) => lecture.slos.length > 0);
  const selectedExportCount = exportableLectures.filter((lecture) => selectedExportLectureIds.has(lecture.id)).length;
  const favoriteCount = lectures.filter((lecture) => lecture.favorite).length;
  const activeUpload = uploadQueue.find((job) => ["extracting", "analyzing", "saving"].includes(job.status));
  const nextUpload = uploadQueue.find((job) => job.status === "queued");
  const finishedUploads = uploadQueue.filter((job) => job.status === "done" || job.status === "error").length;
  const viewerMarkedSlides = viewerLecture?.markedSlides ?? [];
  const currentSlideIsMarked = viewerMarkedSlides.includes(selectedPage);
  const viewerPageInk = viewerLecture?.markups?.[selectedPage] ?? [];

  function selectLectureRoot() {
    const collapse = view === "library" && allLecturesSelected && libraryTreeExpanded;
    setAllLecturesSelected(true);
    setActiveLecturer(ALL_LECTURERS);
    setLibraryTreeExpanded(!collapse);
    setView("library");
  }

  function selectPreReadRoot() {
    const collapse = view === "prereads" && preReadFilter === "all" && preReadTreeExpanded;
    setPreReadFilter("all");
    setPreReadTreeExpanded(!collapse);
    setView("prereads");
  }

  function selectSloRoot() {
    const collapse = view === "slos" && allSLOsSelected && !flaggedSLOsSelected && sloTreeExpanded;
    setAllSLOsSelected(true);
    setFlaggedSLOsSelected(false);
    setActiveSloLecturer(ALL_LECTURERS);
    setSloTreeExpanded(!collapse);
    setView("slos");
  }

  async function submitCloudAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || authBusy) return;
    setAuthBusy(true);
    setAuthMessage("");
    try {
      if (authMode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: authEmail.trim(),
          password: authPassword,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) setAuthMessage("Account created. Check your email to confirm it, then sign in.");
      }
    } catch (error) {
      setAuthMessage(error instanceof Error ? error.message : "Could not sign in.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function migrateThisDevice() {
    if (migrationRunning) return;
    setMigrationRunning(true);
    setMigrationProgress(null);
    try {
      const result = await migrateLocalLibraryToCloud(setMigrationProgress);
      setLectures(result.library.lectures);
      setPreReads(result.library.preReads);
      setConcepts(result.library.concepts);
      setCloudHasData(true);
      setNotice(`Cloud migration complete: ${result.counts.lectures} lectures, ${result.counts.preReads} pre-reads, and ${result.counts.concepts} concepts.`);
    } catch (error) {
      setNotice(`Migration stopped: ${readableError(error)} Your local library is unchanged.`);
    } finally {
      setMigrationRunning(false);
    }
  }

  async function signOutCloud() {
    await supabase?.auth.signOut();
    setCloudSession(null);
    setCloudUser(null);
    setCloudHasData(false);
  }

  if (cloudConfigured && (!authReady || (cloudSession && !cloudReady))) {
    return <main className="cloud-gate"><section className="cloud-auth-card"><strong className="cloud-wordmark">FCOM.lib</strong><div className="cloud-loading" role="status">Opening your library…</div></section></main>;
  }

  if (cloudConfigured && !cloudSession) {
    return <main className="cloud-gate"><section className="cloud-auth-card">
      <strong className="cloud-wordmark">FCOM.lib</strong>
      <div className="cloud-auth-heading"><small>PRIVATE CURRICULUM LIBRARY</small><h1>{authMode === "signin" ? "Sign in" : "Create your account"}</h1><p>Your lectures, annotations, SLOs, and concepts stay private to your account.</p></div>
      <form onSubmit={submitCloudAuth}>
        <label><span>Email</span><input type="email" autoComplete="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} required /></label>
        <label><span>Password</span><input type="password" minLength={6} autoComplete={authMode === "signin" ? "current-password" : "new-password"} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} required /></label>
        {authMessage && <p className="cloud-auth-message" role="status">{authMessage}</p>}
        <button className="cloud-auth-submit" type="submit" disabled={authBusy}>{authBusy ? "Working…" : authMode === "signin" ? "Sign in" : "Create account"}</button>
      </form>
      <button className="cloud-auth-switch" type="button" onClick={() => { setAuthMode((current) => current === "signin" ? "signup" : "signin"); setAuthMessage(""); }}>{authMode === "signin" ? "New to FCOM.lib? Create an account" : "Already have an account? Sign in"}</button>
    </section></main>;
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <nav className="primary-nav" aria-label="Primary navigation">
          <button className={`nav-link home-link ${view === "home" ? "active" : ""}`} onClick={() => setView("home")}><strong>Home</strong></button>
          <section className="nav-section">
            <button className={`nav-root ${view === "library" && allLecturesSelected ? "active" : ""}`} aria-expanded={libraryTreeExpanded} onClick={selectLectureRoot}><span className={`nav-caret ${libraryTreeExpanded ? "expanded" : ""}`}>›</span><AppIcon name="library"/><strong>Lectures</strong><b>{lectures.length}</b></button>
            {libraryTreeExpanded && <CurriculumTree lectures={lectures} academicYears={academicYears} coursesByYear={coursesByYear} expandedYear={expandedYear} expandedCourse={expandedCourse} selectedYear={activeYear} selectedCourse={activeCourse} selectedLecturer={activeLecturer} allSelected={allLecturesSelected} isCurrentSection={view === "library"} onSelectYear={(year) => { setAllLecturesSelected(false); setActiveYear(year); setActiveCourse("All courses"); setActiveLecturer(ALL_LECTURERS); setExpandedYear(year); setView("library"); }} onSelectCourse={(year, course, courseKey) => { setAllLecturesSelected(false); setActiveYear(year); setActiveCourse(course); setActiveLecturer(ALL_LECTURERS); setExpandedCourse((current) => current === courseKey ? null : courseKey); setView("library"); }} onSelectLecturer={(year, course, lecturer) => { setAllLecturesSelected(false); setActiveYear(year); setActiveCourse(course); setActiveLecturer(lecturer); setView("library"); }} />}
          </section>
          <button className={`nav-link ${view === "favorites" ? "active" : ""}`} onClick={() => setView("favorites")}><span className="nav-indent"/><AppIcon name="star"/><strong>Favorites</strong><b>{favoriteCount}</b></button>
          <section className="nav-section">
            <button className={`nav-root ${view === "prereads" && preReadFilter === "all" ? "active" : ""}`} aria-expanded={preReadTreeExpanded} onClick={selectPreReadRoot}><span className={`nav-caret ${preReadTreeExpanded ? "expanded" : ""}`}>›</span><AppIcon name="file"/><strong>Pre-reads</strong></button>
            {preReadTreeExpanded && <div className="nav-tree preread-tree">
              {(["unread", "read", "rereview"] as const).map((status) => <button key={status} className={`tree-all ${view === "prereads" && preReadFilter === status ? "active" : ""}`} onClick={() => { setPreReadFilter(status); setView("prereads"); }}><span>{preReadStatusLabel[status]}</span></button>)}
            </div>}
          </section>
          <button className={`nav-link ${view === "search" ? "active" : ""}`} onClick={() => setView("search")}><span className="nav-indent"/><AppIcon name="search"/><strong>Search</strong></button>
          <section className="nav-section">
            <button className={`nav-root ${view === "slos" && allSLOsSelected && !flaggedSLOsSelected ? "active" : ""}`} aria-expanded={sloTreeExpanded} onClick={selectSloRoot}><span className={`nav-caret ${sloTreeExpanded ? "expanded" : ""}`}>›</span><AppIcon name="target"/><strong>SLOs</strong></button>
            {sloTreeExpanded && <CurriculumTree lectures={lectures} academicYears={academicYears} coursesByYear={coursesByYear} expandedYear={expandedSloYear} expandedCourse={expandedSloCourse} selectedYear={activeSloYear} selectedCourse={activeSloCourse} selectedLecturer={activeSloLecturer} allSelected={allSLOsSelected} isCurrentSection={view === "slos"} showCounts={false} flaggedSelected={flaggedSLOsSelected} onSelectFlagged={() => { setAllSLOsSelected(false); setFlaggedSLOsSelected(true); setActiveSloLecturer(ALL_LECTURERS); setView("slos"); }} onSelectYear={(year) => { setAllSLOsSelected(false); setFlaggedSLOsSelected(false); setActiveSloYear(year); setActiveSloCourse("All courses"); setActiveSloLecturer(ALL_LECTURERS); setExpandedSloYear(year); setView("slos"); }} onSelectCourse={(year, course, courseKey) => { setAllSLOsSelected(false); setFlaggedSLOsSelected(false); setActiveSloYear(year); setActiveSloCourse(course); setActiveSloLecturer(ALL_LECTURERS); setExpandedSloCourse((current) => current === courseKey ? null : courseKey); setView("slos"); }} onSelectLecturer={(year, course, lecturer) => { setAllSLOsSelected(false); setFlaggedSLOsSelected(false); setActiveSloYear(year); setActiveSloCourse(course); setActiveSloLecturer(lecturer); setView("slos"); }} />}
          </section>
          <button className={`nav-link concept-bank-link ${view === "concepts" ? "active" : ""}`} onClick={() => setView("concepts")}><strong>Concept Bank</strong><b>{concepts.filter((concept) => !concept.archived).length}</b></button>
        </nav>
        <div className="side-bottom">{cloudSession ? <div className="cloud-account"><span><strong>Cloud library</strong><small>{cloudSession.user.email}</small>{migrationRunning && migrationProgress && <small>Syncing {migrationProgress.completed} of {migrationProgress.total}</small>}</span><div className="cloud-account-actions"><button type="button" disabled={migrationRunning} onClick={() => void migrateThisDevice()}>{migrationRunning ? "Syncing…" : "Sync this device"}</button><button type="button" onClick={downloadDiagnostics}>Diagnostics</button><button type="button" disabled={migrationRunning} onClick={() => void signOutCloud()}>Sign out</button></div></div> : <p><span><strong>Device library</strong><br/><small>Cloud connection not configured</small><button className="device-diagnostics" type="button" onClick={downloadDiagnostics}>Diagnostics</button></span></p>}</div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <label className="global-search"><AppIcon name="search"/><input aria-label="Search the curriculum" value={query} onChange={(e) => { setQuery(e.target.value); if (e.target.value) setView("search"); }}/></label>
          <button className="upload-button" onClick={() => fileInput.current?.click()}><AppIcon name="upload"/>{uploading ? "Add to queue" : "Add lectures"}</button>
          <input ref={fileInput} type="file" accept="application/pdf" multiple hidden onChange={(event) => { if (event.target.files?.length) enqueueFiles(event.target.files); event.target.value = ""; }}/>
          <span className="avatar">{cloudSession?.user.email?.slice(0, 2).toUpperCase() ?? "EM"}</span>
        </header>

        {notice && <div className="notice" role="status" aria-live="polite"><span>{notice}</span><button aria-label="Dismiss" onClick={() => setNotice("")}><AppIcon name="x"/></button></div>}

        {cloudSession && !cloudHasData && localReady && <section className="cloud-migration-banner" aria-label="Migrate local library">
          <div><small>ONE-TIME CLOUD SETUP</small><strong>Move this device’s library into your private account</strong><p>This copies your lectures, PDFs, SLOs, notes, pre-reads, and concepts. The originals remain safely on this computer.</p>{migrationProgress && <span>{migrationProgress.completed} of {migrationProgress.total}: {migrationProgress.label}</span>}</div>
          <button type="button" disabled={migrationRunning} onClick={() => void migrateThisDevice()}>{migrationRunning ? "Migrating…" : "Migrate this device"}</button>
        </section>}

        {queueVisible && uploadQueue.length > 0 && <aside className="upload-queue" aria-label="Lecture import queue"><header><div><small>IMPORT QUEUE</small><strong>{finishedUploads} of {uploadQueue.length} finished</strong></div><button aria-label="Hide import queue" onClick={() => setQueueVisible(false)}><AppIcon name="x"/></button></header><div className="queue-jobs">{uploadQueue.map((job) => <div className={`queue-job ${job.status}`} key={job.id}><span className="queue-indicator"/><div><strong>{job.name}</strong><small>{uploadStatusLabel[job.status]}{activeUpload?.id === job.id ? " · Current" : nextUpload?.id === job.id ? " · Next" : ""}</small>{job.error && <em>{job.error}</em>}</div></div>)}</div><footer><button disabled={uploading} onClick={() => setUploadQueue((current) => current.filter((job) => job.status !== "done" && job.status !== "error"))}>Clear finished</button></footer></aside>}

        {view === "home" && <section className="full-page home-page">
          <div className="page-toolbar"><div className="eyebrow">FLAGGED SLOS</div></div>
          {homeFlaggedLectures.length > 0 ? <div className="home-flagged-list">{homeFlaggedLectures.map((lecture) => {
            const flaggedEntries = lecture.flaggedSLOs.map((index) => ({ index, slo: lecture.slos[index] })).filter((entry) => Boolean(entry.slo));
            return <article className="home-flagged-card" key={lecture.id}><header><div><small>{lecture.course} · {lecturerFolderLabel(lecture.lecturer)}</small><h2>{lecture.title}</h2></div><button onClick={() => { setActiveId(lecture.id); openLectureBrief(lecture.id); }}>Open lecture</button></header><ol>{flaggedEntries.map(({ index, slo }) => <li key={`${index}-${slo}`}><span>{index + 1}</span><p>{slo}</p></li>)}</ol></article>;
          })}</div> : <div className="home-empty"><strong>No flagged SLOs</strong><span>Flag an objective from the SLO page and it will appear here.</span></div>}
        </section>}

        {(view === "library" || view === "favorites") && <div className={`content-grid ${displayActive ? "" : "single-column"}`}>
          <section className="library-panel">
            <div className="page-toolbar"><div className="eyebrow">{view === "favorites" ? "SAVED LECTURES" : allLecturesSelected ? "LECTURES" : `${activeYear} · ${activeCourse.toUpperCase()}${activeLecturer === ALL_LECTURERS ? "" : ` · ${lecturerFolderLabel(activeLecturer).toUpperCase()}`}`}</div><label className="sort-control"><span>Sort by</span><select value={lectureSort} onChange={(event) => setLectureSort(event.target.value as "date-desc" | "name-asc")}><option value="date-desc">Date · newest first</option><option value="name-asc">Name · A–Z</option></select></label></div>
            <div className="lecture-list">
              {visibleLectures.map((lecture) => <article key={lecture.id} className={`lecture-card ${displayActive?.id === lecture.id ? "selected" : ""}`}>
                <button className="lecture-open" onClick={() => setActiveId(lecture.id)}>
                  <span className="lecture-copy"><small>{lecture.course.toUpperCase()}</small><strong>{lecture.title}</strong><em>{lecture.lecturer} · {lecture.date}</em></span>
                </button>
                <div className="lecture-card-rail">
                  <button className="lecture-slo-peek" aria-label={`Preview ${lecture.slos.length} session learning objectives`}><b>{lecture.slos.length} SLO{lecture.slos.length === 1 ? "" : "s"}</b></button><span className="slo-tooltip" role="tooltip"><strong>Session learning objectives</strong>{lecture.slos.length > 0 ? <ol>{lecture.slos.map((slo, index) => <li key={`${index}-${slo}`}>{slo}</li>)}</ol> : <p>No SLOs were extracted for this lecture.</p>}</span>
                  <button className="card-open-brief" onClick={() => { setActiveId(lecture.id); openLectureBrief(lecture.id); }}><span>Open lecture</span><AppIcon name="arrow"/></button>
                </div>
                <span className="lecture-actions"><button className={lecture.favorite ? "favorited" : ""} aria-label={lecture.favorite ? "Remove from favorites" : "Add to favorites"} title={lecture.favorite ? "Remove from favorites" : "Add to favorites"} onClick={() => toggleFavorite(lecture.id)}><AppIcon name="star"/></button><button className="remove-action" aria-label="Remove lecture" title="Remove lecture" onClick={() => removeLecture(lecture.id)}><AppIcon name="trash"/></button></span>
              </article>)}
              {visibleLectures.length === 0 && <div className="library-empty"><AppIcon name={view === "favorites" ? "star" : "folder"}/><strong>{view === "favorites" ? "No favorite lectures yet" : "This folder is empty"}</strong><span>{view === "favorites" ? "Use the star on any lecture to keep it here." : "Add a PDF to this academic year and course."}</span></div>}
              {view === "library" && <button className={`dropzone ${dragging ? "dragging" : ""}`} onClick={() => fileInput.current?.click()} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) enqueueFiles(e.dataTransfer.files); }}>
                <span><AppIcon name="upload"/></span><strong>Drop one or more lectures here</strong><small>PDF · Lectures are processed one at a time</small>
              </button>}
            </div>
          </section>

          {displayActive && <aside className="detail-panel">
            <div className="detail-label">LECTURE BRIEF</div><h2>{displayActive.title}</h2><p>{displayActive.summary}</p>
            {editingMetadataId === displayActive.id ? <div className="metadata-editor">
              <label><span>Course designation</span><input value={courseDraft} onChange={(event) => setCourseDraft(event.target.value)} /></label>
              <label><span>Lecturer</span><select value={lecturerChoice} onChange={(event) => setLecturerChoice(event.target.value)}>{lecturerOptions.map((lecturer) => <option value={lecturer} key={lecturer}>{lecturer}</option>)}<option value={NEW_LECTURER}>Add a new lecturer…</option></select></label>
              {lecturerChoice === NEW_LECTURER && <label><span>New lecturer</span><input value={newLecturerDraft} onChange={(event) => setNewLecturerDraft(event.target.value)} placeholder="Name and credentials" /></label>}
              <label><span>Lecture date</span><input type="date" value={dateDraft} onChange={(event) => setDateDraft(event.target.value)} /></label>
              <div><button onClick={() => setEditingMetadataId("")}>Cancel</button><button className="save-metadata" onClick={() => saveLectureMetadata(displayActive)}>Save details</button></div>
            </div> : <div className="lecture-details"><span><small>Course</small>{displayActive.academicYear} / {displayActive.course}</span><span><small>Lecturer</small>{displayActive.lecturer}</span><span><small>Date</small>{displayActive.date}</span><button onClick={() => startMetadataEdit(displayActive)}>Edit details</button></div>}
            <div className="section-head"><h3>Session learning objectives</h3><button onClick={() => { setAllSLOsSelected(false); setFlaggedSLOsSelected(false); setActiveSloYear(displayActive.academicYear); setActiveSloCourse(displayActive.course); setActiveSloLecturer(ALL_LECTURERS); setExpandedSloYear(displayActive.academicYear); setExpandedSloCourse(`${displayActive.academicYear}::${displayActive.course}`); setSloTreeExpanded(true); setView("slos"); }}>View course SLOs</button></div>
            <ol className="slo-preview">{displayActive.slos.map((slo, index) => <li key={slo}><span>{index + 1}</span><p>{slo}</p></li>)}</ol>
            {displayActive.outline.length > 0 && <><div className="section-head"><h3>Session outline</h3></div><ol className="outline-list">{displayActive.outline.map((section, index) => <li key={section}><span>{index + 1}</span><p>{section}</p></li>)}</ol></>}
          </aside>}
        </div>}

        {view === "prereads" && <section className="full-page preread-page">
          <div className="page-toolbar"><div className="eyebrow">{preReadFilter === "all" ? "PRE-READS" : preReadStatusLabel[preReadFilter].toUpperCase()}</div><button className="add-preread-button" onClick={openPreReadDialog}><AppIcon name="upload"/>Add pre-read</button></div>
          <div className="preread-list">{visiblePreReads.map((preRead) => <article className="preread-card" key={preRead.id}>
            <div className="preread-card-copy"><small>{preRead.academicYear} · {preRead.course}</small><h2>{preRead.title}</h2><p>{preRead.author} · {preRead.sourceType === "pdf" ? `PDF${preRead.pages.length ? ` · ${preRead.pages.length} pages` : ""}` : "Web article"}</p></div>
            <div className="preread-status" aria-label={`Reading status for ${preRead.title}`}>{(["unread", "read", "rereview"] as PreReadStatus[]).map((status) => <button key={status} className={preRead.status === status ? "active" : ""} aria-pressed={preRead.status === status} onClick={() => updatePreReadStatus(preRead.id, status)}>{status === "read" && <AppIcon name="check"/>}{preReadStatusLabel[status]}</button>)}</div>
            <div className="preread-actions"><button onClick={() => setPreviewPreReadId(preRead.id)}>Details</button><button className="open-preread" onClick={() => openPreReadSource(preRead)}>{preRead.sourceType === "pdf" ? "Open PDF" : preRead.sourceUrl ? "Open article" : "Read saved text"}<AppIcon name={preRead.sourceType === "web" ? "link" : "arrow"}/></button><button className="remove-preread" aria-label={`Remove ${preRead.title}`} title="Remove pre-read" onClick={() => removePreRead(preRead.id)}><AppIcon name="trash"/></button></div>
          </article>)}</div>
          {visiblePreReads.length === 0 && <div className="empty-state"><AppIcon name="file"/><strong>{preReadFilter === "all" ? "No pre-reads yet" : `No ${preReadStatusLabel[preReadFilter].toLowerCase()} pre-reads`}</strong><span>{preReadFilter === "all" ? "Add a PDF or save an assigned web reading to begin." : "Change a pre-read’s status and it will appear here."}</span>{preReadFilter === "all" && <button className="empty-add-preread" onClick={openPreReadDialog}>Add your first pre-read</button>}</div>}
        </section>}

        {view === "search" && <section className="full-page search-page">
          <div className="eyebrow">CURRICULUM SEARCH</div>
          <div className="search-mode-switch" aria-label="Search source">
            <button aria-pressed={searchMode === "catalog"} className={searchMode === "catalog" ? "active" : ""} onClick={() => setSearchMode("catalog")}><strong>Lectures &amp; SLOs</strong><span>Lecture and pre-read titles, summaries, and objectives</span></button>
            <button aria-pressed={searchMode === "slides"} className={searchMode === "slides" ? "active" : ""} onClick={() => setSearchMode("slides")}><strong>Source text</strong><span>Exact words inside slides and saved pre-reads</span></button>
          </div>
          <p className="search-mode-note">{searchMode === "slides" ? "This searches text already extracted from slide PDFs plus the text saved with pre-reads, then opens the closest source." : "This searches lecture and pre-read titles, course information, summaries, authors, and SLO wording."}</p>
          <div className="search-controls" aria-label="Search filters">
            <label><span>Academic year</span><select value={searchYear} onChange={(event) => setSearchYear(event.target.value)}><option value="all">All years</option>{searchAcademicYears.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
            <label><span>Course</span><select value={searchCourse} onChange={(event) => setSearchCourse(event.target.value)}><option value="all">All courses</option>{searchCourseOptions.map((course) => <option key={course} value={course}>{course}</option>)}</select></label>
            <label><span>Lecturer</span><select value={searchLecturer} onChange={(event) => setSearchLecturer(event.target.value)}><option value="all">All lecturers</option>{lecturerOptions.map((lecturer) => <option key={lecturer} value={lecturer}>{lecturer}</option>)}</select></label>
            <label><span>Sort by</span><select value={searchSort} onChange={(event) => setSearchSort(event.target.value as "relevance" | "date-desc" | "name-asc")}><option value="relevance">Relevance</option><option value="date-desc">Date · newest first</option><option value="name-asc">Name · A–Z</option></select></label>
            <button className="clear-search-filters" onClick={() => { setSearchYear("all"); setSearchCourse("all"); setSearchLecturer("all"); setSearchSort("relevance"); }}>Reset filters</button>
          </div>
          {!query && <div className="empty-state"><AppIcon name="search"/><strong>{searchMode === "slides" ? "Search the words inside your sources" : "Search your lectures, SLOs, and pre-reads"}</strong><span>{searchMode === "slides" ? "Try “glycolysis,” “hexokinase,” or another term from class." : "Try a title, instructor, author, course, or SLO phrase."}</span></div>}
          {query && <div className="result-count">{results.length} curriculum match{results.length === 1 ? "" : "es"}</div>}
          {query && results.length === 0 && <div className="empty-state compact"><AppIcon name="search"/><strong>No matching results</strong><span>Try a broader term or reset one of the filters.</span></div>}
          {query && (searchMode === "slides" ? ["slide", "preread"] as SearchKind[] : ["lecture", "slo", "preread"] as SearchKind[]).map((kind) => {
            const group = groupedResults[kind];
            if (!group.length) return null;
            const label = kind === "lecture" ? "Lectures" : kind === "slo" ? "Session learning objectives" : kind === "slide" ? "Matching slides" : searchMode === "slides" ? "Matching pre-read text" : "Pre-reads";
            return <section className="search-result-group" key={kind}><header><h2>{label}</h2><span>{group.length}</span></header><div className="results">{group.map((result) => {
              const sourceId = result.kind === "preread" ? result.preRead.id : result.lecture.id;
              const metadata = result.kind === "preread" ? `${result.preRead.academicYear} · ${result.preRead.course} · ${result.preRead.author}` : `${result.lecture.academicYear} · ${result.lecture.course} · ${result.lecture.lecturer}`;
              const marker = result.kind === "slide" ? result.page : result.kind === "slo" ? "SLO" : result.kind === "preread" ? result.page ? `P${result.page}` : "PR" : "L";
              return <button key={`${result.kind}-${sourceId}-${result.page ?? (result.kind === "slo" ? result.sloIndex : 0) ?? 0}`} onClick={() => openSearchResult(result)}><span className={`result-kind ${result.kind}`}>{marker}</span><span><small>{metadata}</small><strong>{result.title}</strong><p>{result.text}</p></span><AppIcon name="arrow"/></button>;
            })}</div></section>;
          })}
        </section>}

        {view === "slos" && <section className="full-page slo-page">
          <div className="page-toolbar"><div>{flaggedSLOsSelected ? <div className="eyebrow">FLAGGED SLOS</div> : allSLOsSelected ? <div className="eyebrow">SESSION LEARNING OBJECTIVES</div> : <nav className="slo-breadcrumbs" aria-label="SLO folders">
              <button onClick={() => { setActiveSloCourse("All courses"); setActiveSloLecturer(ALL_LECTURERS); setExpandedSloYear(activeSloYear); }}>{activeSloYear}</button>
              {activeSloCourse !== "All courses" && <><span>·</span><button onClick={() => setActiveSloLecturer(ALL_LECTURERS)}>{activeSloCourse}</button></>}
              {activeSloLecturer !== ALL_LECTURERS && <><span>·</span><button onClick={() => setActiveSloLecturer(activeSloLecturer)}>{lecturerFolderLabel(activeSloLecturer)}</button></>}
            </nav>}</div><button className="convert-slo-button" onClick={openSloExport}><AppIcon name="download"/>Export SLOs</button></div>
          <div className="slo-groups">{visibleSloLectures.map((lecture) => {
            const entries = lecture.slos.map((slo, index) => ({ slo, index })).filter(({ index }) => !flaggedSLOsSelected || lecture.flaggedSLOs.includes(index));
            return <article key={lecture.id}><header><span className="file-icon"><AppIcon name="target"/></span><div><small>{lecture.academicYear} · {lecture.course} · {lecturerFolderLabel(lecture.lecturer)}</small><h2>{lecture.title}</h2></div><span className="slo-header-actions"><button className="slo-reparse-trigger" onClick={() => openSloReparse(lecture.id)}>Luna re-parse</button><button onClick={() => openLectureBrief(lecture.id)}>Open lecture <AppIcon name="arrow"/></button></span></header><ol>{entries.map(({ slo, index }) => {
              const flagged = lecture.flaggedSLOs.includes(index);
              return <li key={`${index}-${slo}`}><span>{index + 1}</span><p>{slo}</p><button className={`slo-flag ${flagged ? "flagged" : ""}`} aria-label={flagged ? "Unflag this SLO" : "Flag this SLO"} aria-pressed={flagged} title={flagged ? "Remove flag" : "Flag for review"} onClick={() => toggleSloFlag(lecture.id, index)}><AppIcon name="flag"/></button></li>;
            })}</ol></article>;
          })}</div>
          {visibleSloLectures.length === 0 && <div className="empty-state"><AppIcon name="target"/><strong>{flaggedSLOsSelected ? "No flagged SLOs yet" : "No SLOs in this folder yet"}</strong><span>{flaggedSLOsSelected ? "Use the flag beside any SLO to keep it here for review." : "Upload a lecture or choose another folder from the SLO tree."}</span></div>}
        </section>}

        {view === "concepts" && <section className="full-page concept-bank-page">
          <div className="page-toolbar concept-bank-toolbar"><div className="eyebrow">CONCEPT BANK</div><div className="concept-filter" aria-label="Concept bank view"><button className={conceptFilter === "active" ? "active" : ""} onClick={() => setConceptFilter("active")}>Current</button><button className={conceptFilter === "archived" ? "active" : ""} onClick={() => setConceptFilter("archived")}>Archived</button></div></div>
          {visibleConcepts.length > 0 ? <div className="concept-bank-list">{visibleConcepts.map((concept) => {
            const lecture = lectures.find((item) => item.id === concept.lectureId);
            return <article className="concept-bank-card" key={concept.id}><button className="concept-source" onClick={() => openConceptSource(concept)} disabled={!lecture}><strong>{concept.text}</strong><small>{lecture ? `${lecture.title} · PDF page ${concept.page}` : `Source lecture unavailable · PDF page ${concept.page}`}</small></button><button className="concept-archive" onClick={() => setConceptArchived(concept, conceptFilter === "active")}>{conceptFilter === "active" ? "Archive" : "Restore"}</button></article>;
          })}</div> : <div className="home-empty"><strong>{conceptFilter === "active" ? "No concepts saved yet" : "No archived concepts"}</strong><span>{conceptFilter === "active" ? "Highlight text in a lecture PDF and add it to your concept bank." : "Archived concepts will remain available here."}</span></div>}
        </section>}

        {sloReparseLecture && <div className="export-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !sloReparseLoading) setSloReparseLectureId(""); }}>
          <section className="slo-reparse-modal" role="dialog" aria-modal="true" aria-labelledby="slo-reparse-title">
            <header><div><small>LUNA SLO REVIEW</small><h2 id="slo-reparse-title">{sloReparseProposal ? "Review Luna’s proposal" : "Re-parse this lecture’s SLOs"}</h2><p>{sloReparseLecture.title}</p></div><button className="icon-button" aria-label="Close SLO re-parse" disabled={sloReparseLoading} onClick={() => setSloReparseLectureId("")}><AppIcon name="x"/></button></header>
            {!sloReparseProposal ? <div className="reparse-request">
              <p>Luna will re-read the extracted slide text and propose a corrected objective list. Your existing SLOs will not change until you approve the result.</p>
              <label htmlFor="slo-reparse-instruction"><span>Optional note for Luna</span><textarea id="slo-reparse-instruction" value={sloReparseInstruction} onChange={(event) => setSloReparseInstruction(event.target.value)} maxLength={2000} placeholder="For example: These objectives were merged into one paragraph. Split them into separate SLOs while preserving the original wording." /></label>
              <div className="current-slo-summary"><strong>Current extraction</strong><span>{sloReparseLecture.slos.length} SLO{sloReparseLecture.slos.length === 1 ? "" : "s"}</span></div>
            </div> : <div className="reparse-proposal"><p>Edit anything that still needs correction before saving.</p><ol>{sloReparseProposal.map((slo, index) => <li key={index}><span>{index + 1}</span><textarea aria-label={`Proposed SLO ${index + 1}`} value={slo} onChange={(event) => setSloReparseProposal((current) => current?.map((item, itemIndex) => itemIndex === index ? event.target.value : item) ?? null)} /><button aria-label={`Remove proposed SLO ${index + 1}`} title="Remove SLO" onClick={() => setSloReparseProposal((current) => current?.filter((_, itemIndex) => itemIndex !== index) ?? null)}><AppIcon name="trash"/></button></li>)}</ol><button className="add-proposed-slo" onClick={() => setSloReparseProposal((current) => current ? [...current, ""] : current)}>+ Add SLO</button></div>}
            <footer>{sloReparseProposal ? <><button onClick={() => setSloReparseProposal(null)}>Back</button><button onClick={() => setSloReparseLectureId("")}>Keep current</button><button className="reparse-confirm" onClick={acceptSloReparse}>Replace SLOs</button></> : <><button disabled={sloReparseLoading} onClick={() => setSloReparseLectureId("")}>Cancel</button><button className="reparse-confirm" disabled={sloReparseLoading} onClick={runSloReparse}>{sloReparseLoading ? "Luna is reviewing…" : "Re-parse SLOs"}</button></>}</footer>
          </section>
        </div>}

        {sloExportOpen && <div className="export-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSloExportOpen(false); }}>
          <section className="slo-export-modal" role="dialog" aria-modal="true" aria-labelledby="slo-export-title">
            <header><div><small>SLO EXPORT</small><h2 id="slo-export-title">Choose SLOs by folder</h2><p>Select an academic year, course, lecturer, or individual lecture.</p></div><button className="icon-button" aria-label="Close SLO export" onClick={() => setSloExportOpen(false)}><AppIcon name="x"/></button></header>
            <div className="export-selection-toolbar"><span><strong>{selectedExportCount}</strong> of {exportableLectures.length} lectures selected</span><div><button onClick={() => setExportLectureSelection(exportableLectures.map((lecture) => lecture.id), true)}>Select all</button><button onClick={() => setSelectedExportLectureIds(new Set())}>Clear</button></div></div>
            <div className="export-options">
              <label className="export-sort-option"><span>File format</span><select value={sloExportFormat} onChange={(event) => setSloExportFormat(event.target.value as "pdf" | "excel")}><option value="pdf">PDF · printable</option><option value="excel">Excel · editable tracker</option></select></label>
              <label className="export-sort-option"><span>Order lecture SLOs by</span><select value={sloExportSort} onChange={(event) => setSloExportSort(event.target.value as "date" | "lecturer")}><option value="date">Lecture date · newest first</option><option value="lecturer">Lecturer · A–Z</option></select></label>
              {sloExportFormat === "pdf" ? <label className="export-progress-option" htmlFor="include-progress-tracker"><input id="include-progress-tracker" type="checkbox" aria-label="Include progress tracker" checked={includeProgressTracker} onChange={(event) => setIncludeProgressTracker(event.target.checked)}/><span><strong>Include progress tracker</strong><small>Add Strong / O.K. / Weak boxes beside every SLO.</small></span></label> : <div className="excel-export-note"><strong>Editable Excel tracker</strong><small>Includes a Progress dropdown and a blank Notes column.</small></div>}
            </div>
            <div className="export-tree">{academicYears.map((year) => {
              const yearLectures = exportableLectures.filter((lecture) => lecture.academicYear === year);
              if (!yearLectures.length) return null;
              const yearIds = yearLectures.map((lecture) => lecture.id);
              const allYearSelected = yearIds.every((id) => selectedExportLectureIds.has(id));
              return <section className="export-year" key={year}><label className="export-folder year"><input type="checkbox" checked={allYearSelected} onChange={() => setExportLectureSelection(yearIds, !allYearSelected)}/><strong>{year}</strong><span>{yearLectures.length} lectures</span></label>
                <div>{(coursesByYear[year] ?? []).map((course) => {
                  const courseLectures = yearLectures.filter((lecture) => lecture.course === course);
                  if (!courseLectures.length) return null;
                  const courseIds = courseLectures.map((lecture) => lecture.id);
                  const allCourseSelected = courseIds.every((id) => selectedExportLectureIds.has(id));
                  const lecturers = Array.from(new Set(courseLectures.map((lecture) => lecture.lecturer))).sort((a, b) => compareText(lecturerFolderLabel(a), lecturerFolderLabel(b)));
                  return <section className="export-course" key={course}><label className="export-folder course"><input type="checkbox" checked={allCourseSelected} onChange={() => setExportLectureSelection(courseIds, !allCourseSelected)}/><strong>{course}</strong><span>{courseLectures.length}</span></label>
                    <div>{lecturers.map((lecturer) => {
                      const lecturerLectures = courseLectures.filter((lecture) => lecture.lecturer === lecturer).sort((a, b) => lectureDateTimestamp(b.date) - lectureDateTimestamp(a.date));
                      const lecturerIds = lecturerLectures.map((lecture) => lecture.id);
                      const allLecturerSelected = lecturerIds.every((id) => selectedExportLectureIds.has(id));
                      return <section className="export-lecturer" key={lecturer}><label className="export-folder lecturer"><input type="checkbox" checked={allLecturerSelected} onChange={() => setExportLectureSelection(lecturerIds, !allLecturerSelected)}/><strong>{lecturerFolderLabel(lecturer)}</strong><span>{lecturerLectures.length}</span></label>
                        <div>{lecturerLectures.map((lecture) => <label className="export-lecture" key={lecture.id} htmlFor={`export-lecture-${lecture.id}`} aria-label={`Select ${lecture.title}`}><input id={`export-lecture-${lecture.id}`} type="checkbox" checked={selectedExportLectureIds.has(lecture.id)} onChange={(event) => setExportLectureSelection([lecture.id], event.target.checked)}/><span><strong>{lecture.title}</strong><small>{lecture.date} · {lecture.slos.length} SLOs</small></span></label>)}</div>
                      </section>;
                    })}</div>
                  </section>;
                })}</div>
              </section>;
            })}</div>
            <footer><button onClick={() => setSloExportOpen(false)}>Cancel</button><button className="convert-confirm" disabled={selectedExportCount === 0} onClick={exportSelectedSlos}><AppIcon name="download"/>Export {sloExportFormat === "excel" ? "Excel" : "PDF"}</button></footer>
          </section>
        </div>}

        {preReadDialogOpen && <div className="export-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !preReadSaving) setPreReadDialogOpen(false); }}>
          <section className="preread-modal" role="dialog" aria-modal="true" aria-labelledby="preread-modal-title">
            <header><div><small>PRE-READ LIBRARY</small><h2 id="preread-modal-title">Add a pre-read</h2></div><button className="icon-button" aria-label="Close pre-read form" disabled={preReadSaving} onClick={() => setPreReadDialogOpen(false)}><AppIcon name="x"/></button></header>
            <div className="preread-source-tabs" aria-label="Pre-read source type"><button className={preReadDraft.sourceType === "pdf" ? "active" : ""} aria-pressed={preReadDraft.sourceType === "pdf"} onClick={() => setPreReadDraft((draft) => ({ ...draft, sourceType: "pdf" }))}>PDF</button><button className={preReadDraft.sourceType === "web" ? "active" : ""} aria-pressed={preReadDraft.sourceType === "web"} onClick={() => setPreReadDraft((draft) => ({ ...draft, sourceType: "web" }))}>Web article / pasted reading</button></div>
            <div className="preread-form">
              <label><span>Title</span><input value={preReadDraft.title} onChange={(event) => setPreReadDraft((draft) => ({ ...draft, title: event.target.value }))} placeholder={preReadDraft.sourceType === "pdf" ? "Optional — filename will be used" : "Required"}/></label>
              <label><span>Author or source</span><input value={preReadDraft.author} onChange={(event) => setPreReadDraft((draft) => ({ ...draft, author: event.target.value }))} placeholder="Optional"/></label>
              <div className="preread-form-row"><label><span>Course</span><input value={preReadDraft.course} onChange={(event) => setPreReadDraft((draft) => ({ ...draft, course: event.target.value }))} placeholder="e.g. MCF"/></label><label><span>Academic year</span><input value={preReadDraft.academicYear} onChange={(event) => setPreReadDraft((draft) => ({ ...draft, academicYear: event.target.value }))} placeholder="2026-2027"/></label></div>
              {preReadDraft.sourceType === "pdf" ? <div className="preread-file-field"><span>PDF file</span><button onClick={() => preReadFileInput.current?.click()}><AppIcon name="upload"/>{preReadPdfFile?.name ?? "Choose PDF"}</button><input ref={preReadFileInput} type="file" accept="application/pdf" hidden onChange={(event) => { const file = event.target.files?.[0] ?? null; setPreReadPdfFile(file); if (file && !preReadDraft.title.trim()) setPreReadDraft((draft) => ({ ...draft, title: file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ") })); event.target.value = ""; }}/><small>Text will be extracted page-by-page so search results can open the matching PDF page.</small></div> : <>
                <label><span>Source link <em>optional</em></span><input type="url" value={preReadDraft.sourceUrl} onChange={(event) => setPreReadDraft((draft) => ({ ...draft, sourceUrl: event.target.value }))} placeholder="https://…"/></label>
                <label><span>Article or reading text</span><textarea value={preReadDraft.text} onChange={(event) => setPreReadDraft((draft) => ({ ...draft, text: event.target.value }))} placeholder="Paste the assigned text here. FCOM.lib stores it locally and makes it searchable."/></label>
              </>}
            </div>
            <footer><button disabled={preReadSaving} onClick={() => setPreReadDialogOpen(false)}>Cancel</button><button className="save-preread" disabled={preReadSaving} onClick={addPreRead}>{preReadSaving ? "Indexing pre-read…" : "Add to pre-reads"}</button></footer>
          </section>
        </div>}

        {previewPreRead && <div className="export-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewPreReadId(""); }}>
          <section className="preread-reader-modal" role="dialog" aria-modal="true" aria-labelledby="preread-reader-title">
            <header><div><small>{previewPreRead.academicYear} · {previewPreRead.course}</small><h2 id="preread-reader-title">{previewPreRead.title}</h2><p>{previewPreRead.author}</p></div><button className="icon-button" aria-label="Close pre-read details" onClick={() => setPreviewPreReadId("")}><AppIcon name="x"/></button></header>
            <div className="reader-status"><span>Reading status</span><div>{(["unread", "read", "rereview"] as PreReadStatus[]).map((status) => <button key={status} className={previewPreRead.status === status ? "active" : ""} onClick={() => updatePreReadStatus(previewPreRead.id, status)}>{preReadStatusLabel[status]}</button>)}</div></div>
            <div className="preread-reader-body">{previewPreRead.sourceType === "web" ? <p>{previewPreRead.text}</p> : <div className="pdf-index-summary"><AppIcon name="file"/><strong>{previewPreRead.pages.length} PDF pages indexed</strong><span>The extracted page text is available in Source text search.</span></div>}</div>
            <footer><button onClick={() => setPreviewPreReadId("")}>Close</button><button className="save-preread" onClick={() => previewPreRead.sourceType === "web" && !previewPreRead.sourceUrl ? setPreviewPreReadId("") : openPreReadSource(previewPreRead)}>{previewPreRead.sourceType === "pdf" ? "Open PDF" : previewPreRead.sourceUrl ? "Open original article" : "Done"}<AppIcon name={previewPreRead.sourceType === "web" ? "link" : "arrow"}/></button></footer>
          </section>
        </div>}

        {viewerLecture && <div className="viewer-modal" role="dialog" aria-modal="true" aria-label="Lecture slide viewer">
          <section className="viewer-stage">
            <header className="viewer-toolbar"><div><small>{viewerLecture.title}</small><strong>PDF page {selectedPage} of {viewerLecture.pages}</strong></div><div className="viewer-controls"><button disabled={selectedPage <= 1} onClick={() => selectViewerPage(selectedPage - 1)}>Previous</button><label className="page-jump"><span>Page</span><input aria-label="PDF page number" type="number" min="1" max={viewerLecture.pages} value={selectedPage} onChange={(event) => selectViewerPage(Number(event.target.value) || 1)} /></label><button disabled={selectedPage >= viewerLecture.pages} onClick={() => selectViewerPage(selectedPage + 1)}>Next</button><button className={`pen-toggle ${penEnabled ? "active" : ""}`} aria-pressed={penEnabled} onClick={() => { setPenEnabled((current) => !current); setSelectedPdfText(""); window.getSelection()?.removeAllRanges(); }}>{penEnabled ? "Pen on" : "Pen"}</button>{viewerPageInk.length > 0 && <button onClick={() => saveCurrentInk(viewerPageInk.slice(0, -1))}>Undo ink</button>}<button className={`mark-slide ${currentSlideIsMarked ? "marked" : ""}`} aria-pressed={currentSlideIsMarked} onClick={toggleCurrentSlideMark}><AppIcon name="bookmark"/>{currentSlideIsMarked ? "Marked" : "Mark slide"}</button></div></header>
            {viewerFile && viewerFileLectureId === viewerLecture.id ? <PdfCanvasViewer key={viewerLecture.id} file={viewerFile} lectureId={viewerLecture.id} page={selectedPage} selectedText={selectedPdfText} bankedConceptTexts={viewerPageConceptTexts} inkStrokes={viewerPageInk} penEnabled={penEnabled} onSelectionChange={setSelectedPdfText} onAddConcept={addSelectedConcept} onInkChange={saveCurrentInk} /> : <div className="slide-fallback"><span className="result-page">{selectedSlide.page}</span><h2>{selectedSlide.heading}</h2><p>{selectedSlide.text || "Loading the selected lecture…"}</p><small>Uploaded PDFs are stored locally and displayed page-for-page here.</small></div>}
          </section>
          <aside className="ai-panel"><div className="ai-panel-head"><h2>Ask about this slide</h2><button className="ai-close" aria-label="Close lecture viewer" onClick={() => setViewerLectureId("")}><AppIcon name="x"/></button></div>
            {chatMessages.length > 0 || chatLoading ? <div className="luna-chat" aria-live="polite">{chatMessages.map((message) => <article className={`chat-message ${message.role}`} key={message.id}><small>{message.role === "assistant" ? "Luna" : `You · page ${message.page}`}</small><p>{message.text}</p></article>)}{chatLoading && <article className="chat-message assistant pending"><small>Luna</small><p>Thinking…</p></article>}</div> : null}
            <form className={`luna-chat-form ${chatMessages.length === 0 ? "fresh" : ""}`} onSubmit={sendChatMessage}><textarea aria-label="Ask Luna about this slide" value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} rows={2} maxLength={2000} /><button type="submit" disabled={chatLoading || !chatDraft.trim()}>Send</button></form>
            <div className="marked-pages"><div className="section-head"><h3>Marked slides</h3><span>{viewerMarkedSlides.length}</span></div>{viewerMarkedSlides.length > 0 ? <div className="marked-page-list">{viewerMarkedSlides.map((page) => <button className={page === selectedPage ? "active" : ""} key={page} onClick={() => selectViewerPage(page)}><AppIcon name="bookmark"/>Slide {page}</button>)}</div> : <p>No slides marked yet. Mark any slide to return to it here.</p>}</div>
            <div className="note-box"><div className="section-head"><h3>My note for slide {selectedPage}</h3><button onClick={saveCurrentNote}>Save</button></div><textarea aria-label={`My note for slide ${selectedPage}`} value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} /></div>
            {viewerFlaggedSLOs.length > 0 && <div className="viewer-flagged-slos"><div className="section-head"><h3>Flagged SLOs from this lecture</h3></div><ul>{viewerFlaggedSLOs.map((slo, index) => <li key={`${index}-${slo}`}>{slo}</li>)}</ul></div>}
          </aside>
        </div>}
      </section>
    </main>
  );
}
