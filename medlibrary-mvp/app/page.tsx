"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Slide = { page: number; text: string; heading: string };
type Lecture = {
  id: string;
  title: string;
  lecturer: string;
  date: string;
  course: string;
  pages: number;
  slos: string[];
  concepts: string[];
  summary: string;
  slides: Slide[];
  fileName?: string;
  createdAt: string;
};

const seedLectures: Lecture[] = [
  {
    id: "dna-tech",
    title: "DNA Technology and its Applications",
    lecturer: "Katherine Mitsouras, PhD",
    date: "August 10, 2026",
    course: "Medical & Clinical Foundations",
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
    summary: "Methods for identifying disease genes, diagnosing monogenic disorders, measuring gene expression, and treating genetic disease through gene therapy and genome editing.",
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
    summary: "Chromosome morphology and nomenclature, cytogenetic testing methods, numerical abnormalities, structural rearrangements, and associated clinical syndromes.",
    slides: [
      { page: 8, heading: "Chromosome nomenclature", text: "ISCN positions use chromosome number, p or q arm, region, band and sub-band." },
      { page: 18, heading: "Comparison of chromosome analysis", text: "Chromosome banding, FISH and array CGH differ in resolution and ability to detect balanced rearrangements or DNA copy-number changes." },
      { page: 21, heading: "Changes in ploidy", text: "Meiotic nondisjunction produces disomic and nullisomic gametes and occurs more frequently with advanced maternal age." },
      { page: 29, heading: "Translocations", text: "Reciprocal translocations exchange material between chromosomes. Robertsonian translocations fuse two acrocentric chromosomes." },
    ],
    createdAt: "2026-08-03T08:00:00.000Z",
  },
];

function detectSLOs(slides: Slide[]) {
  const objectiveSlide = slides.find((slide) => /learning objectives?|session objectives?/i.test(slide.text));
  if (!objectiveSlide) return [];
  const body = objectiveSlide.text.replace(/^.*?(learning objectives?|session objectives?)[:\s-]*/i, "");
  const numbered = body.split(/\s+(?=\d+[.)]\s+)/).map((value) => value.replace(/^\d+[.)]\s*/, "").trim()).filter(Boolean);
  return numbered.length > 1 ? numbered : body.split(/\n+/).map((value) => value.trim()).filter((value) => value.length > 25);
}

function AppIcon({ name }: { name: "library" | "search" | "target" | "upload" | "file" | "spark" | "arrow" | "x" }) {
  const paths: Record<string, React.ReactNode> = {
    library: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5v-16Z"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    target: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M22 12h-3M12 22v-3M2 12h3"/></>,
    upload: <><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M5 14v5h14v-5"/></>,
    file: <><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/></>,
    spark: <><path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2L12 3Z"/><path d="m18.5 14 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/></>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>,
    x: <path d="m6 6 12 12M18 6 6 18"/>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function Home() {
  const [lectures, setLectures] = useState<Lecture[]>(seedLectures);
  const [activeId, setActiveId] = useState(seedLectures[0].id);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"library" | "search" | "slos">("library");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("medlibrary-lectures");
    if (saved) {
      try { setLectures(JSON.parse(saved)); } catch { /* use samples */ }
    }
  }, []);

  const save = (next: Lecture[]) => {
    setLectures(next);
    window.localStorage.setItem("medlibrary-lectures", JSON.stringify(next));
  };

  const active = lectures.find((lecture) => lecture.id === activeId) ?? lectures[0];
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return lectures.flatMap((lecture) => lecture.slides
      .filter((slide) => `${slide.heading} ${slide.text}`.toLowerCase().includes(needle))
      .map((slide) => ({ lecture, slide })));
  }, [lectures, query]);

  async function processFile(file: File) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setNotice("Please choose a PDF lecture deck."); return;
    }
    setUploading(true); setNotice("Extracting slide text…");
    try {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
      const data = new Uint8Array(await file.arrayBuffer());
      const pdf = await pdfjs.getDocument({ data }).promise;
      const slides: Slide[] = [];
      for (let page = 1; page <= pdf.numPages; page++) {
        const pdfPage = await pdf.getPage(page);
        const content = await pdfPage.getTextContent();
        const text = content.items.map((item) => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ").trim();
        const heading = text.split(/(?<=[a-z])\s{2,}|[•]/)[0]?.replace(/^\d+\s*/, "").slice(0, 110) || `Slide ${page}`;
        slides.push({ page, text, heading });
      }
      const first = slides[0]?.text ?? file.name.replace(/\.pdf$/i, "");
      const title = first.replace(/^\d+\s*/, "").split(/(?:August|September|October|November|December|January|February|March|April|May|June|July)\s+\d+/i)[0].replace(/[“”"]/g, "").trim().slice(0, 100) || file.name.replace(/\.pdf$/i, "");
      const lecture: Lecture = {
        id: crypto.randomUUID(), title, lecturer: "Lecturer not detected", date: new Date().toLocaleDateString(), course: "Unsorted",
        pages: pdf.numPages, slos: detectSLOs(slides), concepts: [], summary: "AI summary not generated yet.", slides, fileName: file.name, createdAt: new Date().toISOString(),
      };
      setNotice("Structuring lecture with AI…");
      try {
        const response = await fetch("/.netlify/functions/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lecture }) });
        if (response.ok) Object.assign(lecture, await response.json());
        else setNotice("Imported successfully. AI is not configured yet, so local extraction was used.");
      } catch { setNotice("Imported successfully. AI is not configured yet, so local extraction was used."); }
      const next = [lecture, ...lectures]; save(next); setActiveId(lecture.id); setView("library");
      if (!notice.includes("not configured")) setNotice("Lecture imported and indexed.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "This PDF could not be processed.");
    } finally { setUploading(false); }
  }

  const totalSLOs = lectures.reduce((sum, lecture) => sum + lecture.slos.length, 0);

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brandmark">M</span><div><strong>MedLibrary</strong><small>Lecture intelligence</small></div></div>
        <nav aria-label="Primary navigation">
          <button className={view === "library" ? "active" : ""} onClick={() => setView("library")}><AppIcon name="library"/>Library <span>{lectures.length}</span></button>
          <button className={view === "search" ? "active" : ""} onClick={() => setView("search")}><AppIcon name="search"/>Search</button>
          <button className={view === "slos" ? "active" : ""} onClick={() => setView("slos")}><AppIcon name="target"/>SLOs <span>{totalSLOs}</span></button>
        </nav>
        <div className="side-section"><small>COURSES</small><button className="course active"><i/>Medical & Clinical Foundations</button><button className="course"><i/>Unsorted</button></div>
        <div className="side-bottom"><p><AppIcon name="spark"/><span><strong>Private trial</strong><br/><small>Stored on this device</small></span></p></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <label className="global-search"><AppIcon name="search"/><input aria-label="Search the library" value={query} onChange={(e) => { setQuery(e.target.value); if (e.target.value) setView("search"); }} placeholder="Search concepts, diseases, methods…"/><kbd>⌘ K</kbd></label>
          <button className="upload-button" onClick={() => fileInput.current?.click()} disabled={uploading}><AppIcon name="upload"/>{uploading ? "Processing…" : "Add lecture"}</button>
          <input ref={fileInput} type="file" accept="application/pdf" hidden onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}/>
          <span className="avatar">EM</span>
        </header>

        {notice && <div className="notice"><span>{notice}</span><button aria-label="Dismiss" onClick={() => setNotice("")}><AppIcon name="x"/></button></div>}

        {view === "library" && active && <div className="content-grid">
          <section className="library-panel">
            <div className="eyebrow">2026–27 · MEDICAL & CLINICAL FOUNDATIONS</div>
            <div className="page-title"><div><h1>Your lecture library</h1><p>Everything from class, organized and ready to search.</p></div><div className="view-toggle"><button className="active">▦</button><button>☰</button></div></div>
            <div className="lecture-list">
              {lectures.map((lecture) => <button key={lecture.id} className={`lecture-card ${activeId === lecture.id ? "selected" : ""}`} onClick={() => setActiveId(lecture.id)}>
                <span className="file-icon"><AppIcon name="file"/></span>
                <span className="lecture-copy"><small>{lecture.course.toUpperCase()}</small><strong>{lecture.title}</strong><em>{lecture.lecturer} · {lecture.date}</em><span className="chips">{lecture.concepts.slice(0, 3).map((concept) => <i key={concept}>{concept}</i>)}</span></span>
                <span className="lecture-meta"><strong>{lecture.pages}</strong><small>SLIDES</small><b>{lecture.slos.length} SLOs</b></span>
              </button>)}
              <button className={`dropzone ${dragging ? "dragging" : ""}`} onClick={() => fileInput.current?.click()} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }}>
                <span><AppIcon name="upload"/></span><strong>Drop your next lecture here</strong><small>PDF · Text is processed in your browser</small>
              </button>
            </div>
          </section>

          <aside className="detail-panel">
            <div className="detail-label">LECTURE BRIEF</div><h2>{active.title}</h2><p>{active.summary}</p>
            <div className="detail-stats"><span><strong>{active.pages}</strong><small>slides</small></span><span><strong>{active.slos.length}</strong><small>SLOs</small></span><span><strong>{active.concepts.length}</strong><small>concepts</small></span></div>
            <div className="section-head"><h3>Session learning objectives</h3><button onClick={() => setView("slos")}>View all</button></div>
            <ol className="slo-preview">{active.slos.slice(0, 4).map((slo, index) => <li key={slo}><span>{index + 1}</span><p>{slo}</p></li>)}</ol>
            <div className="section-head"><h3>Key concepts</h3></div><div className="concept-cloud">{active.concepts.map((concept) => <span key={concept}>{concept}</span>)}</div>
            <button className="open-brief">Open lecture brief <AppIcon name="arrow"/></button>
          </aside>
        </div>}

        {view === "search" && <section className="full-page"><div className="eyebrow">LIBRARY SEARCH</div><h1>{query ? `Results for “${query}”` : "Search your curriculum"}</h1><p>Find exact words across extracted slide text. Results always retain their source lecture and page.</p>
          {!query && <div className="empty-state"><AppIcon name="search"/><strong>Start with a concept, disease, or method</strong><span>Try “translocation,” “PCR,” or “maternal age.”</span></div>}
          {query && <div className="result-count">{results.length} slide{results.length === 1 ? "" : "s"} found</div>}
          <div className="results">{results.map(({ lecture, slide }) => <button key={`${lecture.id}-${slide.page}`} onClick={() => { setActiveId(lecture.id); setView("library"); }}><span className="result-page">{slide.page}</span><span><small>{lecture.title}</small><strong>{slide.heading}</strong><p>{slide.text}</p></span><AppIcon name="arrow"/></button>)}</div>
        </section>}

        {view === "slos" && <section className="full-page"><div className="eyebrow">SLO DASHBOARD</div><h1>Session learning objectives</h1><p>A single view of what your curriculum expects you to know.</p>
          <div className="slo-groups">{lectures.map((lecture) => <article key={lecture.id}><header><span className="file-icon"><AppIcon name="target"/></span><div><small>{lecture.course}</small><h2>{lecture.title}</h2></div><b>{lecture.slos.length} objectives</b></header><ol>{lecture.slos.map((slo, index) => <li key={slo}><span>{index + 1}</span><p>{slo}</p></li>)}</ol></article>)}</div>
        </section>}
      </section>
    </main>
  );
}
