"use client";

type GalleryLecture = {
  title: string;
  lecturer: string;
  course: string;
  week: number;
  cover: "title" | "diagram" | "dense" | "minimal";
  accent?: string;
};

const fixtureLectures: GalleryLecture[] = [
  { title: "Basic Embryology: Introduction to Human Embryology", lecturer: "Caroline Rinaldi", course: "MCF", week: 1, cover: "title", accent: "#b79272" },
  { title: "Biochemistry — Nucleic Acid and Chromatin Structure", lecturer: "Peter Huwe", course: "MCF", week: 1, cover: "diagram", accent: "#738f9f" },
  { title: "DNA Replication, Telomeres, and DNA Repair", lecturer: "Peter Huwe", course: "MCF", week: 1, cover: "dense", accent: "#8a7597" },
  { title: "Introduction to Cytogenetics", lecturer: "Katherine Mitsouras", course: "MCF", week: 1, cover: "minimal", accent: "#8e9b72" },
  { title: "Introduction to Human Genetics", lecturer: "Katherine Mitsouras", course: "MCF", week: 1, cover: "diagram", accent: "#ad7d72" },
  { title: "Introduction to Pharmacology I", lecturer: "Sandeep Vansal", course: "MCF", week: 1, cover: "title", accent: "#8d8f9d" },
  { title: "Carbohydrate Structure and Glycolysis", lecturer: "Katherine Mitsouras", course: "MCF", week: 2, cover: "diagram", accent: "#947f5d" },
  { title: "DNA Technology and its Applications", lecturer: "Katherine Mitsouras", course: "MCF", week: 2, cover: "dense", accent: "#627f8c" },
  { title: "Signal Transduction", lecturer: "Katherine Mitsouras", course: "MCF", week: 2, cover: "minimal", accent: "#768c74" },
  { title: "Fundamentals of Immunity", lecturer: "Amina Shah", course: "IMD", week: 3, cover: "title", accent: "#9a7068" },
  { title: "Innate Immune Recognition", lecturer: "Amina Shah", course: "IMD", week: 3, cover: "diagram", accent: "#718998" },
  { title: "Antigen Presentation", lecturer: "Daniel Cho", course: "IMD", week: 3, cover: "dense", accent: "#8b8067" },
];

function PreviewArtwork({ lecture }: { lecture: GalleryLecture }) {
  return <div className={`lecture-gallery-art lecture-gallery-art-${lecture.cover}`} style={{ "--gallery-accent": lecture.accent } as React.CSSProperties} aria-hidden="true">
    <span className="gallery-art-kicker">FCOM · {lecture.course}</span>
    <strong>{lecture.title}</strong>
    <i />
    <div className="gallery-art-lines"><span/><span/><span/><span/><span/></div>
    <small>{lecture.lecturer}</small>
  </div>;
}

export function LectureGalleryPrototype() {
  const groups = Array.from(new Map(fixtureLectures.map((lecture) => [`${lecture.course}-${lecture.week}`, { course: lecture.course, week: lecture.week }])).values());

  return <div className="lecture-gallery-prototype">
    <header>
      <div><small>LECTURE ARCHIVE</small><strong>Visual library</strong></div>
      <p>First-page previews · grouped by course and curriculum week</p>
    </header>
    <div className="lecture-gallery-groups">
      {groups.map((group) => <section key={`${group.course}-${group.week}`}>
        <div className="lecture-gallery-heading"><h3>{group.course}</h3><span>Week {group.week}</span></div>
        <div className="lecture-gallery-grid">
          {fixtureLectures.filter((lecture) => lecture.course === group.course && lecture.week === group.week).map((lecture) => <button type="button" className="lecture-gallery-item" key={lecture.title} aria-label={`Open ${lecture.title}`}>
            <PreviewArtwork lecture={lecture}/>
            <span className="lecture-gallery-caption"><strong>{lecture.title}</strong><small>{lecture.lecturer}</small></span>
          </button>)}
        </div>
      </section>)}
    </div>
  </div>;
}
