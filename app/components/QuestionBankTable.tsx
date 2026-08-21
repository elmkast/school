"use client";

import type { QuestionRecord } from "../../lib/lecture-store";

export type QuestionTableColumn = "question" | "course" | "week" | "instructor" | "lecture" | "sourceType" | "source" | "topic" | "completed" | "incorrect";
export type QuestionTableFilters = Partial<Record<QuestionTableColumn, Set<string>>>;

export type QuestionTableRow = {
  key: string;
  ownerKind: "lecture" | "preread";
  ownerId: string;
  question: QuestionRecord;
  course: string;
  week: number | null;
  instructor: string;
  lecture: string;
  sourceType: string;
  sourceLabel: string;
};

const columns: Array<{ key: QuestionTableColumn; label: string; required?: boolean; numeric?: boolean }> = [
  { key: "question", label: "Question", required: true },
  { key: "course", label: "Course" },
  { key: "week", label: "Week" },
  { key: "instructor", label: "Instructor" },
  { key: "lecture", label: "Lecture" },
  { key: "sourceType", label: "Slide/SLO-based" },
  { key: "source", label: "Slide or SLO" },
  { key: "topic", label: "Topic" },
  { key: "completed", label: "Completed", numeric: true },
  { key: "incorrect", label: "Incorrect", numeric: true },
];

export function questionColumnValue(row: QuestionTableRow, column: QuestionTableColumn) {
  if (column === "question") return row.question.prompt;
  if (column === "course") return row.course;
  if (column === "week") return row.week === null ? "Unassigned" : `Week ${row.week}`;
  if (column === "instructor") return row.instructor;
  if (column === "lecture") return row.lecture;
  if (column === "sourceType") return row.sourceType;
  if (column === "source") return row.sourceLabel;
  if (column === "topic") return row.question.topic || "Unassigned";
  if (column === "completed") return String(row.question.timesSeen);
  return String(row.question.timesIncorrect);
}

export function filterQuestionRows(rows: QuestionTableRow[], filters: QuestionTableFilters) {
  return rows.filter((row) => columns.every(({ key }) => {
    const selected = filters[key];
    return !selected || selected.has(questionColumnValue(row, key));
  }));
}

function FilterHeading({ column, rows, filters, onChange }: { column: typeof columns[number]; rows: QuestionTableRow[]; filters: QuestionTableFilters; onChange(filters: QuestionTableFilters): void }) {
  const values = Array.from(new Set(rows.map((row) => questionColumnValue(row, column.key)))).sort((a, b) => column.numeric ? Number(a) - Number(b) : a.localeCompare(b));
  const selected = filters[column.key];
  const active = Boolean(selected && selected.size < values.length);
  const toggle = (value: string) => {
    const nextValues = selected ? new Set(selected) : new Set(values);
    if (nextValues.has(value)) nextValues.delete(value); else nextValues.add(value);
    onChange({ ...filters, [column.key]: nextValues.size === values.length ? undefined : nextValues });
  };
  return <details className={`question-column-filter ${active ? "active" : ""}`}>
    <summary>{column.label}<span aria-hidden="true">▾</span></summary>
    <div className="question-filter-menu">
      <header><strong>Filter {column.label}</strong><button type="button" onClick={() => onChange({ ...filters, [column.key]: undefined })}>All</button></header>
      <div>{values.map((value) => <label key={value}><input type="checkbox" checked={!selected || selected.has(value)} onChange={() => toggle(value)}/><span>{value || "Blank"}</span></label>)}</div>
      <footer><button type="button" onClick={() => onChange({ ...filters, [column.key]: new Set<string>() })}>Select none</button></footer>
    </div>
  </details>;
}

export function QuestionBankTable({ rows, filters, onFiltersChange, hiddenColumns, onHiddenColumnsChange, selectedKeys, onSelectedKeysChange, onOpenSource, onAskLuna, onRemove, compact = false }: {
  rows: QuestionTableRow[];
  filters: QuestionTableFilters;
  onFiltersChange(filters: QuestionTableFilters): void;
  hiddenColumns: Set<QuestionTableColumn>;
  onHiddenColumnsChange(columns: Set<QuestionTableColumn>): void;
  selectedKeys: Set<string>;
  onSelectedKeysChange(keys: Set<string>): void;
  onOpenSource(row: QuestionTableRow): void;
  onAskLuna?(row: QuestionTableRow): void;
  onRemove?(row: QuestionTableRow): void;
  compact?: boolean;
}) {
  const visibleRows = filterQuestionRows(rows, filters);
  const visibleColumns = columns.filter((column) => !hiddenColumns.has(column.key));
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((row) => selectedKeys.has(row.key));
  const setVisibleSelection = (selected: boolean) => {
    const next = new Set(selectedKeys);
    visibleRows.forEach((row) => selected ? next.add(row.key) : next.delete(row.key));
    onSelectedKeysChange(next);
  };
  return <section className={`question-table-system ${compact ? "compact" : ""}`}>
    <div className="question-table-toolbar">
      <span><strong>{visibleRows.length}</strong> of {rows.length} questions · <strong>{selectedKeys.size}</strong> selected</span>
      <div><button type="button" onClick={() => setVisibleSelection(true)}>Select all filtered</button><button type="button" onClick={() => onSelectedKeysChange(new Set())}>Clear selection</button><details className="question-column-chooser"><summary>Columns</summary><div>{columns.filter((column) => !column.required).map((column) => <label key={column.key}><input type="checkbox" checked={!hiddenColumns.has(column.key)} onChange={() => { const next = new Set(hiddenColumns); if (next.has(column.key)) next.delete(column.key); else next.add(column.key); onHiddenColumnsChange(next); }}/><span>{column.label}</span></label>)}</div></details><button type="button" onClick={() => onFiltersChange({})}>Clear filters</button></div>
    </div>
    <div className="question-table-scroll"><table className="question-bank-table">
      <thead><tr><th className="question-select-cell"><input aria-label="Select all filtered questions" type="checkbox" checked={allVisibleSelected} onChange={(event) => setVisibleSelection(event.target.checked)}/></th>{visibleColumns.map((column) => <th key={column.key}><FilterHeading column={column} rows={rows} filters={filters} onChange={onFiltersChange}/></th>)}{(onAskLuna || onRemove) && <th>Actions</th>}</tr></thead>
      <tbody>{visibleRows.map((row) => <tr key={row.key} className={selectedKeys.has(row.key) ? "selected" : ""}>
        <td className="question-select-cell"><input aria-label={`Select question: ${row.question.prompt}`} type="checkbox" checked={selectedKeys.has(row.key)} onChange={(event) => { const next = new Set(selectedKeys); if (event.target.checked) next.add(row.key); else next.delete(row.key); onSelectedKeysChange(next); }}/></td>
        {visibleColumns.map((column) => <td key={column.key} data-column={column.key}>{column.key === "source" ? <button className="question-source-link" type="button" onClick={() => onOpenSource(row)}>{row.sourceLabel}</button> : questionColumnValue(row, column.key)}</td>)}
        {(onAskLuna || onRemove) && <td className="question-row-actions">{onAskLuna && <button type="button" onClick={() => onAskLuna(row)}>Ask Luna</button>}{onRemove && <button className="danger" type="button" onClick={() => onRemove(row)}>Remove</button>}</td>}
      </tr>)}</tbody>
    </table>{visibleRows.length === 0 && <div className="question-table-empty">No questions match the current column filters.</div>}</div>
  </section>;
}
