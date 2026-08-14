"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { deleteLecture, deletePreRead, getLectureFile, getPreReadFile, loadCloudLibrary, loadLectures, loadPreReads, migrateLocalLibraryToCloud, normalizeLecture, saveLecture, saveLectures, savePreRead, setCloudUser, type InkStroke, type Lecture, type MigrationProgress, type PreRead, type PreReadStatus, type QuestionRecord, type QuestionType, type Slide } from "../lib/lecture-store";
import { downloadSloExcel } from "../lib/slo-excel";
import { downloadSloPdf } from "../lib/slo-pdf";
import { cloudConfigured, supabase, type CloudSession } from "../lib/supabase-client";
import { clearUploadDiagnosticCheckpoint, downloadDiagnostics, recordDiagnostic, setUploadDiagnosticCheckpoint } from "../lib/diagnostics";
import { ALL_LECTURERS, LECTURE_WEEK_OPTIONS, NEW_LECTURER, compareLectureWeeks, compareText, lectureWeekLabel, lecturerFolderLabel } from "../lib/curriculum";
import { searchMatchScore, searchResultCollectionTitle, searchResultWeek, type LectureSearchResult, type PreReadSearchResult, type SearchKind, type SearchResult } from "../lib/curriculum-search";
import { shuffleItems, type QuestionDraft, type QuizMode, type QuizQuestion, type QuizResponse } from "../lib/questions";
import { seedLectures } from "../lib/seed-lectures";
import { AppIcon } from "./components/AppIcon";
import { CurriculumTree } from "./components/CurriculumTree";
import { PdfCanvasViewer } from "./components/PdfCanvasViewer";

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

function mergeAiLectureBrief(base: Lecture, response: unknown, sourceSlides: Slide[], destination: ImportDestination) {
  const brief = response && typeof response === "object" && !Array.isArray(response) ? response as Record<string, unknown> : {};
  const accepted: Record<string, unknown> = {};
  const rejectedFields: string[] = [];
  const stringFields = ["title", "lecturer", "course", "summary"] as const;
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
    academicYear: destination.academicYear,
    course: destination.course ?? accepted.course ?? base.course,
    lecturer: destination.lecturer ?? accepted.lecturer ?? base.lecturer,
    favorite: false,
  });
  return { lecture: normalized ?? base, rejectedFields };
}

type UploadStatus = "queued" | "extracting" | "analyzing" | "saving" | "done" | "error";
type ImportDestination = { academicYear: string; course: string | null; lecturer: string | null; label: string };
type UploadJob = { id: string; name: string; destinationLabel: string; status: UploadStatus; error?: string };
type PendingUpload = { id: string; file: File; destination: ImportDestination };
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

function aiEndpoint(action: "analyze" | "chat" | "reparse-slos" | "generate-questions") {
  return `/.netlify/functions/${action}`;
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

export default function Home() {
  const [lectures, setLectures] = useState<Lecture[]>(seedLectures);
  const [preReads, setPreReads] = useState<PreRead[]>([]);
  const [activeId, setActiveId] = useState(seedLectures[0].id);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"home" | "library" | "favorites" | "search" | "slos" | "prereads" | "questions">("home");
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
  const [sloWeekFilter, setSloWeekFilter] = useState("all");
  const [sloSort, setSloSort] = useState<"week-asc" | "name-asc">("week-asc");
  const [expandedSloLectureIds, setExpandedSloLectureIds] = useState<Set<string>>(new Set());
  const [questionTreeExpanded, setQuestionTreeExpanded] = useState(false);
  const [expandedQuestionYear, setExpandedQuestionYear] = useState<string | null>(currentAcademicYear());
  const [expandedQuestionCourse, setExpandedQuestionCourse] = useState<string | null>(null);
  const [activeQuestionYear, setActiveQuestionYear] = useState(currentAcademicYear());
  const [activeQuestionCourse, setActiveQuestionCourse] = useState("All courses");
  const [activeQuestionLecturer, setActiveQuestionLecturer] = useState(ALL_LECTURERS);
  const [allQuestionsSelected, setAllQuestionsSelected] = useState(true);
  const [questionWeekFilter, setQuestionWeekFilter] = useState("all");
  const [questionSort, setQuestionSort] = useState<"week-asc" | "name-asc">("week-asc");
  const [questionBuilderOpen, setQuestionBuilderOpen] = useState(false);
  const [selectedQuestionLectureIds, setSelectedQuestionLectureIds] = useState<Set<string>>(new Set());
  const [selectedQuestionSlideKeys, setSelectedQuestionSlideKeys] = useState<Set<string>>(new Set());
  const [expandedQuestionSourceIds, setExpandedQuestionSourceIds] = useState<Set<string>>(new Set());
  const [questionCount, setQuestionCount] = useState(6);
  const [questionInstruction, setQuestionInstruction] = useState("");
  const [questionDrafts, setQuestionDrafts] = useState<QuestionDraft[] | null>(null);
  const [questionGenerating, setQuestionGenerating] = useState(false);
  const [revealedQuestionIds, setRevealedQuestionIds] = useState<Set<string>>(new Set());
  const [expandedQuestionBankLectureIds, setExpandedQuestionBankLectureIds] = useState<Set<string>>(new Set());
  const [quizBuilderOpen, setQuizBuilderOpen] = useState(false);
  const [selectedQuizLectureIds, setSelectedQuizLectureIds] = useState<Set<string>>(new Set());
  const [quizQuestionCount, setQuizQuestionCount] = useState(10);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizResponses, setQuizResponses] = useState<Record<string, QuizResponse>>({});
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizMode, setQuizMode] = useState<QuizMode>("taking");
  const [quizReviewIndex, setQuizReviewIndex] = useState(0);
  const [sloExportOpen, setSloExportOpen] = useState(false);
  const [selectedExportLectureIds, setSelectedExportLectureIds] = useState<Set<string>>(new Set());
  const [sloExportFormat, setSloExportFormat] = useState<"pdf" | "excel">("pdf");
  const [sloExportSort, setSloExportSort] = useState<"week" | "lecturer">("week");
  const [includeProgressTracker, setIncludeProgressTracker] = useState(false);
  const [sloReparseLectureId, setSloReparseLectureId] = useState("");
  const [sloReparseInstruction, setSloReparseInstruction] = useState("");
  const [sloReparseProposal, setSloReparseProposal] = useState<string[] | null>(null);
  const [sloReparseLoading, setSloReparseLoading] = useState(false);
  const [searchMode, setSearchMode] = useState<"catalog" | "slides">("catalog");
  const [searchYear, setSearchYear] = useState("all");
  const [searchCourse, setSearchCourse] = useState("all");
  const [searchLecturer, setSearchLecturer] = useState("all");
  const [searchSort, setSearchSort] = useState<"relevance" | "week-asc" | "name-asc">("relevance");
  const [lectureWeekFilter, setLectureWeekFilter] = useState("all");
  const [lectureSort, setLectureSort] = useState<"week-asc" | "name-asc">("week-asc");
  const [uploading, setUploading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadJob[]>([]);
  const [queueVisible, setQueueVisible] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState("");
  const [viewerLectureId, setViewerLectureId] = useState("");
  const [selectedPage, setSelectedPage] = useState(1);
  const [viewerFile, setViewerFile] = useState<Blob | null>(null);
  const [viewerFileLectureId, setViewerFileLectureId] = useState("");
  const [chatMessages, setChatMessages] = useState<LunaChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [penEnabled, setPenEnabled] = useState(false);
  const [editingMetadataId, setEditingMetadataId] = useState("");
  const [courseDraft, setCourseDraft] = useState("");
  const [lecturerChoice, setLecturerChoice] = useState(NEW_LECTURER);
  const [newLecturerDraft, setNewLecturerDraft] = useState("");
  const [weekDraft, setWeekDraft] = useState("");
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
        const [saved, savedPreReads] = await Promise.all([loadLectures(), loadPreReads()]);
        setPreReads(savedPreReads);
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
        const total = library.lectures.length + library.preReads.length;
        setCloudHasData(total > 0);
        if (!total) return;
        setLectures(library.lectures);
        setPreReads(library.preReads);
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
    const weekFiltered = filtered.filter((lecture) => lectureWeekFilter === "all"
      || (lectureWeekFilter === "unassigned" ? lecture.week === null : lecture.week === Number(lectureWeekFilter)));
    return [...weekFiltered].sort((a, b) => lectureSort === "name-asc"
      ? compareText(a.title, b.title)
      : compareLectureWeeks(a.week, b.week) || compareText(a.title, b.title));
  }, [lectures, view, allLecturesSelected, activeYear, activeCourse, activeLecturer, lectureWeekFilter, lectureSort]);
  const displayActive = visibleLectures.find((lecture) => lecture.id === activeId) ?? visibleLectures[0];
  const visibleSloLectures = useMemo(() => {
    const folderLectures = allSLOsSelected
      ? lectures
      : lectures.filter((lecture) => lecture.academicYear === activeSloYear
        && (activeSloCourse === "All courses" || lecture.course === activeSloCourse)
        && (activeSloLecturer === ALL_LECTURERS || lecture.lecturer === activeSloLecturer));
    const filtered = folderLectures.filter((lecture) => flaggedSLOsSelected
      ? lecture.flaggedSLOs.length > 0
      : sloWeekFilter === "all" || (sloWeekFilter === "unassigned" ? lecture.week === null : lecture.week === Number(sloWeekFilter)));
    return filtered
      .filter((lecture) => lecture.slos.length > 0)
      .sort((a, b) => sloSort === "name-asc" ? compareText(a.title, b.title) : compareLectureWeeks(a.week, b.week) || compareText(a.title, b.title));
  }, [lectures, flaggedSLOsSelected, sloWeekFilter, sloSort, allSLOsSelected, activeSloYear, activeSloCourse, activeSloLecturer]);
  const questionLectures = useMemo(() => lectures.filter((lecture) => lecture.questions.length > 0), [lectures]);
  const questionAcademicYears = useMemo(() => Array.from(new Set(questionLectures.map((lecture) => lecture.academicYear))).sort().reverse(), [questionLectures]);
  const questionCoursesByYear = useMemo(() => questionAcademicYears.reduce<Record<string, string[]>>((folders, year) => {
    folders[year] = Array.from(new Set(questionLectures.filter((lecture) => lecture.academicYear === year).map((lecture) => lecture.course))).sort(compareText);
    return folders;
  }, {}), [questionAcademicYears, questionLectures]);
  const visibleQuestionLectures = useMemo(() => {
    const folderLectures = allQuestionsSelected
      ? questionLectures
      : questionLectures.filter((lecture) => lecture.academicYear === activeQuestionYear
        && (activeQuestionCourse === "All courses" || lecture.course === activeQuestionCourse)
        && (activeQuestionLecturer === ALL_LECTURERS || lecture.lecturer === activeQuestionLecturer));
    const filtered = folderLectures.filter((lecture) => questionWeekFilter === "all"
      || (questionWeekFilter === "unassigned" ? lecture.week === null : lecture.week === Number(questionWeekFilter)));
    return [...filtered].sort((a, b) => questionSort === "name-asc" ? compareText(a.title, b.title) : compareLectureWeeks(a.week, b.week) || compareText(a.title, b.title));
  }, [questionLectures, allQuestionsSelected, activeQuestionYear, activeQuestionCourse, activeQuestionLecturer, questionWeekFilter, questionSort]);
  const homeFlaggedLectures = useMemo(() => lectures
    .filter((lecture) => lecture.flaggedSLOs.some((index) => Boolean(lecture.slos[index])))
    .sort((a, b) => compareLectureWeeks(a.week, b.week) || compareText(a.title, b.title)), [lectures]);
  const visiblePreReads = useMemo(() => preReads
    .filter((preRead) => preReadFilter === "all" || preRead.status === preReadFilter)
    .sort((a, b) => compareText(b.createdAt, a.createdAt) || compareText(a.title, b.title)), [preReads, preReadFilter]);
  const previewPreRead = preReads.find((preRead) => preRead.id === previewPreReadId);
  const viewerFlaggedSLOs = viewerLecture?.flaggedSLOs.map((index) => viewerLecture.slos[index]).filter(Boolean) ?? [];

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
    if (!questionBuilderOpen) return;
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !questionGenerating) setQuestionBuilderOpen(false); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [questionBuilderOpen, questionGenerating]);
  useEffect(() => {
    if (!quizBuilderOpen) return;
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") setQuizBuilderOpen(false); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [quizBuilderOpen]);
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
    return matches.sort((a, b) => searchSort === "week-asc"
      ? searchResultWeek(a) - searchResultWeek(b) || b.score - a.score
      : searchSort === "name-asc"
        ? compareText(searchResultCollectionTitle(a), searchResultCollectionTitle(b)) || compareText(a.title, b.title)
        : b.score - a.score || searchResultWeek(a) - searchResultWeek(b));
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

  function questionSlideKey(lectureId: string, page: number) {
    return `${lectureId}::${page}`;
  }

  function openQuestionBuilder(lectureId?: string, page?: number) {
    const lectureIds = new Set<string>();
    const slideKeys = new Set<string>();
    const expandedIds = new Set<string>();
    if (lectureId) {
      expandedIds.add(lectureId);
      if (page) slideKeys.add(questionSlideKey(lectureId, page));
      else lectureIds.add(lectureId);
    }
    setSelectedQuestionLectureIds(lectureIds);
    setSelectedQuestionSlideKeys(slideKeys);
    setExpandedQuestionSourceIds(expandedIds);
    setQuestionDrafts(null);
    setQuestionInstruction("");
    setQuestionBuilderOpen(true);
  }

  function setQuestionLectureSelection(ids: string[], selected: boolean) {
    setSelectedQuestionLectureIds((current) => {
      const next = new Set(current);
      ids.forEach((id) => selected ? next.add(id) : next.delete(id));
      return next;
    });
    if (selected) setSelectedQuestionSlideKeys((current) => new Set([...current].filter((key) => !ids.some((id) => key.startsWith(`${id}::`)))));
  }

  function toggleQuestionSlide(lectureId: string, page: number, selected: boolean) {
    setSelectedQuestionLectureIds((current) => {
      const next = new Set(current);
      next.delete(lectureId);
      return next;
    });
    setSelectedQuestionSlideKeys((current) => {
      const next = new Set(current);
      const key = questionSlideKey(lectureId, page);
      if (selected) next.add(key); else next.delete(key);
      return next;
    });
  }

  function selectedQuestionSources() {
    const selected = lectures.flatMap((lecture) => {
      const wholeLecture = selectedQuestionLectureIds.has(lecture.id);
      const slides = wholeLecture
        ? lecture.slides
        : lecture.slides.filter((slide) => selectedQuestionSlideKeys.has(questionSlideKey(lecture.id, slide.page)));
      if (!slides.length) return [];
      return [{ lectureId: lecture.id, title: lecture.title, slos: lecture.slos, slides }];
    });
    const perLectureCharacterBudget = Math.max(500, Math.floor(80_000 / Math.max(1, selected.length)));
    return selected.map((source) => {
      let remaining = perLectureCharacterBudget;
      const slides = source.slides.flatMap((slide) => {
        if (remaining <= 0) return [];
        const text = slide.text.slice(0, remaining);
        remaining -= text.length;
        return [{ ...slide, text }];
      });
      return { ...source, slides };
    });
  }

  async function generateQuestionDrafts() {
    const sources = selectedQuestionSources();
    if (!sources.length) { setNotice("Select at least one lecture or slide."); return; }
    setQuestionGenerating(true);
    try {
      const response = await fetch(aiEndpoint("generate-questions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources, count: questionCount, instruction: questionInstruction.trim().slice(0, 2000) }),
      });
      const data = await response.json() as { questions?: unknown; error?: string; detail?: string };
      if (!response.ok) throw new Error(data.error || data.detail || "Luna could not draft questions.");
      const sourcePages = new Map(sources.map((source) => [source.lectureId, new Set(source.slides.map((slide) => slide.page))]));
      const drafts = Array.isArray(data.questions) ? data.questions.flatMap((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return [];
        const record = value as Record<string, unknown>;
        const sourceLectureId = typeof record.sourceLectureId === "string" && sourcePages.has(record.sourceLectureId) ? record.sourceLectureId : "";
        const prompt = typeof record.prompt === "string" ? record.prompt.trim() : "";
        const answer = typeof record.answer === "string" ? record.answer.trim() : "";
        if (!sourceLectureId || !prompt || !answer) return [];
        const options = Array.isArray(record.options)
          ? record.options.filter((option): option is string => typeof option === "string" && Boolean(option.trim())).map((option) => option.trim()).slice(0, 6)
          : [];
        if (record.type !== "multiple-choice" || options.length !== 4 || !options.includes(answer)) return [];
        const allowedPages = sourcePages.get(sourceLectureId) ?? new Set<number>();
        const pages = Array.isArray(record.sourcePages)
          ? Array.from(new Set(record.sourcePages.filter((page): page is number => typeof page === "number" && allowedPages.has(page)))).sort((a, b) => a - b)
          : [];
        const fallbackPage = allowedPages.values().next().value as number | undefined;
        return [{
          id: crypto.randomUUID(),
          sourceLectureId,
          type: "multiple-choice" as QuestionType,
          prompt,
          options,
          answer,
          explanation: typeof record.explanation === "string" ? record.explanation.trim() : "",
          sourcePages: pages.length ? pages : fallbackPage ? [fallbackPage] : [],
          approved: true,
        }];
      }) : [];
      if (!drafts.length) throw new Error("Luna did not return any usable questions.");
      setQuestionDrafts(drafts);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Luna could not draft questions.");
    } finally {
      setQuestionGenerating(false);
    }
  }

  function updateQuestionDraft(id: string, changes: Partial<QuestionDraft>) {
    setQuestionDrafts((current) => current?.map((draft) => draft.id === id ? { ...draft, ...changes } : draft) ?? null);
  }

  async function approveQuestionDrafts() {
    const approved = (questionDrafts ?? []).filter((draft) => draft.approved && draft.prompt.trim() && draft.answer.trim());
    if (!approved.length) { setNotice("Approve at least one complete question."); return; }
    const now = new Date().toISOString();
    const changed: Lecture[] = [];
    const nextLectures = lectures.map((lecture) => {
      const additions = approved.filter((draft) => draft.sourceLectureId === lecture.id).map<QuestionRecord>((draft) => ({
        id: crypto.randomUUID(),
        type: "multiple-choice",
        prompt: draft.prompt.trim(),
        options: draft.options.map((option) => option.trim()).filter(Boolean),
        answer: draft.answer.trim(),
        explanation: draft.explanation.trim(),
        sourcePages: draft.sourcePages,
        createdAt: now,
      }));
      if (!additions.length) return lecture;
      const updated = { ...lecture, questions: [...lecture.questions, ...additions] };
      changed.push(updated);
      return updated;
    });
    setLectures(nextLectures);
    await Promise.all(changed.map((lecture) => saveLecture(lecture)));
    setQuestionBuilderOpen(false);
    setQuestionDrafts(null);
    setAllQuestionsSelected(true);
    setQuestionTreeExpanded(true);
    setView("questions");
    setNotice(`Added ${approved.length} approved question${approved.length === 1 ? "" : "s"} to the question bank.`);
  }

  async function removeQuestion(lectureId: string, questionId: string) {
    const lecture = lectures.find((item) => item.id === lectureId);
    if (!lecture || !window.confirm("Remove this question from the question bank?")) return;
    const updated = { ...lecture, questions: lecture.questions.filter((question) => question.id !== questionId) };
    setLectures((current) => current.map((item) => item.id === lectureId ? updated : item));
    await saveLecture(updated);
    setNotice("Question removed.");
  }

  function openQuizBuilder() {
    const defaults = visibleQuestionLectures.length ? visibleQuestionLectures : questionLectures;
    const ids = new Set(defaults.map((lecture) => lecture.id));
    const available = defaults.reduce((total, lecture) => total + lecture.questions.length, 0);
    setSelectedQuizLectureIds(ids);
    setQuizQuestionCount(Math.min(10, Math.max(1, available)));
    setQuizBuilderOpen(true);
  }

  function setQuizLectureSelection(ids: string[], selected: boolean) {
    setSelectedQuizLectureIds((current) => {
      const next = new Set(current);
      ids.forEach((id) => selected ? next.add(id) : next.delete(id));
      return next;
    });
  }

  function startQuiz() {
    const pool = questionLectures
      .filter((lecture) => selectedQuizLectureIds.has(lecture.id))
      .flatMap((lecture) => lecture.questions.map<QuizQuestion>((question) => ({
        key: `${lecture.id}::${question.id}`,
        lectureId: lecture.id,
        lectureTitle: lecture.title,
        lecturer: lecture.lecturer,
        question: {
          ...question,
          options: question.type === "multiple-choice" ? shuffleItems(question.options) : [],
        },
      })));
    if (!pool.length) { setNotice("Select at least one lecture with approved questions."); return; }
    const count = Math.min(100, Math.max(1, quizQuestionCount), pool.length);
    setQuizQuestions(shuffleItems(pool).slice(0, count));
    setQuizResponses({});
    setQuizIndex(0);
    setQuizMode("taking");
    setQuizReviewIndex(0);
    setQuizBuilderOpen(false);
  }

  function setCurrentQuizResponse(response: string) {
    const current = quizQuestions[quizIndex];
    if (!current || quizResponses[current.key]?.submitted) return;
    setQuizResponses((responses) => ({
      ...responses,
      [current.key]: { response, submitted: false, correct: null },
    }));
  }

  function submitQuizAnswer() {
    const current = quizQuestions[quizIndex];
    if (!current) return;
    const response = quizResponses[current.key]?.response.trim() ?? "";
    if (!response) return;
    const correct = current.question.type === "multiple-choice" ? response === current.question.answer : null;
    setQuizResponses((responses) => ({
      ...responses,
      [current.key]: { response, submitted: true, correct },
    }));
  }

  function gradeShortAnswer(correct: boolean) {
    const current = quizQuestions[quizIndex];
    const response = current ? quizResponses[current.key] : undefined;
    if (!current || current.question.type !== "short-answer" || !response?.submitted) return;
    setQuizResponses((responses) => ({ ...responses, [current.key]: { ...response, correct } }));
  }

  function advanceQuiz() {
    if (quizIndex >= quizQuestions.length - 1) setQuizMode("results");
    else setQuizIndex((index) => index + 1);
  }

  function finishQuiz() {
    setQuizQuestions([]);
    setQuizResponses({});
    setQuizIndex(0);
    setQuizMode("taking");
    setQuizReviewIndex(0);
  }

  function exitQuiz() {
    const answered = Object.values(quizResponses).filter((response) => response.submitted).length;
    if (quizMode === "taking" && answered < quizQuestions.length && !window.confirm("End this quiz? Your current attempt is not saved.")) return;
    finishQuiz();
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
        const weekOrder = compareLectureWeeks(a.week, b.week);
        if (sloExportFormat === "excel") {
          return (sloExportSort === "lecturer" ? lecturerOrder || weekOrder : weekOrder)
            || compareText(a.title, b.title);
        }
        return compareText(a.academicYear, b.academicYear)
          || compareText(a.course, b.course)
          || (sloExportSort === "lecturer" ? lecturerOrder : 0)
          || weekOrder
          || compareText(a.title, b.title);
      });
    if (!selected.length) { setNotice("Select at least one lecture with SLOs."); return; }
    if (sloExportFormat === "excel") downloadSloExcel(selected);
    else downloadSloPdf(selected, { includeProgressTracker });
    setSloExportOpen(false);
    setNotice(`Created an SLO ${sloExportFormat === "excel" ? "Excel workbook" : "PDF"} from ${selected.length} lecture${selected.length === 1 ? "" : "s"}.`);
  }

  function selectedImportDestination(): ImportDestination {
    if (view !== "library" || allLecturesSelected) {
      return { academicYear: activeYear, course: null, lecturer: null, label: `${activeYear} · course detected by Luna` };
    }
    const course = activeCourse === "All courses" ? "Unassigned course" : activeCourse;
    const lecturer = activeCourse !== "All courses" && activeLecturer !== ALL_LECTURERS ? activeLecturer : null;
    return {
      academicYear: activeYear,
      course,
      lecturer,
      label: `${activeYear} · ${course}${lecturer ? ` · ${lecturerFolderLabel(lecturer)}` : ""}`,
    };
  }

  async function importLecture(file: File, destination: ImportDestination, onStage: (status: UploadStatus) => void) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      throw new Error("Please choose a PDF lecture deck.");
    }
    const diagnosticContext = { fileName: file.name, fileSizeBytes: file.size, fileType: file.type || "unknown", destination: destination.label };
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
        try { await (pdf as unknown as { destroy: () => Promise<void> }).destroy(); } catch { /* Cleanup must not fail an otherwise successful import. */ }
        data = new Uint8Array(0);
      }
      const first = slides[0]?.text ?? file.name.replace(/\.pdf$/i, "");
      const title = first.replace(/^\d+\s*/, "").split(/(?:August|September|October|November|December|January|February|March|April|May|June|July)\s+\d+/i)[0].replace(/[“”"]/g, "").trim().slice(0, 100) || file.name.replace(/\.pdf$/i, "");
      const lecture: Lecture = {
        id: crypto.randomUUID(), title, lecturer: destination.lecturer ?? "Lecturer not detected", week: null, course: destination.course ?? "Unsorted",
        academicYear: destination.academicYear, favorite: false, pages: pageCount, slos: detectSLOs(slides), outline: [], summary: `Imported ${pageCount} slides. Review the slide index and SLOs below; an AI brief will be added when available.`, slides, notes: {}, markups: {}, markedSlides: [], flaggedSLOs: [], questions: [], fileName: file.name, createdAt: new Date().toISOString(),
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
          const merged = mergeAiLectureBrief(lecture, await response.json(), slides, destination);
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
          await importLecture(job.file, job.destination, (status) => updateUploadJob(job.id, { status }));
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
    const destination = selectedImportDestination();
    const entries = files.map((file) => {
      const id = crypto.randomUUID();
      return { pending: { id, file, destination }, display: { id, name: file.name, destinationLabel: destination.label, status: "queued" as const } };
    });
    // Keep raw PDFs out of React state so each completed file can be garbage-collected.
    pendingUploads.current.push(...entries.map(({ pending }) => pending));
    setUploadQueue((current) => [...current, ...entries.map(({ display }) => display)]);
    setQueueVisible(true);
    void runUploadQueue();
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

  async function updateLectureWeek(lecture: Lecture, value: string) {
    const week = value ? Number(value) : null;
    if (lecture.week === week) return;
    const updated = { ...lecture, week };
    setLectures((current) => current.map((item) => item.id === lecture.id ? updated : item));
    await saveLecture(updated);
    setNotice(week === null ? "Lecture week cleared." : `Lecture assigned to Week ${week}.`);
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
    setWeekDraft(lecture.week === null ? "" : String(lecture.week));
    setEditingMetadataId(lecture.id);
  }

  async function saveLectureMetadata(lecture: Lecture) {
    const course = courseDraft.trim();
    if (!course) { setNotice("Course designation cannot be empty."); return; }
    const lecturer = lecturerChoice === NEW_LECTURER ? newLecturerDraft.trim() : lecturerChoice;
    if (!lecturer) { setNotice("Choose a lecturer or add a new one."); return; }
    const week = weekDraft ? Number(weekDraft) : null;
    const updated = { ...lecture, course, lecturer, week };
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
  const totalQuestionCount = questionLectures.reduce((total, lecture) => total + lecture.questions.length, 0);
  const selectedQuestionSourceCount = selectedQuestionLectureIds.size + selectedQuestionSlideKeys.size;
  const selectedQuizQuestionCount = questionLectures.filter((lecture) => selectedQuizLectureIds.has(lecture.id)).reduce((total, lecture) => total + lecture.questions.length, 0);
  const quizQuestionLimit = Math.min(100, selectedQuizQuestionCount);
  const effectiveQuizQuestionCount = quizQuestionLimit > 0 ? Math.min(Math.max(1, quizQuestionCount), quizQuestionLimit) : 0;
  const currentQuizQuestion = quizQuestions[quizIndex];
  const currentQuizResponse = currentQuizQuestion ? quizResponses[currentQuizQuestion.key] ?? { response: "", submitted: false, correct: null } : null;
  const quizCorrectCount = quizQuestions.filter((question) => quizResponses[question.key]?.correct === true).length;
  const incorrectQuizQuestions = quizQuestions.filter((question) => quizResponses[question.key]?.correct === false);
  const quizPercent = quizQuestions.length ? Math.round((quizCorrectCount / quizQuestions.length) * 100) : 0;
  const reviewQuizQuestion = incorrectQuizQuestions[quizReviewIndex];
  const reviewQuizResponse = reviewQuizQuestion ? quizResponses[reviewQuizQuestion.key] : undefined;
  const activeUpload = uploadQueue.find((job) => ["extracting", "analyzing", "saving"].includes(job.status));
  const nextUpload = uploadQueue.find((job) => job.status === "queued");
  const finishedUploads = uploadQueue.filter((job) => job.status === "done" || job.status === "error").length;
  const currentImportDestination = selectedImportDestination();
  const libraryLocationLabel = allLecturesSelected
    ? "LECTURES"
    : `${activeYear}${activeCourse === "All courses" ? "" : ` · ${activeCourse.toUpperCase()}`}${activeLecturer === ALL_LECTURERS ? "" : ` · ${lecturerFolderLabel(activeLecturer).toUpperCase()}`}`;
  const sloFilterValue = flaggedSLOsSelected ? "flagged" : sloWeekFilter;
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
    const collapse = view === "slos" && allSLOsSelected && sloTreeExpanded;
    setAllSLOsSelected(true);
    setActiveSloLecturer(ALL_LECTURERS);
    setSloTreeExpanded(!collapse);
    setView("slos");
  }

  function selectQuestionRoot() {
    const collapse = view === "questions" && allQuestionsSelected && questionTreeExpanded;
    setAllQuestionsSelected(true);
    setActiveQuestionLecturer(ALL_LECTURERS);
    setQuestionTreeExpanded(!collapse);
    setView("questions");
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
      setCloudHasData(true);
      setNotice(`Cloud migration complete: ${result.counts.lectures} lectures and ${result.counts.preReads} pre-reads.`);
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
      <div className="cloud-auth-heading"><small>PRIVATE CURRICULUM LIBRARY</small><h1>{authMode === "signin" ? "Sign in" : "Create your account"}</h1><p>Your lectures, annotations, SLOs, and questions stay private to your account.</p></div>
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
            <button className={`nav-root ${view === "slos" && allSLOsSelected ? "active" : ""}`} aria-expanded={sloTreeExpanded} onClick={selectSloRoot}><span className={`nav-caret ${sloTreeExpanded ? "expanded" : ""}`}>›</span><AppIcon name="target"/><strong>SLOs</strong></button>
            {sloTreeExpanded && <CurriculumTree lectures={lectures} academicYears={academicYears} coursesByYear={coursesByYear} expandedYear={expandedSloYear} expandedCourse={expandedSloCourse} selectedYear={activeSloYear} selectedCourse={activeSloCourse} selectedLecturer={activeSloLecturer} allSelected={allSLOsSelected} isCurrentSection={view === "slos"} showCounts={false} onSelectYear={(year) => { setAllSLOsSelected(false); setActiveSloYear(year); setActiveSloCourse("All courses"); setActiveSloLecturer(ALL_LECTURERS); setExpandedSloYear(year); setView("slos"); }} onSelectCourse={(year, course, courseKey) => { setAllSLOsSelected(false); setActiveSloYear(year); setActiveSloCourse(course); setActiveSloLecturer(ALL_LECTURERS); setExpandedSloCourse((current) => current === courseKey ? null : courseKey); setView("slos"); }} onSelectLecturer={(year, course, lecturer) => { setAllSLOsSelected(false); setActiveSloYear(year); setActiveSloCourse(course); setActiveSloLecturer(lecturer); setView("slos"); }} />}
          </section>
          <section className="nav-section">
            <button className={`nav-root ${view === "questions" && allQuestionsSelected ? "active" : ""}`} aria-expanded={questionTreeExpanded} onClick={selectQuestionRoot}><span className={`nav-caret ${questionTreeExpanded ? "expanded" : ""}`}>›</span><span className="nav-indent"/><strong>Question Bank</strong><b>{totalQuestionCount}</b></button>
            {questionTreeExpanded && <CurriculumTree lectures={questionLectures} academicYears={questionAcademicYears} coursesByYear={questionCoursesByYear} expandedYear={expandedQuestionYear} expandedCourse={expandedQuestionCourse} selectedYear={activeQuestionYear} selectedCourse={activeQuestionCourse} selectedLecturer={activeQuestionLecturer} allSelected={allQuestionsSelected} isCurrentSection={view === "questions"} countItems={(items) => items.reduce((total, lecture) => total + lecture.questions.length, 0)} onSelectYear={(year) => { setAllQuestionsSelected(false); setActiveQuestionYear(year); setActiveQuestionCourse("All courses"); setActiveQuestionLecturer(ALL_LECTURERS); setExpandedQuestionYear(year); setView("questions"); }} onSelectCourse={(year, course, courseKey) => { setAllQuestionsSelected(false); setActiveQuestionYear(year); setActiveQuestionCourse(course); setActiveQuestionLecturer(ALL_LECTURERS); setExpandedQuestionCourse((current) => current === courseKey ? null : courseKey); setView("questions"); }} onSelectLecturer={(year, course, lecturer) => { setAllQuestionsSelected(false); setActiveQuestionYear(year); setActiveQuestionCourse(course); setActiveQuestionLecturer(lecturer); setView("questions"); }} />}
          </section>
          <section className="nav-section preread-nav-section">
            <button className={`nav-root ${view === "prereads" && preReadFilter === "all" ? "active" : ""}`} aria-expanded={preReadTreeExpanded} onClick={selectPreReadRoot}><span className={`nav-caret ${preReadTreeExpanded ? "expanded" : ""}`}>›</span><AppIcon name="file"/><strong>Pre-reads</strong></button>
            {preReadTreeExpanded && <div className="nav-tree preread-tree">
              {(["unread", "read", "rereview"] as const).map((status) => <button key={status} className={`tree-all ${view === "prereads" && preReadFilter === status ? "active" : ""}`} onClick={() => { setPreReadFilter(status); setView("prereads"); }}><span>{preReadStatusLabel[status]}</span></button>)}
            </div>}
          </section>
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
          <div><small>ONE-TIME CLOUD SETUP</small><strong>Move this device’s library into your private account</strong><p>This copies your lectures, PDFs, SLOs, questions, notes, and pre-reads. The originals remain safely on this computer.</p>{migrationProgress && <span>{migrationProgress.completed} of {migrationProgress.total}: {migrationProgress.label}</span>}</div>
          <button type="button" disabled={migrationRunning} onClick={() => void migrateThisDevice()}>{migrationRunning ? "Migrating…" : "Migrate this device"}</button>
        </section>}

        {queueVisible && uploadQueue.length > 0 && <aside className="upload-queue" aria-label="Lecture import queue"><header><div><small>IMPORT QUEUE</small><strong>{finishedUploads} of {uploadQueue.length} finished</strong></div><button aria-label="Hide import queue" onClick={() => setQueueVisible(false)}><AppIcon name="x"/></button></header><div className="queue-jobs">{uploadQueue.map((job) => <div className={`queue-job ${job.status}`} key={job.id}><span className="queue-indicator"/><div><strong>{job.name}</strong><small>{uploadStatusLabel[job.status]}{activeUpload?.id === job.id ? " · Current" : nextUpload?.id === job.id ? " · Next" : ""}</small><small className="queue-destination">{job.destinationLabel}</small>{job.error && <em>{job.error}</em>}</div></div>)}</div><footer><button disabled={uploading} onClick={() => setUploadQueue((current) => current.filter((job) => job.status !== "done" && job.status !== "error"))}>Clear finished</button></footer></aside>}

        {view === "home" && <section className="full-page home-page">
          <div className="page-toolbar"><div className="eyebrow">FLAGGED SLOS</div></div>
          {homeFlaggedLectures.length > 0 ? <div className="home-flagged-list">{homeFlaggedLectures.map((lecture) => {
            const flaggedEntries = lecture.flaggedSLOs.map((index) => ({ index, slo: lecture.slos[index] })).filter((entry) => Boolean(entry.slo));
            return <article className="home-flagged-card" key={lecture.id}><header><div><small>{lecture.course} · {lecturerFolderLabel(lecture.lecturer)}</small><h2>{lecture.title}</h2></div><button onClick={() => { setActiveId(lecture.id); openLectureBrief(lecture.id); }}>Open lecture</button></header><ol>{flaggedEntries.map(({ index, slo }) => <li key={`${index}-${slo}`}><span>{index + 1}</span><p>{slo}</p></li>)}</ol></article>;
          })}</div> : <div className="home-empty"><strong>No flagged SLOs</strong><span>Flag an objective from the SLO page and it will appear here.</span></div>}
        </section>}

        {(view === "library" || view === "favorites") && <div className={`content-grid ${displayActive ? "" : "single-column"}`}>
          <section className="library-panel">
            <div className="page-toolbar"><div className="eyebrow">{view === "favorites" ? "SAVED LECTURES" : libraryLocationLabel}</div><div className="lecture-toolbar-controls"><label className="sort-control"><span>Filter by</span><select aria-label="Filter lectures by curriculum week" value={lectureWeekFilter} onChange={(event) => setLectureWeekFilter(event.target.value)}><option value="all">All weeks</option>{LECTURE_WEEK_OPTIONS.map((week) => <option key={week} value={week}>Week {week}</option>)}<option value="unassigned">Week unassigned</option></select></label><label className="sort-control"><span>Sort by</span><select value={lectureSort} onChange={(event) => setLectureSort(event.target.value as "week-asc" | "name-asc")}><option value="week-asc">Week · earliest first</option><option value="name-asc">Name · A–Z</option></select></label></div></div>
            {view === "library" && <button className={`dropzone top-dropzone ${dragging ? "dragging" : ""}`} onClick={() => fileInput.current?.click()} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) enqueueFiles(e.dataTransfer.files); }}>
              <span><AppIcon name="upload"/></span><strong>Drop one or more lectures here</strong><small>PDF · Import to {currentImportDestination.label}</small>
            </button>}
            <div className="lecture-list">
              {visibleLectures.map((lecture) => <article key={lecture.id} className={`lecture-card ${displayActive?.id === lecture.id ? "selected" : ""}`}>
                <button className="lecture-open" onClick={() => setActiveId(lecture.id)}>
                  <span className="lecture-copy"><small>{lecture.course.toUpperCase()}</small><strong>{lecture.title}</strong><em>{lecture.lecturer} · {lectureWeekLabel(lecture.week)}</em></span>
                </button>
                <label className="lecture-week-control">
                  <select aria-label={`Curriculum week for ${lecture.title}`} value={lecture.week ?? ""} onChange={(event) => updateLectureWeek(lecture, event.target.value)}>
                    <option value="">Week —</option>
                    {LECTURE_WEEK_OPTIONS.map((week) => <option key={week} value={week}>Week {week}</option>)}
                  </select>
                </label>
                <div className="lecture-card-rail">
                  <button className="lecture-slo-peek" aria-label={`Preview ${lecture.slos.length} session learning objectives`}><b>{lecture.slos.length} SLO{lecture.slos.length === 1 ? "" : "s"}</b></button><span className="slo-tooltip" role="tooltip"><strong>Session learning objectives</strong>{lecture.slos.length > 0 ? <ol>{lecture.slos.map((slo, index) => <li key={`${index}-${slo}`}>{slo}</li>)}</ol> : <p>No SLOs were extracted for this lecture.</p>}</span>
                  <button className="card-open-brief" onClick={() => { setActiveId(lecture.id); openLectureBrief(lecture.id); }}><span>Open lecture</span><AppIcon name="arrow"/></button>
                </div>
                <span className="lecture-actions"><button className={lecture.favorite ? "favorited" : ""} aria-label={lecture.favorite ? "Remove from favorites" : "Add to favorites"} title={lecture.favorite ? "Remove from favorites" : "Add to favorites"} onClick={() => toggleFavorite(lecture.id)}><AppIcon name="star"/></button><button className="remove-action" aria-label="Remove lecture" title="Remove lecture" onClick={() => removeLecture(lecture.id)}><AppIcon name="trash"/></button></span>
              </article>)}
              {visibleLectures.length === 0 && <div className="library-empty"><AppIcon name={view === "favorites" ? "star" : "folder"}/><strong>{view === "favorites" ? "No favorite lectures yet" : "This folder is empty"}</strong><span>{view === "favorites" ? "Use the star on any lecture to keep it here." : "Add a PDF to this academic year and course."}</span></div>}
            </div>
          </section>

          {displayActive && <aside className="detail-panel">
            <div className="detail-label">LECTURE BRIEF</div><h2>{displayActive.title}</h2><p>{displayActive.summary}</p>
            {editingMetadataId === displayActive.id ? <div className="metadata-editor">
              <label><span>Course designation</span><input value={courseDraft} onChange={(event) => setCourseDraft(event.target.value)} /></label>
              <label><span>Lecturer</span><select value={lecturerChoice} onChange={(event) => setLecturerChoice(event.target.value)}>{lecturerOptions.map((lecturer) => <option value={lecturer} key={lecturer}>{lecturer}</option>)}<option value={NEW_LECTURER}>Add a new lecturer…</option></select></label>
              {lecturerChoice === NEW_LECTURER && <label><span>New lecturer</span><input value={newLecturerDraft} onChange={(event) => setNewLecturerDraft(event.target.value)} placeholder="Name and credentials" /></label>}
              <label><span>Curriculum week</span><select value={weekDraft} onChange={(event) => setWeekDraft(event.target.value)}><option value="">Unassigned</option>{LECTURE_WEEK_OPTIONS.map((week) => <option key={week} value={week}>Week {week}</option>)}</select></label>
              <div><button onClick={() => setEditingMetadataId("")}>Cancel</button><button className="save-metadata" onClick={() => saveLectureMetadata(displayActive)}>Save details</button></div>
            </div> : <div className="lecture-details"><span><small>Course</small>{displayActive.academicYear} / {displayActive.course}</span><span><small>Lecturer</small>{displayActive.lecturer}</span><span><small>Week</small>{lectureWeekLabel(displayActive.week)}</span><button onClick={() => startMetadataEdit(displayActive)}>Edit details</button><button onClick={() => openQuestionBuilder(displayActive.id)}>Draft questions</button></div>}
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
            <label><span>Sort by</span><select value={searchSort} onChange={(event) => setSearchSort(event.target.value as "relevance" | "week-asc" | "name-asc")}><option value="relevance">Relevance</option><option value="week-asc">Week · earliest first</option><option value="name-asc">Name · A–Z</option></select></label>
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
          <div className="page-toolbar"><div>{allSLOsSelected ? <div className="eyebrow">SESSION LEARNING OBJECTIVES</div> : <nav className="slo-breadcrumbs" aria-label="SLO folders">
              <button onClick={() => { setActiveSloCourse("All courses"); setActiveSloLecturer(ALL_LECTURERS); setExpandedSloYear(activeSloYear); }}>{activeSloYear}</button>
              {activeSloCourse !== "All courses" && <><span>·</span><button onClick={() => setActiveSloLecturer(ALL_LECTURERS)}>{activeSloCourse}</button></>}
              {activeSloLecturer !== ALL_LECTURERS && <><span>·</span><button onClick={() => setActiveSloLecturer(activeSloLecturer)}>{lecturerFolderLabel(activeSloLecturer)}</button></>}
            </nav>}</div><div className="page-toolbar-actions"><div className="lecture-toolbar-controls"><label className="sort-control"><span>Filter by</span><select aria-label="Filter SLOs" value={sloFilterValue} onChange={(event) => { const value = event.target.value; setFlaggedSLOsSelected(value === "flagged"); if (value !== "flagged") setSloWeekFilter(value); }}><option value="all">All SLOs</option><option value="flagged">Flagged SLOs</option>{LECTURE_WEEK_OPTIONS.map((week) => <option key={week} value={week}>Week {week}</option>)}<option value="unassigned">Week unassigned</option></select></label><label className="sort-control"><span>Sort by</span><select value={sloSort} onChange={(event) => setSloSort(event.target.value as "week-asc" | "name-asc")}><option value="week-asc">Week · earliest first</option><option value="name-asc">Name · A–Z</option></select></label></div><button className="convert-slo-button" onClick={openSloExport}><AppIcon name="download"/>Export SLOs</button></div></div>
          <div className="lecture-list unified-card-list">{visibleSloLectures.map((lecture) => {
            const expanded = expandedSloLectureIds.has(lecture.id);
            const entries = lecture.slos.map((slo, index) => ({ slo, index })).filter(({ index }) => !flaggedSLOsSelected || lecture.flaggedSLOs.includes(index));
            const toggleExpanded = () => setExpandedSloLectureIds((current) => { const next = new Set(current); if (expanded) next.delete(lecture.id); else next.add(lecture.id); return next; });
            return <article key={lecture.id} className={`lecture-card unified-curriculum-card ${expanded ? "expanded" : ""}`}>
              <button className="lecture-open" onClick={toggleExpanded}>
                <span className="lecture-copy"><small>{lecture.course.toUpperCase()}</small><strong>{lecture.title}</strong><em>{lecture.lecturer} · {lectureWeekLabel(lecture.week)}</em></span>
              </button>
              <label className="lecture-week-control unified-week-control"><select aria-label={`Curriculum week for ${lecture.title}`} value={lecture.week ?? ""} onChange={(event) => updateLectureWeek(lecture, event.target.value)}><option value="">Week —</option>{LECTURE_WEEK_OPTIONS.map((week) => <option key={week} value={week}>Week {week}</option>)}</select></label>
              <div className="lecture-card-rail"><span className="catalog-count">{lecture.slos.length} SLO{lecture.slos.length === 1 ? "" : "s"}</span><button className="card-open-brief" onClick={toggleExpanded}><span>{expanded ? "Hide SLOs" : "View SLOs"}</span><AppIcon name="arrow"/></button></div>
              {expanded && <div className="unified-card-content"><ol>{entries.map(({ slo, index }) => {
              const flagged = lecture.flaggedSLOs.includes(index);
              return <li key={`${index}-${slo}`}><span>{index + 1}</span><p>{slo}</p><button className={`slo-flag ${flagged ? "flagged" : ""}`} aria-label={flagged ? "Unflag this SLO" : "Flag this SLO"} aria-pressed={flagged} title={flagged ? "Remove flag" : "Flag for review"} onClick={() => toggleSloFlag(lecture.id, index)}><AppIcon name="flag"/></button></li>;
              })}</ol><footer><button className="secondary-card-action" onClick={() => openSloReparse(lecture.id)}>Luna re-parse</button><button className="primary-card-action" onClick={() => openLectureBrief(lecture.id)}>Open lecture</button></footer></div>}
            </article>;
          })}</div>
          {visibleSloLectures.length === 0 && <div className="empty-state"><AppIcon name="target"/><strong>{flaggedSLOsSelected ? "No flagged SLOs yet" : "No SLOs in this folder yet"}</strong><span>{flaggedSLOsSelected ? "Use the flag beside any SLO to keep it here for review." : "Upload a lecture or choose another folder from the SLO tree."}</span></div>}
        </section>}

        {view === "questions" && <section className="full-page question-bank-page">
          <div className="page-toolbar"><div>{allQuestionsSelected ? <div className="eyebrow">QUESTION BANK</div> : <nav className="slo-breadcrumbs" aria-label="Question bank folders">
            <button onClick={() => { setActiveQuestionCourse("All courses"); setActiveQuestionLecturer(ALL_LECTURERS); setExpandedQuestionYear(activeQuestionYear); }}>{activeQuestionYear}</button>
            {activeQuestionCourse !== "All courses" && <><span>·</span><button onClick={() => setActiveQuestionLecturer(ALL_LECTURERS)}>{activeQuestionCourse}</button></>}
            {activeQuestionLecturer !== ALL_LECTURERS && <><span>·</span><button>{lecturerFolderLabel(activeQuestionLecturer)}</button></>}
          </nav>}</div><div className="page-toolbar-actions"><div className="lecture-toolbar-controls"><label className="sort-control"><span>Filter by</span><select aria-label="Filter question bank by curriculum week" value={questionWeekFilter} onChange={(event) => setQuestionWeekFilter(event.target.value)}><option value="all">All weeks</option>{LECTURE_WEEK_OPTIONS.map((week) => <option key={week} value={week}>Week {week}</option>)}<option value="unassigned">Week unassigned</option></select></label><label className="sort-control"><span>Sort by</span><select value={questionSort} onChange={(event) => setQuestionSort(event.target.value as "week-asc" | "name-asc")}><option value="week-asc">Week · earliest first</option><option value="name-asc">Name · A–Z</option></select></label></div><div className="question-bank-actions"><button className="take-quiz-trigger" disabled={totalQuestionCount === 0} onClick={openQuizBuilder}>Take quiz</button><button className="question-draft-trigger" onClick={() => openQuestionBuilder()}>Draft with Luna</button></div></div></div>
          {visibleQuestionLectures.length > 0 ? <div className="lecture-list unified-card-list">{visibleQuestionLectures.map((lecture) => {
            const expanded = expandedQuestionBankLectureIds.has(lecture.id);
            const toggleExpanded = () => setExpandedQuestionBankLectureIds((current) => { const next = new Set(current); if (expanded) next.delete(lecture.id); else next.add(lecture.id); return next; });
            return <article className={`lecture-card unified-curriculum-card ${expanded ? "expanded" : ""}`} key={lecture.id}>
            <button className="lecture-open" onClick={toggleExpanded}><span className="lecture-copy"><small>{lecture.course.toUpperCase()}</small><strong>{lecture.title}</strong><em>{lecture.lecturer} · {lectureWeekLabel(lecture.week)}</em></span></button>
            <label className="lecture-week-control unified-week-control"><select aria-label={`Curriculum week for ${lecture.title}`} value={lecture.week ?? ""} onChange={(event) => updateLectureWeek(lecture, event.target.value)}><option value="">Week —</option>{LECTURE_WEEK_OPTIONS.map((week) => <option key={week} value={week}>Week {week}</option>)}</select></label>
            <div className="lecture-card-rail"><span className="catalog-count">{lecture.questions.length} question{lecture.questions.length === 1 ? "" : "s"}</span><button className="card-open-brief" onClick={toggleExpanded}><span>{expanded ? "Hide questions" : "View questions"}</span><AppIcon name="arrow"/></button></div>
            {expanded && <div className="unified-card-content question-list">{lecture.questions.map((question, index) => {
              const revealed = revealedQuestionIds.has(question.id);
              return <article className="bank-question" key={question.id}>
                <div className="question-meta"><span>Q{index + 1}</span><small>{question.type === "multiple-choice" ? "Multiple choice" : "Short answer"}</small><div>{question.sourcePages.map((page) => <button key={page} onClick={() => openLectureBrief(lecture.id, page)}>Page {page}</button>)}</div></div>
                <h3>{question.prompt}</h3>
                {question.type === "multiple-choice" && <ol className="question-options" type="A">{question.options.map((option) => <li key={option}>{option}</li>)}</ol>}
                {revealed && <div className="question-answer"><strong>Answer</strong><p>{question.answer}</p>{question.explanation && <><strong>Explanation</strong><p>{question.explanation}</p></>}</div>}
                <footer><button onClick={() => setRevealedQuestionIds((current) => { const next = new Set(current); if (revealed) next.delete(question.id); else next.add(question.id); return next; })}>{revealed ? "Hide answer" : "Show answer"}</button><button className="remove-question" onClick={() => void removeQuestion(lecture.id, question.id)}>Remove</button></footer>
              </article>;
            })}</div>}
          </article>;
          })}</div> : <div className="home-empty"><strong>No approved questions here yet</strong><span>Select lectures or individual slides and ask Luna to draft the first set.</span><button onClick={() => openQuestionBuilder()}>Draft questions</button></div>}
        </section>}

        {quizBuilderOpen && <div className="export-backdrop quiz-builder-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setQuizBuilderOpen(false); }}>
          <section className="quiz-builder-modal" role="dialog" aria-modal="true" aria-labelledby="quiz-builder-title">
            <header><div><small>BUILD A QUIZ</small><h2 id="quiz-builder-title">Choose quiz material</h2><p>Select any combination of lectures. Questions are mixed together automatically.</p></div><button className="icon-button" aria-label="Close quiz builder" onClick={() => setQuizBuilderOpen(false)}><AppIcon name="x"/></button></header>
            <div className="quiz-builder-options">
              <label><span>Number of questions</span><input type="number" min="1" max={Math.max(1, quizQuestionLimit)} disabled={quizQuestionLimit === 0} value={effectiveQuizQuestionCount || 1} onChange={(event) => setQuizQuestionCount(Math.min(100, Math.max(1, Number(event.target.value) || 1)))}/><small>{quizQuestionLimit} available from this selection · 100 maximum</small></label>
              <div className="quiz-order-setting"><span>Question order</span><strong>Randomized</strong><small>Lectures and questions will be interleaved.</small></div>
            </div>
            <div className="question-source-toolbar quiz-source-toolbar"><span><strong>{selectedQuizLectureIds.size}</strong> lecture{selectedQuizLectureIds.size === 1 ? "" : "s"} · <strong>{selectedQuizQuestionCount}</strong> question{selectedQuizQuestionCount === 1 ? "" : "s"}</span><div><button onClick={() => setQuizLectureSelection(questionLectures.map((lecture) => lecture.id), true)}>Select all</button><button onClick={() => setSelectedQuizLectureIds(new Set())}>Clear</button></div></div>
            <div className="quiz-source-tree">{questionAcademicYears.map((year) => {
              const yearLectures = questionLectures.filter((lecture) => lecture.academicYear === year);
              return <section key={year}><h3>{year}</h3>{(questionCoursesByYear[year] ?? []).map((course) => {
                const courseLectures = yearLectures.filter((lecture) => lecture.course === course);
                const courseIds = courseLectures.map((lecture) => lecture.id);
                const courseSelected = courseIds.length > 0 && courseIds.every((id) => selectedQuizLectureIds.has(id));
                const courseQuestionCount = courseLectures.reduce((total, lecture) => total + lecture.questions.length, 0);
                return <div className="quiz-source-course" key={course}>
                  <label className="quiz-source-course-head"><input type="checkbox" checked={courseSelected} onChange={() => setQuizLectureSelection(courseIds, !courseSelected)}/><strong>{course}</strong><span>{courseQuestionCount} questions</span></label>
                  <div>{courseLectures.map((lecture) => <label className="quiz-source-lecture" key={lecture.id}><input type="checkbox" checked={selectedQuizLectureIds.has(lecture.id)} onChange={(event) => setQuizLectureSelection([lecture.id], event.target.checked)}/><span><strong>{lecture.title}</strong><small>{lecturerFolderLabel(lecture.lecturer)}</small></span><b>{lecture.questions.length}</b></label>)}</div>
                </div>;
              })}</section>;
            })}</div>
            <footer><button onClick={() => setQuizBuilderOpen(false)}>Cancel</button><button className="quiz-start-button" disabled={effectiveQuizQuestionCount === 0} onClick={startQuiz}>{effectiveQuizQuestionCount > 0 ? `Start ${effectiveQuizQuestionCount} question${effectiveQuizQuestionCount === 1 ? "" : "s"}` : "Start quiz"}</button></footer>
          </section>
        </div>}

        {quizQuestions.length > 0 && <section className="quiz-session" role="dialog" aria-modal="true" aria-label="Quiz session">
          <header className="quiz-session-header"><strong>FCOM.lib <span>Quiz</span></strong><div>{quizMode === "taking" ? `Question ${quizIndex + 1} of ${quizQuestions.length}` : quizMode === "review" ? `Incorrect ${quizReviewIndex + 1} of ${incorrectQuizQuestions.length}` : "Results"}</div><button aria-label="Exit quiz" onClick={exitQuiz}><AppIcon name="x"/></button></header>
          {quizMode === "taking" && currentQuizQuestion && currentQuizResponse && <>
            <div className="quiz-progress" role="progressbar" aria-label="Quiz progress" aria-valuemin={1} aria-valuemax={quizQuestions.length} aria-valuenow={quizIndex + 1}><span style={{ width: `${((quizIndex + 1) / quizQuestions.length) * 100}%` }}/></div>
            <div className="quiz-question-screen">
              <article className="quiz-question-card">
                <div className="quiz-question-source"><span>{currentQuizQuestion.lectureTitle}</span><small>{lecturerFolderLabel(currentQuizQuestion.lecturer)}{currentQuizQuestion.question.sourcePages.length ? ` · PDF page ${currentQuizQuestion.question.sourcePages.join(", ")}` : ""}</small></div>
                <h1>{currentQuizQuestion.question.prompt}</h1>
                {currentQuizQuestion.question.type === "multiple-choice" ? <div className="quiz-answer-options">{currentQuizQuestion.question.options.map((option, optionIndex) => {
                  const selected = currentQuizResponse.response === option;
                  const isAnswer = option === currentQuizQuestion.question.answer;
                  const stateClass = currentQuizResponse.submitted ? isAnswer ? "correct-answer" : selected ? "incorrect-answer" : "" : selected ? "selected" : "";
                  return <label className={stateClass} key={`${optionIndex}-${option}`}><input type="radio" name="quiz-answer" disabled={currentQuizResponse.submitted} checked={selected} onChange={() => setCurrentQuizResponse(option)}/><b>{String.fromCharCode(65 + optionIndex)}</b><span>{option}</span></label>;
                })}</div> : <label className="quiz-short-answer"><span>Your answer</span><textarea disabled={currentQuizResponse.submitted} value={currentQuizResponse.response} onChange={(event) => setCurrentQuizResponse(event.target.value)} placeholder="Write a short response, then compare it with the saved answer."/></label>}
                {currentQuizResponse.submitted && <div className={`quiz-feedback ${currentQuizResponse.correct === true ? "correct" : currentQuizResponse.correct === false ? "incorrect" : "self-grade"}`}>
                  <strong>{currentQuizResponse.correct === true ? "Correct" : currentQuizResponse.correct === false ? "Not quite" : "Compare your response"}</strong>
                  <div><small>Correct answer</small><p>{currentQuizQuestion.question.answer}</p></div>
                  {currentQuizQuestion.question.explanation && <div><small>Explanation</small><p>{currentQuizQuestion.question.explanation}</p></div>}
                  {currentQuizQuestion.question.type === "short-answer" && currentQuizResponse.correct === null && <div className="quiz-self-grade"><span>How did you do?</span><button onClick={() => gradeShortAnswer(false)}>Mark incorrect</button><button onClick={() => gradeShortAnswer(true)}>Mark correct</button></div>}
                </div>}
                <footer>{!currentQuizResponse.submitted ? <button className="quiz-submit-answer" disabled={!currentQuizResponse.response.trim()} onClick={submitQuizAnswer}>Submit answer</button> : <button className="quiz-next-question" disabled={currentQuizQuestion.question.type === "short-answer" && currentQuizResponse.correct === null} onClick={advanceQuiz}>{quizIndex >= quizQuestions.length - 1 ? "See results" : "Next question"}</button>}</footer>
              </article>
            </div>
          </>}
          {quizMode === "results" && <div className="quiz-results-screen"><article><small>QUIZ COMPLETE</small><h1>{quizPercent}%</h1><p>{quizCorrectCount} of {quizQuestions.length} correct</p><div className="quiz-result-counts"><span><strong>{quizCorrectCount}</strong>Correct</span><span><strong>{incorrectQuizQuestions.length}</strong>Incorrect</span></div><div className="quiz-result-actions">{incorrectQuizQuestions.length > 0 && <button onClick={() => { setQuizReviewIndex(0); setQuizMode("review"); }}>Review incorrect answers</button>}<button onClick={() => { finishQuiz(); openQuizBuilder(); }}>Take another quiz</button><button className="quiz-finish" onClick={finishQuiz}>Finish</button></div></article></div>}
          {quizMode === "review" && reviewQuizQuestion && reviewQuizResponse && <div className="quiz-question-screen quiz-review-screen"><article className="quiz-question-card"><div className="quiz-question-source"><span>{reviewQuizQuestion.lectureTitle}</span><small>{lecturerFolderLabel(reviewQuizQuestion.lecturer)}{reviewQuizQuestion.question.sourcePages.length ? ` · PDF page ${reviewQuizQuestion.question.sourcePages.join(", ")}` : ""}</small></div><h1>{reviewQuizQuestion.question.prompt}</h1>{reviewQuizQuestion.question.type === "multiple-choice" && <div className="quiz-answer-options review">{reviewQuizQuestion.question.options.map((option, optionIndex) => <div className={option === reviewQuizQuestion.question.answer ? "correct-answer" : option === reviewQuizResponse.response ? "incorrect-answer" : ""} key={`${optionIndex}-${option}`}><b>{String.fromCharCode(65 + optionIndex)}</b><span>{option}</span></div>)}</div>}<div className="quiz-review-comparison"><div><small>Your answer</small><p>{reviewQuizResponse.response}</p></div><div><small>Correct answer</small><p>{reviewQuizQuestion.question.answer}</p></div>{reviewQuizQuestion.question.explanation && <div><small>Explanation</small><p>{reviewQuizQuestion.question.explanation}</p></div>}</div><footer className="quiz-review-navigation"><button disabled={quizReviewIndex === 0} onClick={() => setQuizReviewIndex((index) => Math.max(0, index - 1))}>Previous incorrect</button>{quizReviewIndex < incorrectQuizQuestions.length - 1 ? <button onClick={() => setQuizReviewIndex((index) => index + 1)}>Next incorrect</button> : <button onClick={() => setQuizMode("results")}>Back to results</button>}</footer></article></div>}
        </section>}

        {questionBuilderOpen && <div className="export-backdrop question-builder-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !questionGenerating) setQuestionBuilderOpen(false); }}>
          <section className="question-builder-modal" role="dialog" aria-modal="true" aria-labelledby="question-builder-title">
            <header><div><small>LUNA QUESTION DRAFTING</small><h2 id="question-builder-title">{questionDrafts ? "Review Luna’s questions" : "Choose source material"}</h2><p>{questionDrafts ? "Edit, approve, or reject each draft before anything enters your bank." : "Select entire lectures, multiple lectures, or individual slides."}</p></div><button className="icon-button" aria-label="Close question builder" disabled={questionGenerating} onClick={() => setQuestionBuilderOpen(false)}><AppIcon name="x"/></button></header>
            {!questionDrafts ? <>
              <div className="question-builder-options">
                <label><span>Number of questions</span><input type="number" min="1" max="20" value={questionCount} onChange={(event) => setQuestionCount(Math.min(20, Math.max(1, Number(event.target.value) || 1)))}/></label>
                <label className="question-direction"><span>Optional direction for Luna</span><textarea maxLength={2000} value={questionInstruction} onChange={(event) => setQuestionInstruction(event.target.value)} placeholder="For example: Focus on mechanisms and clinical application."/></label>
              </div>
              <div className="question-source-toolbar"><span><strong>{selectedQuestionSourceCount}</strong> source selection{selectedQuestionSourceCount === 1 ? "" : "s"}</span><div><button onClick={() => setQuestionLectureSelection(lectures.map((lecture) => lecture.id), true)}>Select all lectures</button><button onClick={() => { setSelectedQuestionLectureIds(new Set()); setSelectedQuestionSlideKeys(new Set()); }}>Clear</button></div></div>
              <div className="question-source-tree">{academicYears.map((year) => {
                const yearLectures = lectures.filter((lecture) => lecture.academicYear === year);
                if (!yearLectures.length) return null;
                return <section key={year}><h3>{year}</h3>{(coursesByYear[year] ?? []).map((course) => {
                  const courseLectures = yearLectures.filter((lecture) => lecture.course === course);
                  const courseIds = courseLectures.map((lecture) => lecture.id);
                  const courseSelected = courseIds.length > 0 && courseIds.every((id) => selectedQuestionLectureIds.has(id));
                  return <div className="question-source-course" key={course}>
                    <label className="question-source-course-head"><input type="checkbox" checked={courseSelected} onChange={() => setQuestionLectureSelection(courseIds, !courseSelected)}/><strong>{course}</strong><span>{courseLectures.length} lectures</span></label>
                    <div>{courseLectures.map((lecture) => {
                      const wholeLectureSelected = selectedQuestionLectureIds.has(lecture.id);
                      const expanded = expandedQuestionSourceIds.has(lecture.id);
                      const selectedSlideCount = lecture.slides.filter((slide) => selectedQuestionSlideKeys.has(questionSlideKey(lecture.id, slide.page))).length;
                      return <section className="question-source-lecture" key={lecture.id}>
                        <div><label><input type="checkbox" checked={wholeLectureSelected} onChange={(event) => setQuestionLectureSelection([lecture.id], event.target.checked)}/><span><strong>{lecture.title}</strong><small>{lecturerFolderLabel(lecture.lecturer)} · {lecture.slides.length} indexed slides{selectedSlideCount ? ` · ${selectedSlideCount} selected` : ""}</small></span></label><button aria-expanded={expanded} onClick={() => setExpandedQuestionSourceIds((current) => { const next = new Set(current); if (expanded) next.delete(lecture.id); else next.add(lecture.id); return next; })}>{expanded ? "Hide slides" : "Choose slides"}</button></div>
                        {expanded && <div className="question-slide-selection">{lecture.slides.map((slide) => {
                          const checked = wholeLectureSelected || selectedQuestionSlideKeys.has(questionSlideKey(lecture.id, slide.page));
                          return <label key={slide.page}><input type="checkbox" checked={checked} onChange={(event) => toggleQuestionSlide(lecture.id, slide.page, event.target.checked)}/><span><strong>Page {slide.page}</strong><small>{slide.heading || `Slide ${slide.page}`}</small></span></label>;
                        })}</div>}
                      </section>;
                    })}</div>
                  </div>;
                })}</section>;
              })}</div>
              <footer><button disabled={questionGenerating} onClick={() => setQuestionBuilderOpen(false)}>Cancel</button><button className="question-generate-confirm" disabled={questionGenerating || selectedQuestionSourceCount === 0} onClick={() => void generateQuestionDrafts()}>{questionGenerating ? "Luna is drafting…" : `Draft ${questionCount} questions`}</button></footer>
            </> : <>
              <div className="question-review-toolbar"><span><strong>{questionDrafts.filter((draft) => draft.approved).length}</strong> of {questionDrafts.length} approved</span><div><button onClick={() => setQuestionDrafts((current) => current?.map((draft) => ({ ...draft, approved: true })) ?? null)}>Approve all</button><button onClick={() => setQuestionDrafts((current) => current?.map((draft) => ({ ...draft, approved: false })) ?? null)}>Reject all</button></div></div>
              <div className="question-draft-list">{questionDrafts.map((draft, index) => {
                const sourceLecture = lectures.find((lecture) => lecture.id === draft.sourceLectureId);
                return <article className={`question-draft-card ${draft.approved ? "approved" : ""}`} key={draft.id}>
                  <header><label><input type="checkbox" checked={draft.approved} onChange={(event) => updateQuestionDraft(draft.id, { approved: event.target.checked })}/><span>{draft.approved ? "Approved" : "Not approved"}</span></label><small>{sourceLecture?.title ?? "Unknown lecture"} · {draft.sourcePages.map((page) => `p.${page}`).join(", ")}</small><button aria-label={`Remove draft question ${index + 1}`} onClick={() => setQuestionDrafts((current) => current?.filter((item) => item.id !== draft.id) ?? null)}><AppIcon name="trash"/></button></header>
                  <div className="question-draft-fields">
                    <div className="question-draft-type"><span>Question type</span><strong>Multiple choice</strong></div>
                    <label><span>Question</span><textarea value={draft.prompt} onChange={(event) => updateQuestionDraft(draft.id, { prompt: event.target.value })}/></label>
                    {draft.type === "multiple-choice" && <div className="draft-options"><span>Answer choices</span>{draft.options.map((option, optionIndex) => <input key={optionIndex} aria-label={`Answer choice ${optionIndex + 1}`} value={option} onChange={(event) => updateQuestionDraft(draft.id, { options: draft.options.map((item, index) => index === optionIndex ? event.target.value : item) })}/>)}</div>}
                    <label><span>Correct answer</span><textarea value={draft.answer} onChange={(event) => updateQuestionDraft(draft.id, { answer: event.target.value })}/></label>
                    <label><span>Explanation</span><textarea value={draft.explanation} onChange={(event) => updateQuestionDraft(draft.id, { explanation: event.target.value })}/></label>
                  </div>
                </article>;
              })}</div>
              <footer><button onClick={() => setQuestionDrafts(null)}>Back to sources</button><button onClick={() => setQuestionBuilderOpen(false)}>Discard drafts</button><button className="question-generate-confirm" disabled={!questionDrafts.some((draft) => draft.approved && draft.prompt.trim() && draft.answer.trim())} onClick={() => void approveQuestionDrafts()}>Add approved to bank</button></footer>
            </>}
          </section>
        </div>}

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
              <label className="export-sort-option"><span>Order lecture SLOs by</span><select value={sloExportSort} onChange={(event) => setSloExportSort(event.target.value as "week" | "lecturer")}><option value="week">Curriculum week · earliest first</option><option value="lecturer">Lecturer · A–Z</option></select></label>
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
                      const lecturerLectures = courseLectures.filter((lecture) => lecture.lecturer === lecturer).sort((a, b) => compareLectureWeeks(a.week, b.week) || compareText(a.title, b.title));
                      const lecturerIds = lecturerLectures.map((lecture) => lecture.id);
                      const allLecturerSelected = lecturerIds.every((id) => selectedExportLectureIds.has(id));
                      return <section className="export-lecturer" key={lecturer}><label className="export-folder lecturer"><input type="checkbox" checked={allLecturerSelected} onChange={() => setExportLectureSelection(lecturerIds, !allLecturerSelected)}/><strong>{lecturerFolderLabel(lecturer)}</strong><span>{lecturerLectures.length}</span></label>
                        <div>{lecturerLectures.map((lecture) => <label className="export-lecture" key={lecture.id} htmlFor={`export-lecture-${lecture.id}`} aria-label={`Select ${lecture.title}`}><input id={`export-lecture-${lecture.id}`} type="checkbox" checked={selectedExportLectureIds.has(lecture.id)} onChange={(event) => setExportLectureSelection([lecture.id], event.target.checked)}/><span><strong>{lecture.title}</strong><small>{lectureWeekLabel(lecture.week)} · {lecture.slos.length} SLOs</small></span></label>)}</div>
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
            <header className="viewer-toolbar"><div><small>{viewerLecture.title}</small><strong>PDF page {selectedPage} of {viewerLecture.pages}</strong></div><div className="viewer-controls"><button disabled={selectedPage <= 1} onClick={() => selectViewerPage(selectedPage - 1)}>Previous</button><label className="page-jump"><span>Page</span><input aria-label="PDF page number" type="number" min="1" max={viewerLecture.pages} value={selectedPage} onChange={(event) => selectViewerPage(Number(event.target.value) || 1)} /></label><button disabled={selectedPage >= viewerLecture.pages} onClick={() => selectViewerPage(selectedPage + 1)}>Next</button><button onClick={() => openQuestionBuilder(viewerLecture.id, selectedPage)}>Draft question</button><button className={`pen-toggle ${penEnabled ? "active" : ""}`} aria-pressed={penEnabled} onClick={() => { setPenEnabled((current) => !current); window.getSelection()?.removeAllRanges(); }}>{penEnabled ? "Pen on" : "Pen"}</button>{viewerPageInk.length > 0 && <button onClick={() => saveCurrentInk(viewerPageInk.slice(0, -1))}>Undo ink</button>}<button className={`mark-slide ${currentSlideIsMarked ? "marked" : ""}`} aria-pressed={currentSlideIsMarked} onClick={toggleCurrentSlideMark}><AppIcon name="bookmark"/>{currentSlideIsMarked ? "Marked" : "Mark slide"}</button></div></header>
            {viewerFile && viewerFileLectureId === viewerLecture.id ? <PdfCanvasViewer key={viewerLecture.id} file={viewerFile} lectureId={viewerLecture.id} page={selectedPage} inkStrokes={viewerPageInk} penEnabled={penEnabled} onInkChange={saveCurrentInk} /> : <div className="slide-fallback"><span className="result-page">{selectedSlide.page}</span><h2>{selectedSlide.heading}</h2><p>{selectedSlide.text || "Loading the selected lecture…"}</p><small>Uploaded PDFs are stored locally and displayed page-for-page here.</small></div>}
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
