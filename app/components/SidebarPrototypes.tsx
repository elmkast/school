"use client";

import { useState } from "react";
import { Sidebar, SidebarDivider, SidebarItem, SidebarSection, SidebarTree, SidebarTreeItem } from "./SidebarSystem";

type Variant = "workspace" | "compact" | "split";

const prototypeDescriptions: Record<Variant, { title: string; recommendation?: string; description: string }> = {
  workspace: { title: "A · Workspace navigator", recommendation: "Recommended", description: "One calm, expandable navigation surface with strong selection and restrained hierarchy." },
  compact: { title: "B · Compact document tree", description: "A denser technical navigator that prioritizes scanning speed and capacity." },
  split: { title: "C · Two-level navigator", description: "Permanent destinations in a rail; curriculum hierarchy gets a dedicated second column." },
};

function CurriculumFixture({ active, onSelect, includeRoots = true }: { active: string; onSelect: (value: string) => void; includeRoots?: boolean }) {
  const [yearOpen, setYearOpen] = useState(true);
  const [mcfOpen, setMcfOpen] = useState(true);
  const [imdOpen, setImdOpen] = useState(false);
  return <>
    {includeRoots && <SidebarItem label="Lectures" count={19} expandable expanded active={active === "lectures"} onClick={() => onSelect("lectures")} />}
    <SidebarTree>
      <SidebarTreeItem label="2026–2027" count={19} depth={includeRoots ? 1 : 0} expandable expanded={yearOpen} active={active === "year"} onClick={() => onSelect("year")} onToggle={() => setYearOpen((value) => !value)} />
      {yearOpen && <>
        <SidebarTreeItem label="MCF" count={19} depth={includeRoots ? 2 : 1} expandable expanded={mcfOpen} active={active === "mcf"} onClick={() => onSelect("mcf")} onToggle={() => setMcfOpen((value) => !value)} />
        {mcfOpen && <>
          <SidebarTreeItem label="Huwe" count={3} depth={includeRoots ? 3 : 2} active={active === "huwe"} onClick={() => onSelect("huwe")} />
          <SidebarTreeItem label="Kuehn" count={2} depth={includeRoots ? 3 : 2} active={active === "kuehn"} onClick={() => onSelect("kuehn")} />
          <SidebarTreeItem label="Mitsouras" count={10} depth={includeRoots ? 3 : 2} active={active === "mitsouras"} onClick={() => onSelect("mitsouras")} />
          <SidebarTreeItem label="Rinaldi" count={2} depth={includeRoots ? 3 : 2} active={active === "rinaldi"} onClick={() => onSelect("rinaldi")} />
          <SidebarTreeItem label="Vansal" count={2} depth={includeRoots ? 3 : 2} active={active === "vansal"} onClick={() => onSelect("vansal")} />
        </>}
        <SidebarTreeItem label="IMD" count={4} depth={includeRoots ? 2 : 1} expandable expanded={imdOpen} active={active === "imd"} onClick={() => onSelect("imd")} onToggle={() => setImdOpen((value) => !value)} />
        {imdOpen && <SidebarTreeItem label="Nguyen" count={4} depth={includeRoots ? 3 : 2} active={active === "nguyen"} onClick={() => onSelect("nguyen")} />}
        <SidebarTreeItem label="Hem Onc" count={0} depth={includeRoots ? 2 : 1} expandable active={active === "heme"} onClick={() => onSelect("heme")} onToggle={() => undefined} />
      </>}
    </SidebarTree>
  </>;
}

function StandardNavigation({ active, onSelect }: { active: string; onSelect: (value: string) => void }) {
  return <>
    <SidebarItem label="Home" active={active === "home"} onClick={() => onSelect("home")} />
    <SidebarDivider />
    <SidebarSection><CurriculumFixture active={active} onSelect={onSelect} /></SidebarSection>
    <SidebarItem label="SLOs" active={active === "slos"} onClick={() => onSelect("slos")} />
    <SidebarItem label="Question Bank" count={93} active={active === "questions"} onClick={() => onSelect("questions")} />
    <SidebarDivider />
    <SidebarItem label="Pre-reads" active={active === "prereads"} onClick={() => onSelect("prereads")} quiet />
  </>;
}

function PrototypeCanvas({ variant }: { variant: Variant }) {
  const [active, setActive] = useState("mitsouras");
  if (variant === "split") return <div className="sidebar-prototype-canvas split-canvas">
    <Sidebar className="sidebar-prototype sidebar-prototype-rail" footer={<small>FCOM.lib</small>}>
      <SidebarItem label="Home" active={active === "home"} onClick={() => setActive("home")} />
      <SidebarItem label="Lectures" active={["lectures", "year", "mcf", "huwe", "kuehn", "mitsouras", "rinaldi", "vansal", "imd", "heme"].includes(active)} onClick={() => setActive("lectures")} />
      <SidebarItem label="SLOs" active={active === "slos"} onClick={() => setActive("slos")} />
      <SidebarItem label="Questions" active={active === "questions"} onClick={() => setActive("questions")} />
      <SidebarItem label="Pre-reads" active={active === "prereads"} onClick={() => setActive("prereads")} />
    </Sidebar>
    <Sidebar className="sidebar-prototype sidebar-prototype-detail" footer={<small>19 lectures</small>} ariaLabel="Lecture folders">
      <SidebarSection label="LECTURES"><CurriculumFixture active={active} onSelect={setActive} includeRoots={false} /></SidebarSection>
    </Sidebar>
  </div>;

  return <div className="sidebar-prototype-canvas">
    <Sidebar className={`sidebar-prototype sidebar-prototype-${variant}`} footer={<div><strong>Cloud library</strong><small>elliot@example.com</small></div>}>
      <StandardNavigation active={active} onSelect={setActive} />
    </Sidebar>
  </div>;
}

export function SidebarPrototypes() {
  return <section className="sidebar-review-grid">
    {(Object.keys(prototypeDescriptions) as Variant[]).map((variant) => {
      const copy = prototypeDescriptions[variant];
      return <article className="sidebar-review-card" key={variant}>
        <header><div><span>{copy.title}</span>{copy.recommendation && <b>{copy.recommendation}</b>}</div><p>{copy.description}</p></header>
        <PrototypeCanvas variant={variant} />
      </article>;
    })}
  </section>;
}
