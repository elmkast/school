"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { compareText, lectureWeekLabel } from "../../lib/curriculum";
import { getLectureFile, type Lecture } from "../../lib/lecture-store";
import { pdfjs } from "../../lib/pdf-runtime";

type GalleryGroup = { key: string; academicYear: string; course: string; week: number | null; lectures: Lecture[] };
const lectureThumbnailCache = new Map<string, string>();

function compareNewestWeeks(left: number | null, right: number | null) {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return right - left;
}

function LectureFirstPage({ lecture }: { lecture: Lecture }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [thumbnail, setThumbnail] = useState(() => lectureThumbnailCache.get(lecture.id) ?? "");
  const [visible, setVisible] = useState(Boolean(thumbnail));
  const [status, setStatus] = useState<"waiting" | "loading" | "ready" | "missing">(thumbnail ? "ready" : "waiting");

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setVisible(true);
      observer.disconnect();
    }, { rootMargin: "420px" });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || thumbnail || !canvasRef.current) return;
    let cancelled = false;
    let document: { destroy(): Promise<void> } | null = null;
    setStatus("loading");
    void (async () => {
      const file = await getLectureFile(lecture.id);
      if (!file) { if (!cancelled) setStatus("missing"); return; }
      const loaded = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      document = loaded;
      const page = await loaded.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(420 / base.width, 1.25);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      const context = canvas.getContext("2d");
      if (!context) return;
      const outputScale = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
      canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
      await page.render({ canvas, canvasContext: context, viewport, transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0] }).promise;
      if (!cancelled) {
        const rendered = canvas.toDataURL("image/jpeg", .82);
        lectureThumbnailCache.set(lecture.id, rendered);
        setThumbnail(rendered);
        setStatus("ready");
      }
    })().catch(() => { if (!cancelled) setStatus("missing"); }).finally(() => { void document?.destroy(); });
    return () => { cancelled = true; };
  }, [lecture.id, thumbnail, visible]);

  return <div className={`lecture-gallery-live-preview ${status}`} ref={hostRef} style={thumbnail ? { backgroundImage: `url(${thumbnail})` } : undefined}>
    {!thumbnail && <canvas ref={canvasRef} aria-hidden="true" />}
    {status !== "ready" && <span>{status === "missing" ? "PDF preview unavailable" : "Loading first page…"}</span>}
  </div>;
}

export function LectureGallery({ lectures, onOpen }: { lectures: Lecture[]; onOpen(lecture: Lecture): void }) {
  const groups = useMemo(() => {
    const grouped = new Map<string, GalleryGroup>();
    lectures.forEach((lecture) => {
      const key = `${lecture.academicYear}::${lecture.course}::${lecture.week ?? "unassigned"}`;
      const existing = grouped.get(key);
      if (existing) existing.lectures.push(lecture);
      else grouped.set(key, { key, academicYear: lecture.academicYear, course: lecture.course, week: lecture.week, lectures: [lecture] });
    });
    return Array.from(grouped.values())
      .sort((a, b) => compareText(b.academicYear, a.academicYear) || compareText(a.course, b.course) || compareNewestWeeks(a.week, b.week))
      .map((group) => ({ ...group, lectures: [...group.lectures].sort((a, b) => compareText(a.title, b.title)) }));
  }, [lectures]);

  return <div className="lecture-gallery-prototype lecture-gallery-live">
    <header><div><small>FCOM.LIB</small><strong>Lecture archive</strong></div><p>First-page previews · grouped by course and curriculum week</p></header>
    {groups.length > 0 ? <div className="lecture-gallery-groups">{groups.map((group) => <section key={group.key}>
      <div className="lecture-gallery-heading"><h3>{group.course}</h3><span>{lectureWeekLabel(group.week)}</span><small>{group.academicYear}</small></div>
      <div className="lecture-gallery-grid">{group.lectures.map((lecture) => <button type="button" className="lecture-gallery-item" key={lecture.id} aria-label={`Open ${lecture.title}`} onClick={() => onOpen(lecture)}>
        <LectureFirstPage lecture={lecture}/><span className="lecture-gallery-caption"><strong>{lecture.title}</strong><small>{lecture.lecturer}</small></span>
      </button>)}</div>
    </section>)}</div> : <div className="lecture-gallery-empty"><strong>No lectures yet</strong><span>Add a PDF to begin your visual library.</span></div>}
  </div>;
}
