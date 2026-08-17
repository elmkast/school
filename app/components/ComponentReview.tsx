"use client";

import { useState } from "react";
import { CurriculumCard } from "./CurriculumCard";
import { CurriculumPageToolbar } from "./CurriculumPageToolbar";
import { LectureGalleryPrototype } from "./LectureGalleryPrototype";
import { SidebarPrototypes } from "./SidebarPrototypes";

const fixtureSlos = [
  "Describe the regulation of glycolysis at its irreversible enzymatic steps.",
  "Compare the roles of hexokinase and glucokinase in glucose metabolism.",
  "Predict how insulin and glucagon alter hepatic carbohydrate metabolism.",
];

export function ComponentReview() {
  const [lectureWeek, setLectureWeek] = useState<number | null>(2);
  const [favorite, setFavorite] = useState(false);
  const [slosExpanded, setSlosExpanded] = useState(false);
  const [questionsExpanded, setQuestionsExpanded] = useState(false);

  return <main className="component-review-page">
    <header className="component-review-header">
      <div><small>INTERNAL UX REFERENCE</small><h1>Curriculum components</h1><p>Canonical states for reviewing shared FCOM.lib interface patterns.</p></div>
      <button type="button" onClick={() => { window.location.href = "/"; }}>Return to FCOM.lib</button>
    </header>

    <section className="component-review-section">
      <CurriculumPageToolbar heading={<div className="eyebrow">CURRICULUM PAGE TOOLBAR</div>} filters={<><label className="sort-control"><span>Filter by</span><select defaultValue="all"><option value="all">All weeks</option><option value="2">Week 2</option></select></label><label className="sort-control"><span>Sort by</span><select defaultValue="week"><option value="week">Week · earliest first</option><option value="name">Name · A–Z</option></select></label></>} actions={<button className="component-review-primary">Primary action</button>} />
    </section>

    <section className="component-review-section component-review-section-wide">
      <div className="component-review-label"><span>SIDEBAR SYSTEM PROPOSALS</span><p>Three interactive navigation models using the same hierarchy and selection state. Click rows and expand folders to compare behavior.</p></div>
      <SidebarPrototypes />
    </section>

    <section className="component-review-section component-review-section-wide">
      <div className="component-review-label"><span>VISUAL LIBRARY PROPOSAL</span><p>An alternate contact-sheet view using the first page of each PDF as the primary navigation object. Hover or focus a preview to reveal its lecture title.</p></div>
      <LectureGalleryPrototype />
    </section>

    <section className="component-review-section">
      <div className="component-review-label"><span>LECTURE</span><p>Editable week, favorite and remove actions, SLO preview, and lecture action.</p></div>
      <div className="lecture-list">
        <CurriculumCard title="Carbohydrate Structure and Glycolysis" course="MCF" lecturer="Katherine Mitsouras, PhD" week={lectureWeek} countLabel="9 SLOs" primaryActionLabel="Open lecture" onPrimaryAction={() => undefined} onSelect={() => undefined} weekEditable onWeekChange={(value) => setLectureWeek(value ? Number(value) : null)} countTooltip={<><strong>Session learning objectives</strong><ol>{fixtureSlos.map((slo) => <li key={slo}>{slo}</li>)}</ol></>} favorite={favorite} onToggleFavorite={() => setFavorite((current) => !current)} onRemove={() => undefined} />
      </div>
    </section>

    <section className="component-review-section">
      <div className="component-review-label"><span>SLO COLLECTION</span><p>Read-only week, objective count, and expandable SLO content.</p></div>
      <div className="lecture-list">
        <CurriculumCard title="Biochemistry — Nucleic Acid and Chromatin Structure" course="MCF" lecturer="Peter J. Huwe, PhD" week={1} countLabel="7 SLOs" primaryActionLabel={slosExpanded ? "Hide SLOs" : "View SLOs"} onPrimaryAction={() => setSlosExpanded((current) => !current)} expanded={slosExpanded}>
          <div className="curriculum-card-content"><ol>{fixtureSlos.map((slo, index) => <li key={slo}><span>{index + 1}</span><p>{slo}</p></li>)}</ol><footer><button>Luna re-parse</button><button className="primary-card-action">Open lecture</button></footer></div>
        </CurriculumCard>
      </div>
    </section>

    <section className="component-review-section">
      <div className="component-review-label"><span>QUESTION COLLECTION</span><p>Read-only week, question count, and expandable approved-question content.</p></div>
      <div className="lecture-list">
        <CurriculumCard title="A deliberately long lecture title demonstrating wrapping without changing the shared card geometry" course="MCF" lecturer="Lecturer Not Assigned" week={null} countLabel="33 questions" primaryActionLabel={questionsExpanded ? "Hide questions" : "View questions"} onPrimaryAction={() => setQuestionsExpanded((current) => !current)} expanded={questionsExpanded}>
          <div className="curriculum-card-content question-list"><article className="bank-question"><div className="question-meta"><span>Q1</span><small>Multiple choice</small></div><h3>Which regulatory step most directly limits glycolytic flux under low-energy conditions?</h3><ol className="question-options" type="A"><li>Hexokinase</li><li>Phosphofructokinase-1</li><li>Phosphoglycerate kinase</li><li>Enolase</li></ol><footer><button>Show answer</button><button className="remove-question">Remove</button></footer></article></div>
        </CurriculumCard>
      </div>
    </section>
  </main>;
}
