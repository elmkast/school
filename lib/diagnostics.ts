const DIAGNOSTIC_STORAGE_KEY = "fcom-lib-diagnostics-v1";
const ACTIVE_UPLOAD_STORAGE_KEY = "fcom-lib-active-upload-v1";
const MAX_DIAGNOSTIC_EVENTS = 120;

export type DiagnosticKind = "app" | "render-error" | "runtime-error" | "promise-error" | "upload" | "cloud-error";

export type DiagnosticEvent = {
  id: string;
  timestamp: string;
  kind: DiagnosticKind;
  message: string;
  context?: Record<string, unknown>;
};

function redact(value: string) {
  return value
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[REDACTED_OPENAI_KEY]")
    .replace(/\bsb_(?:publishable|secret)_[A-Za-z0-9_-]{12,}\b/g, "[REDACTED_SUPABASE_KEY]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]");
}

function safeText(value: unknown) {
  if (value instanceof Error) return redact(`${value.name}: ${value.message}\n${value.stack ?? ""}`.trim());
  if (typeof value === "string") return redact(value);
  try { return redact(JSON.stringify(value)); } catch { return String(value); }
}

function readStoredEvents(): DiagnosticEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DIAGNOSTIC_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordDiagnostic(kind: DiagnosticKind, message: string, context?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const event: DiagnosticEvent = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    kind,
    message: safeText(message),
    context: context ? Object.fromEntries(Object.entries(context).map(([key, value]) => [key, safeText(value)])) : undefined,
  };
  try {
    const events = [...readStoredEvents(), event].slice(-MAX_DIAGNOSTIC_EVENTS);
    window.localStorage.setItem(DIAGNOSTIC_STORAGE_KEY, JSON.stringify(events));
  } catch {
    // Diagnostics must never cause a second application failure.
  }
}

export function setUploadDiagnosticCheckpoint(stage: string, context: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVE_UPLOAD_STORAGE_KEY, JSON.stringify({ stage, timestamp: new Date().toISOString(), ...context }));
  } catch { /* Uploads should continue even when local storage is unavailable. */ }
}

export function clearUploadDiagnosticCheckpoint() {
  if (typeof window !== "undefined") window.localStorage.removeItem(ACTIVE_UPLOAD_STORAGE_KEY);
}

function diagnosticSnapshot() {
  const memory = performance as Performance & { memory?: { jsHeapSizeLimit?: number; totalJSHeapSize?: number; usedJSHeapSize?: number } };
  return {
    exportedAt: new Date().toISOString(),
    app: "FCOM.lib",
    version: "0.1.0",
    location: window.location.origin + window.location.pathname,
    online: navigator.onLine,
    userAgent: navigator.userAgent,
    memory: memory.memory ? {
      jsHeapSizeLimit: memory.memory.jsHeapSizeLimit,
      totalJSHeapSize: memory.memory.totalJSHeapSize,
      usedJSHeapSize: memory.memory.usedJSHeapSize,
    } : "Unavailable in this browser",
    privacy: "No PDF contents, slide text, notes, passwords, or API keys are intentionally included.",
    events: readStoredEvents(),
  };
}

export function downloadDiagnostics() {
  if (typeof window === "undefined") return;
  recordDiagnostic("app", "Diagnostics exported by user");
  const blob = new Blob([JSON.stringify(diagnosticSnapshot(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `fcom-lib-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function installGlobalDiagnostics() {
  if (typeof window === "undefined") return () => undefined;
  const onError = (event: ErrorEvent) => recordDiagnostic("runtime-error", event.message || "Uncaught JavaScript error", {
    error: event.error instanceof Error ? event.error : event.message,
    source: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : "Unknown source",
  });
  const onRejection = (event: PromiseRejectionEvent) => recordDiagnostic("promise-error", "Unhandled promise rejection", { reason: event.reason });
  const onCloudError = (event: Event) => recordDiagnostic("cloud-error", "Cloud synchronization failed", { detail: (event as CustomEvent).detail });
  const interruptedUpload = window.localStorage.getItem(ACTIVE_UPLOAD_STORAGE_KEY);
  if (interruptedUpload) {
    try { recordDiagnostic("upload", "The previous session ended before an upload finished", JSON.parse(interruptedUpload)); }
    catch { recordDiagnostic("upload", "The previous session ended before an upload finished"); }
    window.localStorage.removeItem(ACTIVE_UPLOAD_STORAGE_KEY);
  }
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  window.addEventListener("fcom-cloud-sync-error", onCloudError);
  recordDiagnostic("app", "Application started");
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    window.removeEventListener("fcom-cloud-sync-error", onCloudError);
  };
}
