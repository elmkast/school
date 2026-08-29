import { supabase } from "./supabase-client";
import { lectureWeekValue } from "./curriculum";

export type Slide = { page: number; text: string; heading: string };
export type InkPoint = { x: number; y: number };
export type InkStroke = { id: string; points: InkPoint[] };
export type SloStrength = "weak" | "okay" | "strong";

export type Lecture = {
  id: string;
  title: string;
  lecturer: string;
  week: number | null;
  course: string;
  academicYear: string;
  favorite: boolean;
  pages: number;
  slos: string[];
  outline: string[];
  summary: string;
  slides: Slide[];
  notes: Record<number, string>;
  markups: Record<number, InkStroke[]>;
  markedSlides: number[];
  flaggedSLOs: number[];
  sloStrengths: Record<number, SloStrength>;
  studySLOs: number[];
  fileName?: string;
  createdAt: string;
};

const DB_NAME = "medlibrary-local";
const DB_VERSION = 3;
const CLOUD_BUCKET = "fcom-library";

let cloudUserId: string | null = null;

export type CloudLibrary = {
  lectures: Lecture[];
};

export type MigrationProgress = {
  completed: number;
  total: number;
  label: string;
};

export function setCloudUser(userId: string | null) {
  cloudUserId = userId;
}

function cloudFilePath(kind: "lectures", id: string) {
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

function normalizeSloStrengths(value: unknown): Record<number, SloStrength> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([index, strength]) => Number.isInteger(Number(index)) && Number(index) >= 0 && (strength === "weak" || strength === "okay" || strength === "strong"))) as Record<number, SloStrength>;
}

function normalizeSloIndexes(value: unknown) {
  return Array.isArray(value)
    ? Array.from(new Set(value.filter((index): index is number => typeof index === "number" && Number.isInteger(index) && index >= 0))).sort((a, b) => a - b)
    : [];
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
  const flaggedSLOs = normalizeSloIndexes(lecture.flaggedSLOs);
  const studySLOs = normalizeSloIndexes(lecture.studySLOs);
  return {
    id,
    title: textValue(lecture.title, "Untitled lecture"),
    lecturer: textValue(lecture.lecturer, "Lecturer not detected"),
    week: lectureWeekValue(lecture.week),
    course: textValue(lecture.course, "Unsorted"),
    academicYear: textValue(lecture.academicYear, "2026-2027"),
    favorite: Boolean(lecture.favorite),
    pages: Math.max(requestedPages, detectedPages, 1),
    slos: textList(lecture.slos),
    outline: textList(lecture.outline),
    summary: textValue(lecture.summary, "No lecture summary is available yet."),
    slides,
    notes: normalizeNotes(lecture.notes),
    markups: normalizeMarkups(lecture.markups),
    markedSlides,
    flaggedSLOs,
    sloStrengths: normalizeSloStrengths(lecture.sloStrengths),
    studySLOs,
    fileName: typeof lecture.fileName === "string" ? lecture.fileName : undefined,
    createdAt: textValue(lecture.createdAt, new Date(0).toISOString()),
  };
}

async function uploadCloudFile(kind: "lectures", id: string, file: Blob) {
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

async function downloadCloudFile(kind: "lectures", id: string) {
  if (!supabase || !cloudUserId) return null;
  const { data, error } = await supabase.storage.from(CLOUD_BUCKET).download(cloudFilePath(kind, id));
  if (error) {
    if (/not found|object not found/i.test(error.message)) return null;
    throw error;
  }
  return data;
}

async function removeCloudRecord(table: "fcom_lectures", id: string, fileKind?: "lectures") {
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

export async function loadLectures(): Promise<Lecture[]> {
  const db = await openDatabase();
  const tx = db.transaction(["lectures", "prereads"], "readwrite");
  const lectureStore = tx.objectStore("lectures");
  const lectures = await requestResult(lectureStore.getAll()) as unknown[];
  const normalized = lectures.map(normalizeLecture).filter((lecture): lecture is Lecture => lecture !== null);
  normalized.forEach((lecture) => lectureStore.put(lecture));
  const retiredPreReadStore = tx.objectStore("prereads");
  const retiredPreReads = await requestResult(retiredPreReadStore.getAll()) as Record<string, unknown>[];
  retiredPreReads.forEach((preRead) => {
    if (Array.isArray(preRead.questions) && preRead.questions.length) {
      const cleaned = { ...preRead };
      delete cleaned.questions;
      retiredPreReadStore.put(cleaned);
    }
  });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  return normalized.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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

async function cacheCloudLibrary(library: CloudLibrary) {
  const db = await openDatabase();
  const tx = db.transaction("lectures", "readwrite");
  const lectureStore = tx.objectStore("lectures");
  library.lectures.forEach((lecture) => lectureStore.put(lecture));
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function loadCloudLibrary(): Promise<CloudLibrary> {
  if (!supabase || !cloudUserId) return { lectures: [] };
  const [lectureResult, preReadResult] = await Promise.all([
    supabase.from("fcom_lectures").select("id,data").eq("user_id", cloudUserId).order("updated_at", { ascending: false }),
    supabase.from("fcom_prereads").select("id,data").eq("user_id", cloudUserId),
  ]);
  const error = lectureResult.error ?? preReadResult.error;
  if (error) throw error;
  const lectureRows = lectureResult.data ?? [];
  const lectures = lectureRows
    .map((row) => normalizeLecture((row as { data?: unknown }).data))
    .filter((lecture): lecture is Lecture => lecture !== null);
  const dirtyLectures = lectureRows.filter((row) => {
    const data = (row as { data?: unknown }).data;
    return Boolean(data && typeof data === "object" && Array.isArray((data as Record<string, unknown>).questions) && (data as Record<string, unknown>).questions instanceof Array && ((data as Record<string, unknown>).questions as unknown[]).length);
  });
  const dirtyPreReads = (preReadResult.data ?? []).flatMap((row) => {
    const record = row as { id?: string; data?: unknown };
    if (!record.id || !record.data || typeof record.data !== "object") return [];
    const data = record.data as Record<string, unknown>;
    if (!Array.isArray(data.questions) || !data.questions.length) return [];
    const cleaned = { ...data };
    delete cleaned.questions;
    return [{ user_id: cloudUserId, id: record.id, data: cleaned, updated_at: new Date().toISOString() }];
  });
  await Promise.all([
    ...dirtyLectures.map((row) => {
      const id = (row as { id: string }).id;
      const lecture = lectures.find((item) => item.id === id);
      return lecture ? upsertCloudLecture(lecture) : Promise.resolve();
    }),
    dirtyPreReads.length ? supabase.from("fcom_prereads").upsert(dirtyPreReads, { onConflict: "user_id,id" }).then(({ error }) => { if (error) throw error; }) : Promise.resolve(),
  ]);
  const library = { lectures };
  await cacheCloudLibrary(library);
  return library;
}

export async function migrateLocalLibraryToCloud(onProgress?: (progress: MigrationProgress) => void) {
  if (!supabase || !cloudUserId) throw new Error("Sign in before migrating this device.");
  const lectures = await loadLectures();
  const total = lectures.length;
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
  const library = await loadCloudLibrary();
  announceCloudStatus("fcom-cloud-sync-ok", "Device library migrated");
  return { library, counts: { lectures: lectures.length } };
}
