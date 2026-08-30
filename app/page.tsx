"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { deleteLecture, getLectureFile, loadCloudLibrary, loadLectures, migrateLocalLibraryToCloud, normalizeLecture, saveLecture, saveLectures, setCloudUser, type InkStroke, type Lecture, type MigrationProgress, type Slide, type SloStrength } from "../lib/lecture-store";
import { downloadSloExcel } from "../lib/slo-excel";
import { downloadSloPdf } from "../lib/slo-pdf";
import { cloudConfigured, supabase, type CloudSession } from "../lib/supabase-client";
import { clearUploadDiagnosticCheckpoint, downloadDiagnostics, recordDiagnostic, setUploadDiagnosticCheckpoint } from "../lib/diagnostics";
import { compareLectureWeeks, compareText, lectureWeekLabel, lecturerFolderLabel } from "../lib/curriculum";
import { searchMatchScore, searchResultCollectionTitle, searchResultWeek, type SearchResult } from "../lib/curriculum-search";
import { pdfjs } from "../lib/pdf-runtime";
import { seedLectures } from "../lib/seed-lectures";
import { AppIcon } from "./components/AppIcon";
import { LectureGallery } from "./components/LectureGallery";
import { LectureImportReview, type LectureImportJob, type LectureImportStatus } from "./components/LectureImportReview";
import { PdfCanvasViewer } from "./components/PdfCanvasViewer";
import { SloWorkspace } from "./components/SloWorkspace";

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

function currentAcademicYear() {
  const now = new Date();
  const start = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${start + 1}`;
}

type ImportDestination = { academicYear: string; course: string | null; lecturer: string | null; label: string };

function mergeAiLectureBrief(base: Lecture, response: unknown, sourceSlides: Slide[], destination: ImportDestination) {
  const brief = response && typeof response === "object" && !Array.isArray(response) ? response as Record<string, unknown> : {};
  const accepted: Record<string, unknown> = {};
  const rejectedFields: string[] = [];
  (["title", "lecturer", "course", "summary"] as const).forEach((field) => {
    if (!(field in brief)) return;
    if (typeof brief[field] === "string" && brief[field].trim()) accepted[field] = brief[field];
    else rejectedFields.push(field);
  });
  (["outline", "slos"] as const).forEach((field) => {
    if (!(field in brief)) return;
    const values = Array.isArray(brief[field]) ? brief[field].filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
    if (values.length) accepted[field] = values;
    else rejectedFields.push(field);
  });
  if (Array.isArray(brief.toc)) accepted.toc = brief.toc;
  const aiSlidesByPage = new Map<number, Record<string, unknown>>();
  (Array.isArray(brief.slides) ? brief.slides : []).forEach((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const record = value as Record<string, unknown>;
    if (typeof record.page === "number" && Number.isInteger(record.page) && record.page > 0) aiSlidesByPage.set(record.page, record);
  });
  const slides = sourceSlides.map((source) => {
    const candidate = aiSlidesByPage.get(source.page);
    if (!candidate) return source;
    return { page: source.page, heading: typeof candidate.heading === "string" && candidate.heading.trim() ? candidate.heading : source.heading, text: typeof candidate.text === "string" && candidate.text.trim() ? candidate.text : source.text };
  });
  const normalized = normalizeLecture({ ...base, ...accepted, slides, notes: {}, markups: {}, markedSlides: [], flaggedSLOs: [], sloStrengths: {}, studySLOs: [], toc:accepted.toc ?? [], academicYear: destination.academicYear, course: destination.course ?? accepted.course ?? base.course, lecturer: destination.lecturer ?? accepted.lecturer ?? base.lecturer, favorite: false });
  return { lecture: normalized ?? base, rejectedFields };
}

type View = "lectures" | "search" | "slos";
type PendingUpload = { id: string; file: File; destination: ImportDestination };
const aiEndpoint = (action: "analyze" | "reparse-slos" | "toc") => `/.netlify/functions/${action}`;

export default function Home() {
  const [lectures, setLectures] = useState<Lecture[]>(seedLectures);
  const [view, setView] = useState<View>("lectures");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
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
  const [searchMode, setSearchMode] = useState<"catalog" | "slides">("catalog");
  const [searchYear, setSearchYear] = useState("all");
  const [searchCourse, setSearchCourse] = useState("all");
  const [searchLecturer, setSearchLecturer] = useState("all");
  const [searchSort, setSearchSort] = useState<"relevance" | "week-asc" | "name-asc">("relevance");
  const [sloCourseFilter, setSloCourseFilter] = useState("all");
  const [sloWeekFilter, setSloWeekFilter] = useState("all");
  const [sloInstructorFilter, setSloInstructorFilter] = useState("all");
  const [sloViewFilter, setSloViewFilter] = useState<"all" | "flagged">("all");
  const [sloExportOpen, setSloExportOpen] = useState(false);
  const [selectedExportLectureIds, setSelectedExportLectureIds] = useState<Set<string>>(new Set());
  const [sloExportFormat, setSloExportFormat] = useState<"pdf" | "excel">("pdf");
  const [sloExportSort, setSloExportSort] = useState<"week" | "lecturer">("week");
  const [includeProgressTracker, setIncludeProgressTracker] = useState(false);
  const [sloReparseLectureId, setSloReparseLectureId] = useState("");
  const [sloReparseInstruction, setSloReparseInstruction] = useState("");
  const [sloReparseProposal, setSloReparseProposal] = useState<string[] | null>(null);
  const [sloReparseLoading, setSloReparseLoading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<LectureImportJob[]>([]);
  const [uploadReviewOpen, setUploadReviewOpen] = useState(false);
  const [uploadFinalizing, setUploadFinalizing] = useState(false);
  const [viewerLectureId, setViewerLectureId] = useState("");
  const [selectedPage, setSelectedPage] = useState(1);
  const [viewerFile, setViewerFile] = useState<Blob | null>(null);
  const [viewerFileLectureId, setViewerFileLectureId] = useState("");
  const [pdfZoom, setPdfZoom] = useState(1);
  const [tocOpen, setTocOpen] = useState(false);
  const [tocLoading, setTocLoading] = useState(false);
  const [tocError, setTocError] = useState("");
  const [penEnabled, setPenEnabled] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const pendingUploads = useRef<PendingUpload[]>([]);
  const uploadRunnerActive = useRef(false);

  useEffect(() => {
    void (async () => {
      try { const saved = await loadLectures(); if (saved.length) { setLectures(saved); await saveLectures(saved); } else await saveLectures(seedLectures); }
      catch { setNotice("Local database is unavailable; using an in-memory trial library."); }
      finally { setLocalReady(true); }
    })();
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => { if (!active) return; if (error) setAuthMessage(error.message); setCloudSession(data.session); setCloudUser(data.session?.user.id ?? null); setAuthReady(true); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { if (!active) return; setCloudSession(session); setCloudUser(session?.user.id ?? null); setAuthReady(true); if (!session) setCloudReady(true); });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!localReady || !cloudSession) return;
    let cancelled = false;
    setCloudUser(cloudSession.user.id);
    void loadCloudLibrary().then((library) => { if (cancelled) return; setCloudHasData(library.lectures.length > 0); if (library.lectures.length) setLectures(library.lectures); }).catch((error: unknown) => { if (!cancelled) setNotice(error instanceof Error ? `Cloud library unavailable: ${error.message}` : "Cloud library unavailable."); }).finally(() => { if (!cancelled) setCloudReady(true); });
    return () => { cancelled = true; };
  }, [cloudSession, localReady]);

  useEffect(() => {
    const handleError = (event: Event) => setNotice((event as CustomEvent<string>).detail || "Cloud sync failed. Your local copy is safe.");
    const handleSuccess = () => setCloudHasData(true);
    window.addEventListener("fcom-cloud-sync-error", handleError); window.addEventListener("fcom-cloud-sync-ok", handleSuccess);
    return () => { window.removeEventListener("fcom-cloud-sync-error", handleError); window.removeEventListener("fcom-cloud-sync-ok", handleSuccess); };
  }, []);

  useEffect(() => { if (!notice) return; const timeout = window.setTimeout(() => setNotice(""), 4500); return () => window.clearTimeout(timeout); }, [notice]);

  const viewerLecture = lectures.find((lecture) => lecture.id === viewerLectureId);
  const selectedSlide = viewerLecture?.slides.find((slide) => slide.page === selectedPage) ?? { page: selectedPage, heading: `Slide ${selectedPage}`, text: "" };
  const sloReparseLecture = lectures.find((lecture) => lecture.id === sloReparseLectureId);
  const academicYears = useMemo(() => Array.from(new Set(lectures.map((lecture) => lecture.academicYear))).sort().reverse(), [lectures]);
  const coursesByYear = useMemo(() => academicYears.reduce<Record<string, string[]>>((folders, year) => { folders[year] = Array.from(new Set(lectures.filter((lecture) => lecture.academicYear === year).map((lecture) => lecture.course))).sort(compareText); return folders; }, {}), [academicYears, lectures]);
  const lecturerOptions = useMemo(() => Array.from(new Set(lectures.map((lecture) => lecture.lecturer))).sort(compareText), [lectures]);
  const visibleSloLectures = useMemo(() => lectures.filter((lecture) => lecture.slos.length > 0).filter((lecture) => sloCourseFilter === "all" || lecture.course === sloCourseFilter).filter((lecture) => sloInstructorFilter === "all" || lecture.lecturer === sloInstructorFilter).filter((lecture) => sloWeekFilter === "all" || (sloWeekFilter === "unassigned" ? lecture.week === null : lecture.week === Number(sloWeekFilter))).filter((lecture) => sloViewFilter === "all" || lecture.flaggedSLOs.length > 0).sort((a, b) => compareLectureWeeks(a.week, b.week) || compareText(a.title, b.title)), [lectures, sloCourseFilter, sloInstructorFilter, sloViewFilter, sloWeekFilter]);
  const selectedStudyObjectives = useMemo(() => lectures.flatMap((lecture) => lecture.studySLOs.flatMap((index) => lecture.slos[index] ? [{ lecture, index }] : [])), [lectures]);
  const searchCourseOptions = useMemo(() => Array.from(new Set(lectures.map((lecture) => lecture.course))).sort(compareText), [lectures]);

  const results = useMemo<SearchResult[]>(() => {
    const needle = query.trim().toLowerCase(); if (!needle) return [];
    const matches: SearchResult[] = [];
    lectures.filter((lecture) => searchYear === "all" || lecture.academicYear === searchYear).filter((lecture) => searchCourse === "all" || lecture.course === searchCourse).filter((lecture) => searchLecturer === "all" || lecture.lecturer === searchLecturer).forEach((lecture) => {
      const lectureScore = searchMatchScore(needle, lecture.title, `${lecture.summary} ${lecture.course} ${lecture.lecturer} ${lecture.outline.join(" ")}`);
      if (lectureScore > 0 && searchMode === "catalog") matches.push({ kind: "lecture", lecture, title: lecture.title, text: lecture.summary, score: lectureScore });
      if (searchMode === "catalog") lecture.slos.forEach((slo, sloIndex) => { const score = searchMatchScore(needle, slo, `${lecture.title} ${lecture.course} ${lecture.lecturer}`); if (score > 0) matches.push({ kind: "slo", lecture, title: slo, text: lecture.title, score, sloIndex }); });
      if (searchMode === "slides") lecture.slides.forEach((slide) => { const score = searchMatchScore(needle, slide.heading, `${slide.text} ${lecture.title}`); if (score > 0) matches.push({ kind: "slide", lecture, title: slide.heading, text: slide.text, score, page: slide.page }); });
    });
    return matches.sort((a, b) => searchSort === "week-asc" ? searchResultWeek(a) - searchResultWeek(b) || b.score - a.score : searchSort === "name-asc" ? compareText(searchResultCollectionTitle(a), searchResultCollectionTitle(b)) || compareText(a.title, b.title) : b.score - a.score || searchResultWeek(a) - searchResultWeek(b));
  }, [lectures, query, searchCourse, searchLecturer, searchMode, searchSort, searchYear]);
  const groupedResults = useMemo(() => ({ lecture: results.filter((item) => item.kind === "lecture"), slo: results.filter((item) => item.kind === "slo"), slide: results.filter((item) => item.kind === "slide") }), [results]);

  useEffect(() => {
    let cancelled = false; if (!viewerLectureId) return;
    void getLectureFile(viewerLectureId).then((file) => { if (!cancelled) { setViewerFile(file); setViewerFileLectureId(viewerLectureId); } }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [viewerLectureId]);

  useEffect(() => {
    if (!viewerLecture) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setViewerLectureId(""); return; }
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)) return;
      const key = event.key.toLowerCase();
      if (!event.ctrlKey && !event.metaKey && !event.altKey && (key === "q" || key === "e" || event.key === "ArrowLeft" || event.key === "ArrowRight")) selectViewerPage(key === "q" || event.key === "ArrowLeft" ? selectedPage - 1 : selectedPage + 1);
    };
    window.addEventListener("keydown", handleKey); return () => window.removeEventListener("keydown", handleKey);
  // The keyboard handler intentionally follows the current viewer snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerLecture, selectedPage]);

  async function generateLectureToc(lecture: Lecture) {
    if (tocLoading) return;
    setTocLoading(true); setTocError("");
    try {
      const response = await fetch(aiEndpoint("toc"), { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ lecture:{ title:lecture.title, pages:lecture.pages, slides:lecture.slides } }) });
      const responseText = await response.text();
      let data: { items?:unknown; error?:string; detail?:string } = {};
      try { data = responseText ? JSON.parse(responseText) as typeof data : {}; } catch { if (response.ok) throw new Error("Luna returned an unreadable table of contents."); }
      if (!response.ok) throw new Error(data.error || data.detail || "Luna could not build the table of contents.");
      const normalized = normalizeLecture({ ...lecture, toc:data.items });
      if (!normalized?.toc.length) throw new Error("Luna did not return a usable table of contents.");
      setLectures((current) => current.map((item) => item.id === lecture.id ? normalized : item));
      await saveLecture(normalized);
    } catch (error) { setTocError(readableError(error)); }
    finally { setTocLoading(false); }
  }

  function openLecture(lecture: Lecture, page = 1) {
    const targetPage = Math.min(lecture.pages, Math.max(1, page));
    setSelectedPage(targetPage); setViewerFile(null); setViewerFileLectureId(""); setPdfZoom(1); setTocOpen(false); setTocError(""); setPenEnabled(false); setViewerLectureId(lecture.id);
    if (!lecture.toc.length) void generateLectureToc(lecture);
  }

  function selectViewerPage(page: number) {
    if (!viewerLecture) return;
    const targetPage = Math.min(viewerLecture.pages, Math.max(1, page)); setSelectedPage(targetPage);
  }

  function openSearchResult(result: SearchResult) {
    if (result.kind === "slide" && result.page) openLecture(result.lecture, result.page);
    else if (result.kind === "slo") { setSloCourseFilter("all"); setSloWeekFilter("all"); setSloInstructorFilter("all"); setSloViewFilter("all"); setView("slos"); }
    else openLecture(result.lecture);
  }

  async function toggleSloFlag(lectureId: string, sloIndex: number) {
    const lecture = lectures.find((item) => item.id === lectureId); if (!lecture) return;
    const wasFlagged = lecture.flaggedSLOs.includes(sloIndex);
    const updated = { ...lecture, flaggedSLOs: wasFlagged ? lecture.flaggedSLOs.filter((index) => index !== sloIndex) : [...lecture.flaggedSLOs, sloIndex].sort((a, b) => a - b) };
    setLectures((current) => current.map((item) => item.id === lectureId ? updated : item)); await saveLecture(updated); setNotice(wasFlagged ? "SLO removed from priorities." : "SLO added to priorities.");
  }

  async function setSloStrength(lectureId: string, sloIndex: number, strength: SloStrength) {
    const lecture = lectures.find((item) => item.id === lectureId); if (!lecture) return;
    const updated = { ...lecture, sloStrengths: { ...lecture.sloStrengths, [sloIndex]: strength } };
    setLectures((current) => current.map((item) => item.id === lectureId ? updated : item));
    try { await saveLecture(updated); } catch (error) { setNotice(`Confidence update failed: ${readableError(error)}`); }
  }

  async function setStudySloSelection(items: Array<{ lectureId:string; index:number }>, selected: boolean) {
    const requested = new Map<string, number[]>();
    items.forEach(({ lectureId, index }) => requested.set(lectureId, [...(requested.get(lectureId) ?? []), index]));
    const updatedLectures = lectures.flatMap((lecture) => {
      const indexes = requested.get(lecture.id); if (!indexes) return [];
      const next = new Set(lecture.studySLOs);
      indexes.forEach((index) => selected ? next.add(index) : next.delete(index));
      return [{ ...lecture, studySLOs:Array.from(next).sort((a, b) => a - b) }];
    });
    if (!updatedLectures.length) return;
    const byId = new Map(updatedLectures.map((lecture) => [lecture.id, lecture]));
    setLectures((current) => current.map((lecture) => byId.get(lecture.id) ?? lecture));
    try { await Promise.all(updatedLectures.map((lecture) => saveLecture(lecture))); } catch (error) { setNotice(`Study-set update failed: ${readableError(error)}`); }
  }

  function openSloReparse(lectureId: string) { setSloReparseLectureId(lectureId); setSloReparseInstruction(""); setSloReparseProposal(null); }

  async function runSloReparse() {
    if (!sloReparseLecture) return; setSloReparseLoading(true);
    try {
      const response = await fetch(aiEndpoint("reparse-slos"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lecture: sloReparseLecture, instruction: sloReparseInstruction.trim().slice(0, 2000) }) });
      const data = await response.json() as { slos?: unknown; error?: string; detail?: string };
      if (!response.ok) throw new Error(data.error || data.detail || "Luna could not re-parse these SLOs.");
      const proposal = Array.isArray(data.slos) ? data.slos.filter((slo): slo is string => typeof slo === "string" && Boolean(slo.trim())).map((slo) => slo.trim()) : [];
      if (!proposal.length) throw new Error("Luna did not return any usable SLOs."); setSloReparseProposal(proposal);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Luna could not re-parse these SLOs."); }
    finally { setSloReparseLoading(false); }
  }

  async function acceptSloReparse() {
    if (!sloReparseLecture || !sloReparseProposal) return;
    const slos = Array.from(new Set(sloReparseProposal.map((slo) => slo.trim()).filter(Boolean))); if (!slos.length) { setNotice("Keep at least one SLO before saving."); return; }
    const priorState = new Map(sloReparseLecture.slos.map((slo, index) => [slo.trim(), { priority:sloReparseLecture.flaggedSLOs.includes(index), selected:sloReparseLecture.studySLOs.includes(index), strength:sloReparseLecture.sloStrengths[index] }]));
    const sloStrengths: Record<number, SloStrength> = {};
    slos.forEach((slo, index) => { const strength = priorState.get(slo)?.strength; if (strength) sloStrengths[index] = strength; });
    const updated = {
      ...sloReparseLecture,
      slos,
      flaggedSLOs: slos.flatMap((slo, index) => priorState.get(slo)?.priority ? [index] : []),
      studySLOs: slos.flatMap((slo, index) => priorState.get(slo)?.selected ? [index] : []),
      sloStrengths,
    };
    setLectures((current) => current.map((lecture) => lecture.id === updated.id ? updated : lecture)); await saveLecture(updated); setSloReparseLectureId(""); setSloReparseProposal(null); setNotice(`Updated ${updated.title}.`);
  }

  function openSloExport() { setSelectedExportLectureIds(new Set(visibleSloLectures.map((lecture) => lecture.id))); setSloExportOpen(true); }
  function setExportLectureSelection(ids: string[], selected: boolean) { setSelectedExportLectureIds((current) => { const next = new Set(current); ids.forEach((id) => selected ? next.add(id) : next.delete(id)); return next; }); }
  function exportSelectedSlos() {
    const selected = lectures.filter((lecture) => selectedExportLectureIds.has(lecture.id) && lecture.slos.length > 0).sort((a, b) => compareText(a.academicYear, b.academicYear) || compareText(a.course, b.course) || (sloExportSort === "lecturer" ? compareText(lecturerFolderLabel(a.lecturer), lecturerFolderLabel(b.lecturer)) : 0) || compareLectureWeeks(a.week, b.week) || compareText(a.title, b.title));
    if (!selected.length) { setNotice("Select at least one lecture with SLOs."); return; }
    if (sloExportFormat === "excel") downloadSloExcel(selected); else downloadSloPdf(selected, { includeProgressTracker }); setSloExportOpen(false); setNotice(`Created an SLO ${sloExportFormat === "excel" ? "Excel workbook" : "PDF"} from ${selected.length} lectures.`);
  }

  async function processLecture(file: File, destination: ImportDestination, onStage: (status: LectureImportStatus) => void) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw new Error("Please choose a PDF lecture deck.");
    const context = { fileName: file.name, fileSizeBytes: file.size, fileType: file.type || "unknown", destination: destination.label };
    recordDiagnostic("upload", "Lecture import started", context); setUploadDiagnosticCheckpoint("starting", context); onStage("extracting");
    try {
      let data = new Uint8Array(await file.arrayBuffer()); const pdf = await pdfjs.getDocument({ data }).promise; const pageCount = pdf.numPages; const slides: Slide[] = [];
      try {
        for (let page = 1; page <= pageCount; page++) { const pdfPage = await pdf.getPage(page); try { const content = await pdfPage.getTextContent(); const text = content.items.map((item) => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ").trim(); slides.push({ page, text, heading: text.split(/(?<=[a-z])\s{2,}|[•]/)[0]?.replace(/^\d+\s*/, "").slice(0, 110) || `Slide ${page}` }); } finally { pdfPage.cleanup(); } }
      } finally { try { pdf.cleanup(); } catch { /* PDF.js may already have released the document. */ } try { await (pdf as unknown as { destroy: () => Promise<void> }).destroy(); } catch { /* Cleanup is best effort. */ } data = new Uint8Array(0); }
      const first = slides[0]?.text ?? file.name.replace(/\.pdf$/i, "");
      const title = first.replace(/^\d+\s*/, "").split(/(?:August|September|October|November|December|January|February|March|April|May|June|July)\s+\d+/i)[0].replace(/[“”"]/g, "").trim().slice(0, 100) || file.name.replace(/\.pdf$/i, "");
      const lecture: Lecture = { id: crypto.randomUUID(), title, lecturer: destination.lecturer ?? "Lecturer not detected", week: null, course: destination.course ?? "Unsorted", academicYear: destination.academicYear, favorite: false, pages: pageCount, slos: detectSLOs(slides), outline: [], toc: [], summary: `Imported ${pageCount} slides.`, slides, notes: {}, markups: {}, markedSlides: [], flaggedSLOs: [], sloStrengths: {}, studySLOs: [], fileName: file.name, createdAt: new Date().toISOString() };
      onStage("analyzing"); let aiFailed = false;
      try { let remaining = 90_000; const analysisSlides = slides.flatMap((slide) => { if (remaining <= 0) return []; const text = slide.text.slice(0, remaining); remaining -= text.length; return [{ ...slide, text }]; }); const response = await fetch(aiEndpoint("analyze"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lecture: { ...lecture, slides: analysisSlides } }) }); if (response.ok) Object.assign(lecture, mergeAiLectureBrief(lecture, await response.json(), slides, destination).lecture); else aiFailed = true; } catch { aiFailed = true; }
      clearUploadDiagnosticCheckpoint(); return { lecture, aiFailed };
    } catch (error) { recordDiagnostic("upload", "Lecture import failed", { ...context, error }); clearUploadDiagnosticCheckpoint(); throw error instanceof Error ? error : new Error("This PDF could not be processed."); }
  }

  function updateUploadJob(id: string, changes: Partial<LectureImportJob>) { setUploadQueue((current) => current.map((job) => job.id === id ? { ...job, ...changes } : job)); }
  async function runUploadQueue() {
    if (uploadRunnerActive.current) return; uploadRunnerActive.current = true;
    try { while (pendingUploads.current.length) { const job = pendingUploads.current.shift(); if (!job) continue; try { const processed = await processLecture(job.file, job.destination, (status) => updateUploadJob(job.id, { status })); updateUploadJob(job.id, { status: "ready", lecture: processed.lecture, aiFailed: processed.aiFailed }); } catch (error) { updateUploadJob(job.id, { status: "error", error: error instanceof Error ? error.message : "Import failed" }); } await new Promise<void>((resolve) => window.setTimeout(resolve, 50)); } }
    finally { uploadRunnerActive.current = false; if (pendingUploads.current.length) void runUploadQueue(); }
  }

  function enqueueFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")); if (!files.length) { setNotice("Please choose one or more PDF lecture decks."); return; }
    const destination: ImportDestination = { academicYear: currentAcademicYear(), course: null, lecturer: null, label: `${currentAcademicYear()} · course detected by Luna` };
    const entries = files.map((file) => {
      const id = crypto.randomUUID();
      return {
        pending: { id, file, destination },
        display: { id, name: file.name, file, status: "queued" as const },
      };
    });
    pendingUploads.current.push(...entries.map(({ pending }) => pending));
    setUploadQueue((current) => [...current, ...entries.map(({ display }) => display)]);
    setUploadReviewOpen(true);
    void runUploadQueue();
  }

  function updateImportDraft(id: string, changes: Partial<Lecture>) {
    setUploadQueue((current) => current.map((job) => job.id === id && job.lecture ? { ...job, lecture: { ...job.lecture, ...changes } } : job));
  }

  function removeImportJob(id: string) {
    pendingUploads.current = pendingUploads.current.filter((job) => job.id !== id);
    setUploadQueue((current) => current.filter((job) => job.id !== id));
  }

  async function finalizeImports() {
    if (uploadFinalizing) return;
    const readyJobs = uploadQueue.filter((job): job is LectureImportJob & { lecture: Lecture } => job.status === "ready" && Boolean(job.lecture));
    if (!readyJobs.length || readyJobs.length !== uploadQueue.length || readyJobs.some((job) => !job.lecture.title.trim() || !job.lecture.course.trim() || job.lecture.course.trim().toLowerCase() === "unsorted" || !job.lecture.lecturer.trim() || /not detected/i.test(job.lecture.lecturer) || job.lecture.week === null)) return;
    setUploadFinalizing(true);
    const saved: Lecture[] = []; const savedIds = new Set<string>(); let failures = 0;
    for (const job of readyJobs) {
      try { const lecture = await saveLecture(job.lecture, job.file); saved.push(lecture); savedIds.add(job.id); }
      catch (error) { failures += 1; updateUploadJob(job.id, { status: "error", error: readableError(error) }); }
    }
    if (saved.length) setLectures((current) => [...saved, ...current]);
    setUploadQueue((current) => current.filter((job) => !savedIds.has(job.id)));
    setUploadFinalizing(false);
    if (!failures) { setUploadReviewOpen(false); setNotice(`${saved.length} ${saved.length === 1 ? "lecture" : "lectures"} added.`); }
    else setNotice(`${saved.length} added; ${failures} could not be finalized.`);
  }

  async function saveCurrentInk(strokes: InkStroke[]) { if (!viewerLecture) return; const markups = { ...(viewerLecture.markups ?? {}) }; if (strokes.length) markups[selectedPage] = strokes; else delete markups[selectedPage]; const updated = { ...viewerLecture, markups }; setLectures((current) => current.map((lecture) => lecture.id === updated.id ? updated : lecture)); await saveLecture(updated); }
  async function toggleCurrentSlideMark() { if (!viewerLecture) return; const current = viewerLecture.markedSlides ?? []; const markedSlides = current.includes(selectedPage) ? current.filter((page) => page !== selectedPage) : [...current, selectedPage].sort((a, b) => a - b); const updated = { ...viewerLecture, markedSlides }; setLectures((items) => items.map((lecture) => lecture.id === updated.id ? updated : lecture)); await saveLecture(updated); }
  async function removeCurrentLecture() { if (!viewerLecture || !window.confirm(`Remove “${viewerLecture.title}” and its stored PDF?`)) return; await deleteLecture(viewerLecture.id); setLectures((current) => current.filter((lecture) => lecture.id !== viewerLecture.id)); setViewerLectureId(""); setNotice("Lecture removed."); }

  async function submitCloudAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || authBusy) return; setAuthBusy(true); setAuthMessage("");
    try { if (authMode === "signin") { const { error } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword }); if (error) throw error; } else { const { data, error } = await supabase.auth.signUp({ email: authEmail.trim(), password: authPassword, options: { emailRedirectTo: window.location.origin } }); if (error) throw error; if (!data.session) setAuthMessage("Account created. Check your email to confirm it, then sign in."); } }
    catch (error) { setAuthMessage(error instanceof Error ? error.message : "Could not sign in."); } finally { setAuthBusy(false); }
  }
  async function migrateThisDevice() { if (migrationRunning) return; setMigrationRunning(true); setMigrationProgress(null); try { const result = await migrateLocalLibraryToCloud(setMigrationProgress); setLectures(result.library.lectures); setCloudHasData(true); setNotice(`Cloud migration complete: ${result.counts.lectures} lectures.`); } catch (error) { setNotice(`Migration stopped: ${readableError(error)} Your local library is unchanged.`); } finally { setMigrationRunning(false); } }
  async function signOutCloud() { await supabase?.auth.signOut(); setCloudSession(null); setCloudUser(null); setCloudHasData(false); }

  const exportableLectures = lectures.filter((lecture) => lecture.slos.length > 0);
  const selectedExportCount = exportableLectures.filter((lecture) => selectedExportLectureIds.has(lecture.id)).length;
  const viewerMarkedSlides = viewerLecture?.markedSlides ?? [];
  const activeTocPage = viewerLecture?.toc.reduce((active, item) => item.page <= selectedPage ? item.page : active, viewerLecture.toc[0]?.page ?? 0) ?? 0;
  const currentSlideIsMarked = viewerMarkedSlides.includes(selectedPage);
  const viewerPageInk = viewerLecture?.markups?.[selectedPage] ?? [];

  if (cloudConfigured && (!authReady || (cloudSession && !cloudReady))) return <main className="cloud-gate"><section className="cloud-auth-card"><strong className="cloud-wordmark">FCOM.lib</strong><div className="cloud-loading" role="status">Opening your library…</div></section></main>;
  if (cloudConfigured && !cloudSession) return <main className="cloud-gate"><section className="cloud-auth-card"><strong className="cloud-wordmark">FCOM.lib</strong><div className="cloud-auth-heading"><small>PRIVATE CURRICULUM LIBRARY</small><h1>{authMode === "signin" ? "Sign in" : "Create your account"}</h1><p>Your lectures, annotations, and SLOs stay private to your account.</p></div><form onSubmit={submitCloudAuth}><label><span>Email</span><input type="email" autoComplete="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} required /></label><label><span>Password</span><input type="password" minLength={6} autoComplete={authMode === "signin" ? "current-password" : "new-password"} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} required /></label>{authMessage && <p className="cloud-auth-message" role="status">{authMessage}</p>}<button className="cloud-auth-submit" type="submit" disabled={authBusy}>{authBusy ? "Working…" : authMode === "signin" ? "Sign in" : "Create account"}</button></form><button className="cloud-auth-switch" type="button" onClick={() => { setAuthMode((current) => current === "signin" ? "signup" : "signin"); setAuthMessage(""); }}>{authMode === "signin" ? "New to FCOM.lib? Create an account" : "Already have an account? Sign in"}</button></section></main>;

  return <main className="shell simplified-shell"><section className="workspace">
    <header className="topbar simplified-topbar"><button className="topbar-wordmark" onClick={() => setView("lectures")}>FCOM.lib</button><nav className="workspace-nav" aria-label="Primary navigation"><button className={view === "lectures" ? "active" : ""} onClick={() => setView("lectures")}>Lectures</button><button className={view === "slos" ? "active" : ""} onClick={() => setView("slos")}>SLOs</button></nav><label className="global-search"><AppIcon name="search"/><input aria-label="Search the curriculum" value={query} onChange={(event) => { setQuery(event.target.value); if (event.target.value) setView("search"); }}/></label><button className="upload-button" onClick={() => { setUploadReviewOpen(true); if (!uploadQueue.length) fileInput.current?.click(); }}><AppIcon name="upload"/>Add lectures</button><input ref={fileInput} type="file" accept="application/pdf" multiple hidden onChange={(event) => { if (event.target.files?.length) enqueueFiles(event.target.files); event.target.value = ""; }}/><div className="topbar-account"><span>{cloudSession?.user.email}</span><button disabled={migrationRunning} onClick={() => void migrateThisDevice()}>{migrationRunning ? "Syncing…" : "Sync"}</button><button onClick={downloadDiagnostics}>Diagnostics</button><button onClick={() => void signOutCloud()}>Sign out</button></div></header>
    {notice && <div className="notice" role="status" aria-live="polite"><span>{notice}</span><button aria-label="Dismiss" onClick={() => setNotice("")}><AppIcon name="x"/></button></div>}
    {cloudSession && !cloudHasData && localReady && <section className="cloud-migration-banner"><div><small>ONE-TIME CLOUD SETUP</small><strong>Move this device’s lectures into your private account</strong><p>This copies lecture PDFs, SLOs, notes, and marks. The originals remain on this computer.</p>{migrationProgress && <span>{migrationProgress.completed} of {migrationProgress.total}: {migrationProgress.label}</span>}</div><button disabled={migrationRunning} onClick={() => void migrateThisDevice()}>{migrationRunning ? "Migrating…" : "Migrate this device"}</button></section>}
    {uploadReviewOpen && <LectureImportReview jobs={uploadQueue} courses={searchCourseOptions} instructors={lecturerOptions} finalizing={uploadFinalizing} onUpdate={updateImportDraft} onRemove={removeImportJob} onAddMore={() => fileInput.current?.click()} onClose={() => setUploadReviewOpen(false)} onFinalize={() => void finalizeImports()}/>}
    {view === "lectures" && <section className="full-page home-page visual-home-page"><LectureGallery lectures={lectures} onOpen={(lecture) => openLecture(lecture)}/></section>}
    {view === "search" && <section className="full-page search-page"><div className="eyebrow">CURRICULUM SEARCH</div><div className="search-mode-switch"><button className={searchMode === "catalog" ? "active" : ""} onClick={() => setSearchMode("catalog")}><strong>Lectures &amp; SLOs</strong><span>Titles, summaries, and objectives</span></button><button className={searchMode === "slides" ? "active" : ""} onClick={() => setSearchMode("slides")}><strong>Source text</strong><span>Exact words inside lecture slides</span></button></div><div className="search-controls"><label><span>Academic year</span><select value={searchYear} onChange={(event) => setSearchYear(event.target.value)}><option value="all">All years</option>{academicYears.map((year) => <option key={year}>{year}</option>)}</select></label><label><span>Course</span><select value={searchCourse} onChange={(event) => setSearchCourse(event.target.value)}><option value="all">All courses</option>{searchCourseOptions.map((course) => <option key={course}>{course}</option>)}</select></label><label><span>Lecturer</span><select value={searchLecturer} onChange={(event) => setSearchLecturer(event.target.value)}><option value="all">All lecturers</option>{lecturerOptions.map((lecturer) => <option key={lecturer}>{lecturer}</option>)}</select></label><label><span>Sort by</span><select value={searchSort} onChange={(event) => setSearchSort(event.target.value as typeof searchSort)}><option value="relevance">Relevance</option><option value="week-asc">Week</option><option value="name-asc">Name</option></select></label></div>{(["lecture", "slo", "slide"] as const).map((kind) => groupedResults[kind].length > 0 && <section className="result-group" key={kind}><h2>{kind === "lecture" ? "Lectures" : kind === "slo" ? "SLOs" : "Slides"}</h2>{groupedResults[kind].map((result, index) => <button className="search-result" key={`${result.lecture.id}-${kind}-${index}`} onClick={() => openSearchResult(result)}><span className="result-page">{result.kind === "slide" ? result.page : result.kind === "slo" ? (result.sloIndex ?? 0) + 1 : "→"}</span><div><h3>{result.title}</h3><p>{result.text}</p><small>{result.lecture.title} · {result.lecture.course} · {lectureWeekLabel(result.lecture.week)}</small></div></button>)}</section>)}{query && !results.length && <div className="empty-state"><strong>No matches</strong><span>Try another word or switch search sources.</span></div>}</section>}
    {view === "slos" && <section className="full-page slo-page slo-live-page"><SloWorkspace lectures={visibleSloLectures} studyObjectives={selectedStudyObjectives} courses={searchCourseOptions} instructors={lecturerOptions} courseFilter={sloCourseFilter} weekFilter={sloWeekFilter} instructorFilter={sloInstructorFilter} viewFilter={sloViewFilter} onCourseFilter={setSloCourseFilter} onWeekFilter={setSloWeekFilter} onInstructorFilter={setSloInstructorFilter} onViewFilter={setSloViewFilter} onExport={openSloExport} onTogglePriority={(lectureId, index) => void toggleSloFlag(lectureId, index)} onStrengthChange={(lectureId, index, strength) => void setSloStrength(lectureId, index, strength)} onSetStudySelection={(items, selected) => void setStudySloSelection(items, selected)} onReparse={openSloReparse} onOpenLecture={openLecture}/></section>}
    {sloReparseLecture && <div className="export-backdrop"><section className="slo-reparse-modal"><header><div><small>LUNA RE-PARSE</small><h2>{sloReparseLecture.title}</h2></div><button className="icon-button" onClick={() => setSloReparseLectureId("")}><AppIcon name="x"/></button></header>{!sloReparseProposal ? <div className="reparse-request"><p>Luna will propose a corrected objective list. Nothing changes until you approve it.</p><label><span>Optional note for Luna</span><textarea value={sloReparseInstruction} onChange={(event) => setSloReparseInstruction(event.target.value)} /></label></div> : <div className="reparse-proposal"><ol>{sloReparseProposal.map((slo, index) => <li key={index}><span>{index + 1}</span><textarea value={slo} onChange={(event) => setSloReparseProposal((current) => current?.map((item, itemIndex) => itemIndex === index ? event.target.value : item) ?? null)}/><button onClick={() => setSloReparseProposal((current) => current?.filter((_, itemIndex) => itemIndex !== index) ?? null)}><AppIcon name="trash"/></button></li>)}</ol></div>}<footer>{sloReparseProposal ? <><button onClick={() => setSloReparseProposal(null)}>Back</button><button className="reparse-confirm" onClick={() => void acceptSloReparse()}>Replace SLOs</button></> : <><button onClick={() => setSloReparseLectureId("")}>Cancel</button><button className="reparse-confirm" disabled={sloReparseLoading} onClick={() => void runSloReparse()}>{sloReparseLoading ? "Luna is reviewing…" : "Re-parse SLOs"}</button></>}</footer></section></div>}
    {sloExportOpen && <div className="export-backdrop"><section className="slo-export-modal"><header><div><small>SLO EXPORT</small><h2>Choose lectures</h2></div><button className="icon-button" onClick={() => setSloExportOpen(false)}><AppIcon name="x"/></button></header><div className="export-selection-toolbar"><span><strong>{selectedExportCount}</strong> of {exportableLectures.length} selected</span><div><button onClick={() => setExportLectureSelection(exportableLectures.map((lecture) => lecture.id), true)}>Select all</button><button onClick={() => setSelectedExportLectureIds(new Set())}>Clear</button></div></div><div className="export-options"><label className="export-sort-option"><span>File format</span><select value={sloExportFormat} onChange={(event) => setSloExportFormat(event.target.value as typeof sloExportFormat)}><option value="pdf">PDF</option><option value="excel">Excel</option></select></label><label className="export-sort-option"><span>Order by</span><select value={sloExportSort} onChange={(event) => setSloExportSort(event.target.value as typeof sloExportSort)}><option value="week">Week</option><option value="lecturer">Lecturer</option></select></label>{sloExportFormat === "pdf" && <label aria-label="Include progress tracker" className="export-progress-option"><input type="checkbox" checked={includeProgressTracker} onChange={(event) => setIncludeProgressTracker(event.target.checked)}/><span><strong>Include progress tracker</strong><small>Strong / O.K. / Weak boxes</small></span></label>}</div><div className="export-tree">{academicYears.map((year) => <section className="export-year" key={year}><strong>{year}</strong>{(coursesByYear[year] ?? []).map((course) => <section className="export-course" key={course}><strong>{course}</strong>{exportableLectures.filter((lecture) => lecture.academicYear === year && lecture.course === course).map((lecture) => <label aria-label={`Select ${lecture.title}`} className="export-lecture" key={lecture.id}><input type="checkbox" checked={selectedExportLectureIds.has(lecture.id)} onChange={(event) => setExportLectureSelection([lecture.id], event.target.checked)}/><span><strong>{lecture.title}</strong><small>{lecturerFolderLabel(lecture.lecturer)} · {lectureWeekLabel(lecture.week)}</small></span></label>)}</section>)}</section>)}</div><footer><button onClick={() => setSloExportOpen(false)}>Cancel</button><button className="convert-confirm" disabled={!selectedExportCount} onClick={exportSelectedSlos}>Export</button></footer></section></div>}
    {viewerLecture && <div className="viewer-modal viewer-pdf-workspace viewer-canvas-controls" role="dialog" aria-modal="true" aria-label={viewerLecture.title}>
      <section className="viewer-stage">
        <div className="viewer-canvas-title"><strong>{viewerLecture.title}</strong><small>PDF page {selectedPage} of {viewerLecture.pages}</small></div>
        <div className="viewer-canvas-navigation"><button aria-label="Previous page" disabled={selectedPage <= 1} onClick={() => selectViewerPage(selectedPage - 1)}>←</button><span><b>{selectedPage}</b> / {viewerLecture.pages}</span><button aria-label="Next page" disabled={selectedPage >= viewerLecture.pages} onClick={() => selectViewerPage(selectedPage + 1)}>→</button></div>
        <div className="viewer-canvas-actions"><div className="viewer-zoom"><button aria-label="Zoom out" disabled={pdfZoom <= .6} onClick={() => setPdfZoom((current) => Math.max(.6, Number((current - .1).toFixed(1))))}>−</button><button onClick={() => setPdfZoom(1)}>Fit {Math.round(pdfZoom * 100)}%</button><button aria-label="Zoom in" disabled={pdfZoom >= 2.5} onClick={() => setPdfZoom((current) => Math.min(2.5, Number((current + .1).toFixed(1))))}>+</button></div><button className={tocOpen ? "active" : ""} onClick={() => setTocOpen((current) => !current)}>Contents</button><button className={penEnabled ? "active" : ""} onClick={() => setPenEnabled((current) => !current)}>Pen</button>{viewerPageInk.length > 0 && <button onClick={() => void saveCurrentInk(viewerPageInk.slice(0, -1))}>Undo</button>}<button className={currentSlideIsMarked ? "active" : ""} onClick={() => void toggleCurrentSlideMark()}>{currentSlideIsMarked ? "Marked" : "Mark"}</button><button className="viewer-delete-lecture" onClick={() => void removeCurrentLecture()}>Delete</button><button onClick={() => setViewerLectureId("")}>Close</button></div>
        {tocOpen && <aside className="viewer-toc">
          <header><div><small>CONTENTS</small><h2>{viewerLecture.title}</h2></div><button aria-label="Close contents" onClick={() => setTocOpen(false)}>×</button></header>
          <nav>{tocLoading && <p>Building contents with Luna…</p>}{tocError && <div className="viewer-toc-error"><p>{tocError}</p><button onClick={() => void generateLectureToc(viewerLecture)}>Try again</button></div>}{!tocLoading && !tocError && viewerLecture.toc.map((item) => <button className={item.page === activeTocPage ? "active" : ""} key={`${item.page}-${item.title}`} onClick={() => { selectViewerPage(item.page); setTocOpen(false); }}><span>{item.page}</span><strong>{item.title}</strong></button>)}</nav>
          <footer>{viewerMarkedSlides.length > 0 && <section><small>MARKED SLIDES</small><div>{viewerMarkedSlides.map((page) => <button key={page} onClick={() => { selectViewerPage(page); setTocOpen(false); }}>{page}</button>)}</div></section>}<button disabled={tocLoading} onClick={() => void generateLectureToc(viewerLecture)}>{tocLoading ? "Working…" : "Rebuild"}</button></footer>
        </aside>}
        <div className="viewer-slide-workspace">{viewerFile && viewerFileLectureId === viewerLecture.id ? <PdfCanvasViewer file={viewerFile} lectureId={viewerLecture.id} page={selectedPage} zoom={pdfZoom} inkStrokes={viewerPageInk} penEnabled={penEnabled} onInkChange={saveCurrentInk}/> : <div className="slide-fallback"><h2>{selectedSlide.heading}</h2><p>{selectedSlide.text || "Loading the selected lecture…"}</p></div>}</div>
      </section>
    </div>}
  </section></main>;
}
