import { supabase } from "./supabase-client";

export type Slide = { page: number; text: string; heading: string };
export type InkPoint = { x: number; y: number };
export type InkStroke = { id: string; points: InkPoint[] };

export type Lecture = {
  id: string;
  title: string;
  lecturer: string;
  date: string;
  course: string;
  academicYear: string;
  favorite: boolean;
  pages: number;
  slos: string[];
  concepts: string[];
  outline: string[];
  summary: string;
  slides: Slide[];
  notes: Record<number, string>;
  markups: Record<number, InkStroke[]>;
  markedSlides: number[];
  flaggedSLOs: number[];
  fileName?: string;
  createdAt: string;
};

export type PreReadStatus = "unread" | "read" | "rereview";

export type PreRead = {
  id: string;
  title: string;
  author: string;
  course: string;
  academicYear: string;
  sourceType: "pdf" | "web";
  sourceUrl?: string;
  text: string;
  pages: Slide[];
  status: PreReadStatus;
  fileName?: string;
  createdAt: string;
};

export type ConceptRecord = {
  id: string;
  text: string;
  lectureId: string;
  page: number;
  archived: boolean;
  createdAt: string;
};

const DB_NAME = "medlibrary-local";
const DB_VERSION = 3;
const CLOUD_BUCKET = "fcom-library";

let cloudUserId: string | null = null;

export type CloudLibrary = {
  lectures: Lecture[];
  preReads: PreRead[];
  concepts: ConceptRecord[];
};

export type MigrationProgress = {
  completed: number;
  total: number;
  label: string;
};

export function setCloudUser(userId: string | null) {
  cloudUserId = userId;
}

function cloudFilePath(kind: "lectures" | "prereads", id: string) {
  if (!cloudUserId) throw new Error("Sign in before accessing cloud files.");
  return `${cloudUserId}/${kind}/${id}.pdf`;
}

function announceCloudStatus(name: "fcom-cloud-sync-ok" | "fcom-cloud-sync-error", detail: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(name, { detail }));
}

async function attemptCloudSync(action: () => Promise<void>) {
  if (!supabase || !cloudUserId) return;
  try {
    await action();
    announceCloudStatus("fcom-cloud-sync-ok", "Saved to cloud");
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Cloud sync failed.";
    console.error("FCOM.lib cloud sync failed", error);
    announceCloudStatus("fcom-cloud-sync-error", `${detail} Your change is still saved on this device.`);
  }
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("lectures")) db.createObjectStore("lectures", { keyPath: "id" });
      if (!db.objectStoreNames.contains("files")) db.createObjectStore("files", { keyPath: "id" });
      if (!db.objectStoreNames.contains("prereads")) db.createObjectStore("prereads", { keyPath: "id" });
      if (!db.objectStoreNames.contains("prereadFiles")) db.createObjectStore("prereadFiles", { keyPath: "id" });
      if (!db.objectStoreNames.contains("concepts")) db.createObjectStore("concepts", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function textValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function textList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function normalizeSlides(value: unknown): Slide[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const page = typeof record.page === "number" && Number.isInteger(record.page) && record.page > 0 ? record.page : index + 1;
    return [{ page, heading: textValue(record.heading, `Slide ${page}`), text: typeof record.text === "string" ? record.text : "" }];
  });
}

function normalizeNotes(value: unknown): Record<number, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([page, note]) => Number.isInteger(Number(page)) && typeof note === "string")) as Record<number, string>;
}

function normalizeMarkups(value: unknown): Record<number, InkStroke[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries = Object.entries(value).flatMap(([page, strokes]) => {
    if (!Number.isInteger(Number(page)) || !Array.isArray(strokes)) return [];
    const normalized = strokes.flatMap((stroke) => {
      if (!stroke || typeof stroke !== "object") return [];
      const record = stroke as Record<string, unknown>;
      if (!Array.isArray(record.points)) return [];
      const points = record.points.flatMap((point) => {
        if (!point || typeof point !== "object") return [];
        const candidate = point as Record<string, unknown>;
        if (typeof candidate.x !== "number" || typeof candidate.y !== "number" || !Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) return [];
        return [{ x: Math.min(1, Math.max(0, candidate.x)), y: Math.min(1, Math.max(0, candidate.y)) }];
      });
      return points.length ? [{ id: textValue(record.id, crypto.randomUUID()), points }] : [];
    });
    return normalized.length ? [[Number(page), normalized] as const] : [];
  });
  return Object.fromEntries(entries);
}

export function normalizeLecture(value: unknown): Lecture | null {
  if (!value || typeof value !== "object") return null;
  const lecture = value as Record<string, unknown>;
  const id = textValue(lecture.id);
  if (!id) return null;
  const slides = normalizeSlides(lecture.slides);
  const requestedPages = typeof lecture.pages === "number" && Number.isFinite(lecture.pages) ? Math.max(1, Math.floor(lecture.pages)) : 0;
  const detectedPages = slides.reduce((maximum, slide) => Math.max(maximum, slide.page), 0);
  const markedSlides = Array.isArray(lecture.markedSlides)
    ? Array.from(new Set(lecture.markedSlides.filter((page): page is number => typeof page === "number" && Number.isInteger(page) && page > 0))).sort((a, b) => a - b)
    : [];
  const flaggedSLOs = Array.isArray(lecture.flaggedSLOs)
    ? Array.from(new Set(lecture.flaggedSLOs.filter((index): index is number => typeof index === "number" && Number.isInteger(index) && index >= 0)))
    : [];
  return {
    id,
    title: textValue(lecture.title, "Untitled lecture"),
    lecturer: textValue(lecture.lecturer, "Lecturer not detected"),
    date: textValue(lecture.date, "Date not detected"),
    course: textValue(lecture.course, "Unsorted"),
    academicYear: textValue(lecture.academicYear, "2026-2027"),
    favorite: Boolean(lecture.favorite),
    pages: Math.max(requestedPages, detectedPages, 1),
    slos: textList(lecture.slos),
    concepts: textList(lecture.concepts),
    outline: textList(lecture.outline),
    summary: textValue(lecture.summary, "No lecture summary is available yet."),
    slides,
    notes: normalizeNotes(lecture.notes),
    markups: normalizeMarkups(lecture.markups),
    markedSlides,
    flaggedSLOs,
    fileName: typeof lecture.fileName === "string" ? lecture.fileName : undefined,
    createdAt: textValue(lecture.createdAt, new Date(0).toISOString()),
  };
}

function normalizePreRead(value: unknown): PreRead | null {
  if (!value || typeof value !== "object") return null;
  const preRead = value as Record<string, unknown>;
  const id = textValue(preRead.id);
  if (!id) return null;
  const sourceType = preRead.sourceType === "pdf" ? "pdf" : "web";
  const status: PreReadStatus = preRead.status === "read" || preRead.status === "rereview" ? preRead.status : "unread";
  return {
    id,
    title: textValue(preRead.title, "Untitled pre-read"),
    author: textValue(preRead.author, "Author not listed"),
    course: textValue(preRead.course, "Unsorted"),
    academicYear: textValue(preRead.academicYear, "2026-2027"),
    sourceType,
    sourceUrl: typeof preRead.sourceUrl === "string" && preRead.sourceUrl.trim() ? preRead.sourceUrl.trim() : undefined,
    text: typeof preRead.text === "string" ? preRead.text : "",
    pages: normalizeSlides(preRead.pages),
    status,
    fileName: typeof preRead.fileName === "string" ? preRead.fileName : undefined,
    createdAt: textValue(preRead.createdAt, new Date(0).toISOString()),
  };
}

function normalizeConcept(value: unknown): ConceptRecord | null {
  if (!value || typeof value !== "object") return null;
  const concept = value as Record<string, unknown>;
  const id = textValue(concept.id);
  const text = textValue(concept.text);
  const lectureId = textValue(concept.lectureId);
  if (!id || !text || !lectureId) return null;
  return {
    id,
    text,
    lectureId,
    page: typeof concept.page === "number" && Number.isInteger(concept.page) && concept.page > 0 ? concept.page : 1,
    archived: Boolean(concept.archived),
    createdAt: textValue(concept.createdAt, new Date(0).toISOString()),
  };
}

async function uploadCloudFile(kind: "lectures" | "prereads", id: string, file: Blob) {
  if (!supabase || !cloudUserId) return null;
  const path = cloudFilePath(kind, id);
  const { error } = await supabase.storage.from(CLOUD_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || "application/pdf",
    cacheControl: "3600",
  });
  if (error) throw error;
  return path;
}

async function upsertCloudLecture(lecture: Lecture, file?: Blob) {
  if (!supabase || !cloudUserId) return;
  const filePath = lecture.fileName ? cloudFilePath("lectures", lecture.id) : null;
  if (file) await uploadCloudFile("lectures", lecture.id, file);
  const { error } = await supabase.from("fcom_lectures").upsert({
    user_id: cloudUserId,
    id: lecture.id,
    data: lecture,
    file_path: filePath,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,id" });
  if (error) throw error;
}

async function upsertCloudPreRead(preRead: PreRead, file?: Blob) {
  if (!supabase || !cloudUserId) return;
  const filePath = preRead.sourceType === "pdf" && preRead.fileName ? cloudFilePath("prereads", preRead.id) : null;
  if (file) await uploadCloudFile("prereads", preRead.id, file);
  const { error } = await supabase.from("fcom_prereads").upsert({
    user_id: cloudUserId,
    id: preRead.id,
    data: preRead,
    file_path: filePath,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,id" });
  if (error) throw error;
}

async function upsertCloudConcept(concept: ConceptRecord) {
  if (!supabase || !cloudUserId) return;
  const { error } = await supabase.from("fcom_concepts").upsert({
    user_id: cloudUserId,
    id: concept.id,
    data: concept,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,id" });
  if (error) throw error;
}

async function downloadCloudFile(kind: "lectures" | "prereads", id: string) {
  if (!supabase || !cloudUserId) return null;
  const { data, error } = await supabase.storage.from(CLOUD_BUCKET).download(cloudFilePath(kind, id));
  if (error) {
    if (/not found|object not found/i.test(error.message)) return null;
    throw error;
  }
  return data;
}

async function removeCloudRecord(table: "fcom_lectures" | "fcom_prereads" | "fcom_concepts", id: string, fileKind?: "lectures" | "prereads") {
  if (!supabase || !cloudUserId) return;
  if (fileKind) {
    const { error: fileError } = await supabase.storage.from(CLOUD_BUCKET).remove([cloudFilePath(fileKind, id)]);
    if (fileError && !/not found|object not found/i.test(fileError.message)) throw fileError;
  }
  const { error } = await supabase.from(table).delete().eq("user_id", cloudUserId).eq("id", id);
  if (error) throw error;
}

async function getLocalLectureFile(id: string): Promise<Blob | null> {
  const db = await openDatabase();
  const record = await requestResult(db.transaction("files", "readonly").objectStore("files").get(id)) as { file?: Blob } | undefined;
  db.close();
  return record?.file ?? null;
}

async function getLocalPreReadFile(id: string): Promise<Blob | null> {
  const db = await openDatabase();
  const record = await requestResult(db.transaction("prereadFiles", "readonly").objectStore("prereadFiles").get(id)) as { file?: Blob } | undefined;
  db.close();
  return record?.file ?? null;
}

export async function loadLectures(): Promise<Lecture[]> {
  const db = await openDatabase();
  const tx = db.transaction("lectures", "readonly");
  const lectures = await requestResult(tx.objectStore("lectures").getAll()) as unknown[];
  db.close();
  return lectures
    .map(normalizeLecture)
    .filter((lecture): lecture is Lecture => lecture !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveLecture(lecture: Lecture, file?: Blob) {
  const normalized = normalizeLecture(lecture);
  if (!normalized) throw new Error("This lecture could not be normalized before saving.");
  const db = await openDatabase();
  const tx = db.transaction(["lectures", "files"], "readwrite");
  tx.objectStore("lectures").put(normalized);
  if (file) tx.objectStore("files").put({ id: normalized.id, file });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  await attemptCloudSync(() => upsertCloudLecture(normalized, file));
  return normalized;
}

export async function saveLectures(lectures: Lecture[]) {
  const db = await openDatabase();
  const tx = db.transaction("lectures", "readwrite");
  const store = tx.objectStore("lectures");
  lectures.forEach((lecture) => store.put(lecture));
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getLectureFile(id: string): Promise<Blob | null> {
  const local = await getLocalLectureFile(id);
  if (local) return local;
  const cloud = await downloadCloudFile("lectures", id);
  if (!cloud) return null;
  const db = await openDatabase();
  const tx = db.transaction("files", "readwrite");
  tx.objectStore("files").put({ id, file: cloud });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return cloud;
}

export async function deleteLecture(id: string) {
  const db = await openDatabase();
  const tx = db.transaction(["lectures", "files"], "readwrite");
  tx.objectStore("lectures").delete(id);
  tx.objectStore("files").delete(id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  await attemptCloudSync(() => removeCloudRecord("fcom_lectures", id, "lectures"));
}

export async function loadPreReads(): Promise<PreRead[]> {
  const db = await openDatabase();
  const tx = db.transaction("prereads", "readonly");
  const preReads = await requestResult(tx.objectStore("prereads").getAll()) as unknown[];
  db.close();
  return preReads
    .map(normalizePreRead)
    .filter((preRead): preRead is PreRead => preRead !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function savePreRead(preRead: PreRead, file?: Blob) {
  const db = await openDatabase();
  const tx = db.transaction(["prereads", "prereadFiles"], "readwrite");
  tx.objectStore("prereads").put(preRead);
  if (file) tx.objectStore("prereadFiles").put({ id: preRead.id, file });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  await attemptCloudSync(() => upsertCloudPreRead(preRead, file));
}

export async function getPreReadFile(id: string): Promise<Blob | null> {
  const local = await getLocalPreReadFile(id);
  if (local) return local;
  const cloud = await downloadCloudFile("prereads", id);
  if (!cloud) return null;
  const db = await openDatabase();
  const tx = db.transaction("prereadFiles", "readwrite");
  tx.objectStore("prereadFiles").put({ id, file: cloud });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return cloud;
}

export async function deletePreRead(id: string) {
  const db = await openDatabase();
  const tx = db.transaction(["prereads", "prereadFiles"], "readwrite");
  tx.objectStore("prereads").delete(id);
  tx.objectStore("prereadFiles").delete(id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  await attemptCloudSync(() => removeCloudRecord("fcom_prereads", id, "prereads"));
}

export async function loadConcepts(): Promise<ConceptRecord[]> {
  const db = await openDatabase();
  const concepts = await requestResult(db.transaction("concepts", "readonly").objectStore("concepts").getAll()) as unknown[];
  db.close();
  return concepts
    .map(normalizeConcept)
    .filter((concept): concept is ConceptRecord => concept !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function saveConcept(concept: ConceptRecord) {
  const db = await openDatabase();
  const tx = db.transaction("concepts", "readwrite");
  tx.objectStore("concepts").put(concept);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  await attemptCloudSync(() => upsertCloudConcept(concept));
}

async function cacheCloudLibrary(library: CloudLibrary) {
  const db = await openDatabase();
  const tx = db.transaction(["lectures", "prereads", "concepts"], "readwrite");
  const lectureStore = tx.objectStore("lectures");
  const preReadStore = tx.objectStore("prereads");
  const conceptStore = tx.objectStore("concepts");
  library.lectures.forEach((lecture) => lectureStore.put(lecture));
  library.preReads.forEach((preRead) => preReadStore.put(preRead));
  library.concepts.forEach((concept) => conceptStore.put(concept));
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadCloudLibrary(): Promise<CloudLibrary> {
  if (!supabase || !cloudUserId) return { lectures: [], preReads: [], concepts: [] };
  const [lectureResult, preReadResult, conceptResult] = await Promise.all([
    supabase.from("fcom_lectures").select("data").eq("user_id", cloudUserId).order("updated_at", { ascending: false }),
    supabase.from("fcom_prereads").select("data").eq("user_id", cloudUserId).order("updated_at", { ascending: false }),
    supabase.from("fcom_concepts").select("data").eq("user_id", cloudUserId).order("updated_at", { ascending: false }),
  ]);
  const error = lectureResult.error ?? preReadResult.error ?? conceptResult.error;
  if (error) throw error;
  const lectures = (lectureResult.data ?? [])
    .map((row) => normalizeLecture((row as { data?: unknown }).data))
    .filter((lecture): lecture is Lecture => lecture !== null);
  const preReads = (preReadResult.data ?? [])
    .map((row) => normalizePreRead((row as { data?: unknown }).data))
    .filter((preRead): preRead is PreRead => preRead !== null);
  const concepts = (conceptResult.data ?? [])
    .map((row) => normalizeConcept((row as { data?: unknown }).data))
    .filter((concept): concept is ConceptRecord => concept !== null);
  const library = { lectures, preReads, concepts };
  await cacheCloudLibrary(library);
  return library;
}

export async function migrateLocalLibraryToCloud(onProgress?: (progress: MigrationProgress) => void) {
  if (!supabase || !cloudUserId) throw new Error("Sign in before migrating this device.");
  const [lectures, preReads, concepts] = await Promise.all([loadLectures(), loadPreReads(), loadConcepts()]);
  const total = lectures.length + preReads.length + concepts.length;
  let completed = 0;
  const report = (label: string) => {
    completed += 1;
    onProgress?.({ completed, total, label });
  };
  for (const lecture of lectures) {
    const file = await getLocalLectureFile(lecture.id);
    await upsertCloudLecture(lecture, file ?? undefined);
    report(lecture.title);
  }
  for (const preRead of preReads) {
    const file = await getLocalPreReadFile(preRead.id);
    await upsertCloudPreRead(preRead, file ?? undefined);
    report(preRead.title);
  }
  for (const concept of concepts) {
    await upsertCloudConcept(concept);
    report(concept.text);
  }
  const library = await loadCloudLibrary();
  announceCloudStatus("fcom-cloud-sync-ok", "Device library migrated");
  return { library, counts: { lectures: lectures.length, preReads: preReads.length, concepts: concepts.length } };
}
