"use client";

import { useMemo, useState } from "react";

type Strength = "weak" | "okay" | "strong";

type StudyObjective = {
  id: string;
  course: string;
  week: number;
  instructor: string;
  lecture: string;
  number: number;
  text: string;
  strength: Strength;
  priority: boolean;
};

const seedObjectives: StudyObjective[] = [
  { id:"gly-1", course:"MCF", week:3, instructor:"Katherine Mitsouras", lecture:"Carbohydrate Structure and Glycolysis", number:1, text:"Describe the structural differences among monosaccharides, disaccharides, and polysaccharides.", strength:"strong", priority:false },
  { id:"gly-2", course:"MCF", week:3, instructor:"Katherine Mitsouras", lecture:"Carbohydrate Structure and Glycolysis", number:2, text:"Explain the major regulated steps of glycolysis and how cellular energy state modifies pathway activity.", strength:"weak", priority:true },
  { id:"gly-3", course:"MCF", week:3, instructor:"Katherine Mitsouras", lecture:"Carbohydrate Structure and Glycolysis", number:3, text:"Compare the metabolic fates of pyruvate under aerobic and anaerobic conditions.", strength:"okay", priority:true },
  { id:"chr-1", course:"MCF", week:3, instructor:"Peter J. Huwe", lecture:"Nucleic Acid and Chromatin Structure", number:1, text:"Identify DNA nucleotide structure and explain complementary base pairing.", strength:"strong", priority:false },
  { id:"chr-2", course:"MCF", week:3, instructor:"Peter J. Huwe", lecture:"Nucleic Acid and Chromatin Structure", number:2, text:"Contrast euchromatin and heterochromatin with respect to structure and gene expression.", strength:"weak", priority:true },
  { id:"emb-1", course:"MCF", week:2, instructor:"Caroline E. Rinaldi", lecture:"Basic Embryology: Weeks 3 & 4", number:1, text:"Describe folding of the trilaminar embryo and formation of the primitive gut tube.", strength:"okay", priority:false },
  { id:"emb-2", course:"MCF", week:2, instructor:"Caroline E. Rinaldi", lecture:"Basic Embryology: Weeks 3 & 4", number:2, text:"Relate neural crest migration to the major derivatives of the pharyngeal arches.", strength:"weak", priority:true },
];

const strengthLabel: Record<Strength, string> = { weak:"Weak", okay:"O.K.", strong:"Strong" };

function useObjectiveState(initialSelection: string[] = []) {
  const [objectives, setObjectives] = useState(seedObjectives);
  const [selected, setSelected] = useState(() => new Set(initialSelection));

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setStrength(id: string, strength: Strength) {
    setObjectives((current) => current.map((objective) => objective.id === id ? { ...objective, strength } : objective));
  }

  function togglePriority(id: string) {
    setObjectives((current) => current.map((objective) => objective.id === id ? { ...objective, priority:!objective.priority } : objective));
  }

  return { objectives, selected, setSelected, toggleSelected, setStrength, togglePriority };
}

function StrengthButtons({ value, onChange }: { value:Strength; onChange(value:Strength):void }) {
  return <div className="slo-strength-buttons" aria-label="Confidence">
    {(["weak", "okay", "strong"] as Strength[]).map((strength) => <button type="button" className={value === strength ? "active" : ""} aria-pressed={value === strength} key={strength} onClick={() => onChange(strength)}>{strengthLabel[strength]}</button>)}
  </div>;
}

function PrototypeToolbar({ selectedCount, children }: { selectedCount:number; children?:React.ReactNode }) {
  return <header className="slo-study-header">
    <div><h2>Session learning objectives</h2><span>{selectedCount} selected</span></div>
    <div className="slo-study-header-actions">{children}<button type="button" className="secondary">Save set</button><button type="button" disabled={!selectedCount}>Draft quiz</button></div>
  </header>;
}

export function SloComposerProposal() {
  const state = useObjectiveState(["gly-2", "gly-3", "chr-2"]);
  const selectedObjectives = state.objectives.filter((objective) => state.selected.has(objective.id));
  const lectures = useMemo(() => Array.from(new Set(state.objectives.map((objective) => objective.lecture))), [state.objectives]);

  return <section className="slo-study-prototype slo-composer-proposal" aria-label="Study set composer proposal">
    <PrototypeToolbar selectedCount={state.selected.size}/>
    <div className="slo-study-filters">
      <label><span>Course</span><select defaultValue="MCF"><option>MCF</option></select></label>
      <label><span>Week</span><select defaultValue="Week 3"><option>All weeks</option><option>Week 2</option><option>Week 3</option></select></label>
      <label><span>Confidence</span><select defaultValue="All levels"><option>All levels</option><option>Weak</option><option>O.K.</option><option>Strong</option></select></label>
      <label><span>Priority</span><select defaultValue="All"><option>All</option><option>Priority only</option></select></label>
    </div>
    <div className="slo-composer-layout">
      <div className="slo-composer-source">
        {lectures.map((lecture) => {
          const objectives = state.objectives.filter((objective) => objective.lecture === lecture);
          const lectureSelected = objectives.every((objective) => state.selected.has(objective.id));
          return <article className="slo-composer-lecture" key={lecture}>
            <header><div><small>{objectives[0].course} · Week {objectives[0].week} · {objectives[0].instructor}</small><h3>{lecture}</h3></div><button type="button" onClick={() => state.setSelected((current) => {
              const next = new Set(current);
              objectives.forEach((objective) => lectureSelected ? next.delete(objective.id) : next.add(objective.id));
              return next;
            })}>{lectureSelected ? "Clear lecture" : "Select lecture"}</button></header>
            <ol>{objectives.map((objective) => <li key={objective.id} className={state.selected.has(objective.id) ? "selected" : ""}>
              <input type="checkbox" aria-label={`Select ${objective.text}`} checked={state.selected.has(objective.id)} onChange={() => state.toggleSelected(objective.id)}/>
              <span>{String(objective.number).padStart(2, "0")}</span>
              <p>{objective.text}</p>
              <StrengthButtons value={objective.strength} onChange={(strength) => state.setStrength(objective.id, strength)}/>
              <button type="button" className={`slo-priority-button ${objective.priority ? "active" : ""}`} aria-pressed={objective.priority} onClick={() => state.togglePriority(objective.id)}>Priority</button>
            </li>)}</ol>
          </article>;
        })}
      </div>
      <aside className="slo-study-set-tray">
        <label><span>Study set</span><input defaultValue="Week 3 priorities"/></label>
        <ol>{selectedObjectives.map((objective, index) => <li key={objective.id}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{objective.lecture}</strong><p>{objective.text}</p></div><button type="button" aria-label={`Remove ${objective.text}`} onClick={() => state.toggleSelected(objective.id)}>×</button></li>)}</ol>
        {!selectedObjectives.length && <p className="slo-study-empty">Select objectives to build a set.</p>}
        <footer><span>{selectedObjectives.length} objectives</span><button type="button" disabled={!selectedObjectives.length}>Begin study</button></footer>
      </aside>
    </div>
  </section>;
}

export function SloBoardProposal() {
  const state = useObjectiveState(["gly-2", "chr-2"]);
  const [priorityOnly, setPriorityOnly] = useState(false);
  const visible = priorityOnly ? state.objectives.filter((objective) => objective.priority) : state.objectives;

  return <section className="slo-study-prototype slo-board-proposal" aria-label="Confidence board proposal">
    <PrototypeToolbar selectedCount={state.selected.size}><button type="button" className={priorityOnly ? "secondary active" : "secondary"} onClick={() => setPriorityOnly((current) => !current)}>Priority only</button></PrototypeToolbar>
    <div className="slo-board-meta"><span>MCF</span><span>Weeks 2–3</span><button type="button" onClick={() => state.setSelected(new Set(visible.map((objective) => objective.id)))}>Select all shown</button></div>
    <div className="slo-confidence-board">
      {(["weak", "okay", "strong"] as Strength[]).map((strength) => {
        const objectives = visible.filter((objective) => objective.strength === strength);
        return <section key={strength} className="slo-confidence-column">
          <header><h3>{strengthLabel[strength]}</h3><span>{objectives.length}</span></header>
          <div>{objectives.map((objective) => <article key={objective.id} className={state.selected.has(objective.id) ? "selected" : ""}>
            <header><label><input type="checkbox" checked={state.selected.has(objective.id)} onChange={() => state.toggleSelected(objective.id)}/><span>SLO {objective.number}</span></label><button type="button" className={objective.priority ? "active" : ""} onClick={() => state.togglePriority(objective.id)}>Priority</button></header>
            <small>Week {objective.week} · {objective.lecture}</small>
            <p>{objective.text}</p>
            <select aria-label={`Confidence for ${objective.text}`} value={objective.strength} onChange={(event) => state.setStrength(objective.id, event.target.value as Strength)}><option value="weak">Weak</option><option value="okay">O.K.</option><option value="strong">Strong</option></select>
          </article>)}</div>
        </section>;
      })}
    </div>
  </section>;
}

export function SloLedgerProposal() {
  const state = useObjectiveState(["gly-2", "gly-3", "chr-2", "emb-2"]);
  const [week, setWeek] = useState("all");
  const [strength, setStrengthFilter] = useState("all");
  const [priorityOnly, setPriorityOnly] = useState(false);
  const visible = state.objectives.filter((objective) => (week === "all" || objective.week === Number(week)) && (strength === "all" || objective.strength === strength) && (!priorityOnly || objective.priority));
  const allSelected = visible.length > 0 && visible.every((objective) => state.selected.has(objective.id));

  function toggleAll() {
    state.setSelected((current) => {
      const next = new Set(current);
      if (allSelected) visible.forEach((objective) => next.delete(objective.id));
      else visible.forEach((objective) => next.add(objective.id));
      return next;
    });
  }

  return <section className="slo-study-prototype slo-ledger-proposal" aria-label="SLO ledger proposal">
    <PrototypeToolbar selectedCount={state.selected.size}/>
    <div className="slo-ledger-controls">
      <label><span>Course</span><select defaultValue="MCF"><option>MCF</option></select></label>
      <label><span>Week</span><select value={week} onChange={(event) => setWeek(event.target.value)}><option value="all">All weeks</option><option value="2">Week 2</option><option value="3">Week 3</option></select></label>
      <label><span>Confidence</span><select value={strength} onChange={(event) => setStrengthFilter(event.target.value)}><option value="all">All levels</option><option value="weak">Weak</option><option value="okay">O.K.</option><option value="strong">Strong</option></select></label>
      <label className="slo-ledger-priority"><input type="checkbox" checked={priorityOnly} onChange={(event) => setPriorityOnly(event.target.checked)}/><span>Priority only</span></label>
    </div>
    <div className="slo-ledger-table-wrap">
      <table className="slo-ledger-table">
        <thead><tr><th><input type="checkbox" aria-label="Select all shown" checked={allSelected} onChange={toggleAll}/></th><th>Priority</th><th>Confidence</th><th>Week</th><th>Instructor</th><th>Lecture</th><th>SLO</th></tr></thead>
        <tbody>{visible.map((objective) => <tr key={objective.id} className={state.selected.has(objective.id) ? "selected" : ""}>
          <td><input type="checkbox" aria-label={`Select ${objective.text}`} checked={state.selected.has(objective.id)} onChange={() => state.toggleSelected(objective.id)}/></td>
          <td><button type="button" className={objective.priority ? "active" : ""} onClick={() => state.togglePriority(objective.id)}>{objective.priority ? "Yes" : "No"}</button></td>
          <td><select value={objective.strength} onChange={(event) => state.setStrength(objective.id, event.target.value as Strength)}><option value="weak">Weak</option><option value="okay">O.K.</option><option value="strong">Strong</option></select></td>
          <td>{objective.week}</td><td>{objective.instructor}</td><td>{objective.lecture}</td><td><strong>{objective.number}</strong><span>{objective.text}</span></td>
        </tr>)}</tbody>
      </table>
    </div>
    <footer className="slo-ledger-footer"><span>{visible.length} objectives shown</span><div><button type="button">Export</button><button type="button" disabled={!state.selected.size}>Study selected</button></div></footer>
  </section>;
}
