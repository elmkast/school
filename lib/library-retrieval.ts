import type { Lecture, PreRead } from "./lecture-store";

function terms(value: string) {
  return Array.from(new Set(value.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])).filter((term) => !["about", "does", "else", "from", "have", "mention", "this", "what", "where", "which", "with"].includes(term));
}

export function retrieveLibraryContext(query: string, lectures: Lecture[], preReads: PreRead[], current?: { course?: string; week?: number | null; lecturer?: string }) {
  const queryTerms = terms(query);
  const index = lectures.map((lecture) => `${lecture.academicYear} | ${lecture.course} | ${lecture.week ? `Week ${lecture.week}` : "Week unassigned"} | ${lecture.lecturer} | ${lecture.title}`).join("\n");
  const candidates = [
    ...lectures.flatMap((lecture) => [
      ...lecture.slides.map((slide) => ({
        label: `${lecture.course} · ${lecture.title} · ${lecture.lecturer} · Week ${lecture.week ?? "unassigned"} · PDF page ${slide.page}`,
        text: `${slide.heading}\n${slide.text}`,
        metadata: `${lecture.course} ${lecture.title} ${lecture.lecturer} ${slide.heading}`,
        boost: (current?.course === lecture.course ? 2 : 0) + (current?.week != null && current.week === lecture.week ? 3 : 0) + (current?.lecturer === lecture.lecturer ? 1 : 0),
      })),
      ...lecture.slos.map((slo, index) => ({
        label: `${lecture.course} · ${lecture.title} · ${lecture.lecturer} · Week ${lecture.week ?? "unassigned"} · SLO ${index + 1}`,
        text: slo,
        metadata: `${lecture.course} ${lecture.title} ${lecture.lecturer} ${slo}`,
        boost: (current?.course === lecture.course ? 2 : 0) + (current?.week != null && current.week === lecture.week ? 3 : 0),
      })),
    ]),
    ...preReads.flatMap((preRead) => (preRead.pages.length ? preRead.pages : [{ page: 1, heading: preRead.title, text: preRead.text }]).map((page) => ({
      label: `${preRead.course} · Pre-read: ${preRead.title} · ${preRead.author} · page ${page.page}`,
      text: `${page.heading}\n${page.text}`,
      metadata: `${preRead.course} ${preRead.title} ${preRead.author} ${page.heading}`,
      boost: current?.course === preRead.course ? 2 : 0,
    }))),
  ];
  const ranked = candidates.map((candidate) => {
    const haystack = `${candidate.metadata}\n${candidate.text}`.toLowerCase();
    const score = candidate.boost + queryTerms.reduce((total, term) => total + (haystack.includes(term) ? haystack.split(term).length : 0), 0);
    return { ...candidate, score };
  }).filter((candidate) => candidate.score > 0 || queryTerms.length === 0).sort((a, b) => b.score - a.score).slice(0, 24);
  let remaining = 55_000;
  const excerpts = ranked.flatMap((candidate) => {
    if (remaining <= 0) return [];
    const entry = `[${candidate.label}]\n${candidate.text}`.slice(0, Math.min(2200, remaining));
    remaining -= entry.length;
    return [entry];
  });
  return `LIBRARY INDEX:\n${index.slice(0, 9000)}\n\nRETRIEVED LIBRARY EXCERPTS:\n${excerpts.join("\n\n") || "No matching excerpt was found."}`;
}
