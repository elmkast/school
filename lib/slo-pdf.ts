import type { Lecture } from "./lecture-store";

type PdfLine = { text: string; x: number; y: number; size: number; bold?: boolean };
type PdfBox = { x: number; y: number; boxWidth: number; boxHeight: number; lineWidth?: number };
type PdfElement = PdfLine | PdfBox;

export type SloPdfOptions = {
  includeProgressTracker?: boolean;
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const BOTTOM_LIMIT = MARGIN + 24;
const PAGE_BODY_HEIGHT = PAGE_HEIGHT - MARGIN - BOTTOM_LIMIT;
const OBJECTIVE_TEXT_X = MARGIN + 25;
const TRACKER_BOX_WIDTH = 34;
const TRACKER_BOX_HEIGHT = 14;
const TRACKER_BOX_GAP = 4;
const TRACKER_LABELS = ["Strong", "O.K.", "Weak"] as const;
const TRACKER_WIDTH = TRACKER_LABELS.length * TRACKER_BOX_WIDTH + (TRACKER_LABELS.length - 1) * TRACKER_BOX_GAP;
const TRACKER_X = PAGE_WIDTH - MARGIN - TRACKER_WIDTH;

function asciiText(value: string) {
  const replacements: Record<string, string> = {
    "α": "alpha", "β": "beta", "γ": "gamma", "δ": "delta", "Δ": "Delta", "μ": "micro", "±": "+/-",
    "–": "-", "—": "-", "−": "-", "“": '"', "”": '"', "‘": "'", "’": "'", "…": "...", "•": "-",
  };
  return value
    .split("")
    .map((character) => replacements[character] ?? character)
    .join("")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\s+/g, " ")
    .trim();
}

function escapePdfText(value: string) {
  return asciiText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapText(value: string, size: number, width: number) {
  const words = asciiText(value).split(/\s+/).filter(Boolean);
  const maximumCharacters = Math.max(12, Math.floor(width / (size * 0.52)));
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) current = word;
    else if (`${current} ${word}`.length <= maximumCharacters) current += ` ${word}`;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function wrappedHeight(value: string, size: number, width: number, leading: number) {
  return wrapText(value, size, width).length * leading;
}

function lecturerLastName(value: string) {
  const name = asciiText(value)
    .split(",")[0]
    .trim()
    .replace(/^(?:Dr\.?|Prof\.?|Professor)\s+/i, "");
  return name.split(/\s+/).filter(Boolean).at(-1) || "Unknown";
}

function lectureMetadata(lecture: Lecture) {
  return `${lecturerLastName(lecture.lecturer)} | ${lecture.date}`;
}

function objectiveTextWidth(includeProgressTracker: boolean) {
  return includeProgressTracker
    ? TRACKER_X - OBJECTIVE_TEXT_X - 14
    : PAGE_WIDTH - MARGIN * 2 - 25;
}

function objectiveHeight(value: string, includeProgressTracker: boolean) {
  return Math.max(
    wrappedHeight(value, 11, objectiveTextWidth(includeProgressTracker), 16),
    includeProgressTracker ? TRACKER_BOX_HEIGHT : 0,
  ) + 3;
}

function lectureHeaderHeight(lecture: Lecture, continued = false) {
  const titleSize = continued ? 11 : 14;
  const titleLeading = continued ? 16 : 19;
  const metadataSize = continued ? 8 : 9;
  const metadataLeading = continued ? 13 : 15;
  const title = continued ? `${lecture.title} (continued)` : lecture.title;
  return wrappedHeight(title, titleSize, PAGE_WIDTH - MARGIN * 2, titleLeading)
    + wrappedHeight(lectureMetadata(lecture), metadataSize, PAGE_WIDTH - MARGIN * 2, metadataLeading);
}

function lectureBlockHeight(lecture: Lecture, includeProgressTracker: boolean) {
  return lectureHeaderHeight(lecture) + lecture.slos.reduce((height, slo) => height + objectiveHeight(slo, includeProgressTracker), 0) + 10;
}

export function buildSloPdf(lectures: Lecture[], options: SloPdfOptions = {}) {
  const includeProgressTracker = options.includeProgressTracker ?? false;
  const pages: PdfElement[][] = [[]];
  let page = 0;
  let y = PAGE_HEIGHT - MARGIN;
  const currentPage = () => pages[page];
  const newPage = () => { pages.push([]); page += 1; y = PAGE_HEIGHT - MARGIN; };
  const requireSpace = (height: number) => { if (y - height < BOTTOM_LIMIT) newPage(); };
  const addLine = (text: string, size: number, options: { x?: number; bold?: boolean; leading?: number } = {}) => {
    const leading = options.leading ?? size * 1.35;
    requireSpace(leading);
    currentPage().push({ text, x: options.x ?? MARGIN, y, size, bold: options.bold });
    y -= leading;
  };
  const addWrapped = (text: string, size: number, options: { x?: number; width?: number; bold?: boolean; leading?: number } = {}) => {
    const x = options.x ?? MARGIN;
    const width = options.width ?? PAGE_WIDTH - MARGIN - x;
    const leading = options.leading ?? size * 1.45;
    for (const line of wrapText(text, size, width)) addLine(line, size, { x, bold: options.bold, leading });
  };
  const addLectureHeader = (lecture: Lecture, continued = false) => {
    if (continued) {
      addWrapped(`${lecture.title} (continued)`, 11, { bold: true, leading: 16 });
      addWrapped(lectureMetadata(lecture), 8, { leading: 13 });
      return;
    }
    addWrapped(lecture.title, 14, { bold: true, leading: 19 });
    addWrapped(lectureMetadata(lecture), 9, { leading: 15 });
  };
  const addObjective = (slo: string, index: number) => {
    const number = `${index + 1}.`;
    const lines = wrapText(slo, 11, objectiveTextWidth(includeProgressTracker));
    currentPage().push({ text: number, x: MARGIN + 2, y, size: 11, bold: true });
    if (includeProgressTracker) {
      TRACKER_LABELS.forEach((label, trackerIndex) => {
        const boxX = TRACKER_X + trackerIndex * (TRACKER_BOX_WIDTH + TRACKER_BOX_GAP);
        const boxY = y - 4;
        const labelSize = 7;
        const estimatedLabelWidth = label.length * labelSize * 0.5;
        currentPage().push({ x: boxX, y: boxY, boxWidth: TRACKER_BOX_WIDTH, boxHeight: TRACKER_BOX_HEIGHT, lineWidth: 0.65 });
        currentPage().push({ text: label, x: boxX + (TRACKER_BOX_WIDTH - estimatedLabelWidth) / 2, y: boxY + 4.5, size: labelSize });
      });
    }
    lines.forEach((line) => {
      currentPage().push({ text: line, x: OBJECTIVE_TEXT_X, y, size: 11 });
      y -= 16;
    });
    y -= 3;
  };

  addLine("Session Learning Objectives", 18, { bold: true, leading: 30 });
  let previousGroup = "";
  lectures.forEach((lecture) => {
    const group = `${lecture.academicYear} | ${lecture.course}`;
    const groupChanged = group !== previousGroup;
    const groupSpacing = groupChanged && previousGroup ? 8 : 0;
    const groupHeight = groupChanged
      ? groupSpacing + wrappedHeight(group.toUpperCase(), 10, PAGE_WIDTH - MARGIN * 2, 16)
      : 0;
    const blockHeight = lectureBlockHeight(lecture, includeProgressTracker);
    const completeHeight = groupHeight + blockHeight;
    const firstObjectiveHeight = lecture.slos[0] ? objectiveHeight(lecture.slos[0], includeProgressTracker) : 0;
    const introductionHeight = groupHeight + lectureHeaderHeight(lecture) + firstObjectiveHeight;

    // Keep the complete lecture together whenever it can fit on one page.
    // Oversized lectures fall back to page breaks only between objectives,
    // with a repeated lecture header on each continuation page.
    if (completeHeight <= PAGE_BODY_HEIGHT) requireSpace(completeHeight);
    else requireSpace(Math.min(introductionHeight, PAGE_BODY_HEIGHT));

    if (group !== previousGroup) {
      if (previousGroup) y -= 8;
      addWrapped(group.toUpperCase(), 10, { bold: true, leading: 16 });
      previousGroup = group;
    }
    addLectureHeader(lecture);
    lecture.slos.forEach((slo, index) => {
      const height = objectiveHeight(slo, includeProgressTracker);
      if (y - height < BOTTOM_LIMIT) {
        newPage();
        addLectureHeader(lecture, true);
      }
      addObjective(slo, index);
    });
    y -= 10;
  });

  pages.forEach((elements, index) => elements.push({ text: `${index + 1} / ${pages.length}`, x: PAGE_WIDTH / 2 - 10, y: 28, size: 8 }));

  const objects: string[] = [];
  const pageObjectIds: number[] = [];
  const contentObjectIds: number[] = [];
  const firstPageObjectId = 5;
  pages.forEach((_, index) => {
    pageObjectIds.push(firstPageObjectId + index * 2);
    contentObjectIds.push(firstPageObjectId + index * 2 + 1);
  });
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  pages.forEach((elements, index) => {
    const stream = ["0 g", "0 G", ...elements.map((element) => "boxWidth" in element
      ? `${element.lineWidth ?? 0.65} w ${element.x.toFixed(2)} ${element.y.toFixed(2)} ${element.boxWidth.toFixed(2)} ${element.boxHeight.toFixed(2)} re S`
      : `BT /${element.bold ? "F2" : "F1"} ${element.size} Tf 1 0 0 1 ${element.x.toFixed(2)} ${element.y.toFixed(2)} Tm (${escapePdfText(element.text)}) Tj ET`)].join("\n");
    objects[pageObjectIds[index]] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectIds[index]} 0 R >>`;
    objects[contentObjectIds[index]] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

export function downloadSloPdf(lectures: Lecture[], options: SloPdfOptions = {}) {
  const bytes = buildSloPdf(lectures, options);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `FCOM.lib-SLOs-${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
