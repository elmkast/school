"use client";

import { useState } from "react";
import { AppIcon } from "./AppIcon";

const lectureGroups = [
  {
    id: "glycolysis",
    course: "MCF",
    week: "Week 3",
    instructor: "Katherine Mitsouras",
    title: "Carbohydrate Structure and Glycolysis",
    objectives: [
      "Describe the structural differences among monosaccharides, disaccharides, and polysaccharides.",
      "Explain the major regulated steps of glycolysis and how cellular energy state modifies pathway activity.",
      "Compare the metabolic fates of pyruvate under aerobic and anaerobic conditions.",
      "Relate defects in glycolytic enzymes to their characteristic clinical presentations.",
    ],
  },
  {
    id: "chromatin",
    course: "MCF",
    week: "Week 3",
    instructor: "Peter J. Huwe",
    title: "Nucleic Acid and Chromatin Structure",
    objectives: [
      "Identify DNA nucleotide structure and explain complementary base pairing.",
      "Contrast euchromatin and heterochromatin with respect to structure and gene expression.",
      "Explain how DNA is packaged around histones and organized into higher-order chromatin.",
    ],
  },
];

export function SloReviewPrototype() {
  const [flagged, setFlagged] = useState(() => new Set(["glycolysis-2"]));

  function toggleFlag(id: string) {
    setFlagged((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return <section className="slo-review-prototype" aria-label="SLO page overhaul prototype">
    <header className="slo-review-header">
      <h2>Session learning objectives</h2>
      <button className="slo-export"><AppIcon name="download"/>Export</button>
    </header>

    <div className="slo-review-toolbar">
      <label><span>Course</span><select defaultValue="MCF"><option>All courses</option><option>MCF</option></select></label>
      <label><span>Week</span><select defaultValue="Week 3"><option>All weeks</option><option>Week 2</option><option>Week 3</option></select></label>
      <label><span>Instructor</span><select defaultValue="All instructors"><option>All instructors</option><option>Katherine Mitsouras</option><option>Peter J. Huwe</option></select></label>
      <label><span>View</span><select defaultValue="All objectives"><option>All objectives</option><option>Flagged only</option></select></label>
    </div>

    <div className="slo-review-list">
      {lectureGroups.map((lecture) => <article className="slo-lecture" key={lecture.id}>
        <header>
          <div><small>{lecture.course} · {lecture.week} · {lecture.instructor}</small><h3>{lecture.title}</h3></div>
          <div className="slo-lecture-actions"><button>Luna re-parse</button><button className="slo-open-lecture">Open lecture</button></div>
        </header>
        <ol>
          {lecture.objectives.map((objective, index) => {
            const id = `${lecture.id}-${index}`;
            const isFlagged = flagged.has(id);
            return <li key={id}><span>{String(index + 1).padStart(2, "0")}</span><p>{objective}</p><button className={isFlagged ? "flagged" : ""} aria-label={`${isFlagged ? "Unflag" : "Flag"} objective ${index + 1}`} onClick={() => toggleFlag(id)}><AppIcon name="flag"/></button></li>;
          })}
        </ol>
      </article>)}
    </div>
  </section>;
}
