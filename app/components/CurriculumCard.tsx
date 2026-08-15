import type { ReactNode } from "react";
import { LECTURE_WEEK_OPTIONS, lectureWeekLabel } from "../../lib/curriculum";
import { AppIcon } from "./AppIcon";

type CurriculumCardProps = {
  title: string;
  course: string;
  lecturer: string;
  week: number | null;
  countLabel: string;
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  onSelect?: () => void;
  selected?: boolean;
  expanded?: boolean;
  weekEditable?: boolean;
  onWeekChange?: (value: string) => void;
  countTooltip?: ReactNode;
  favorite?: boolean;
  onToggleFavorite?: () => void;
  onRemove?: () => void;
  children?: ReactNode;
  className?: string;
};

export function CurriculumCard({
  title,
  course,
  lecturer,
  week,
  countLabel,
  primaryActionLabel,
  onPrimaryAction,
  onSelect,
  selected = false,
  expanded = false,
  weekEditable = false,
  onWeekChange,
  countTooltip,
  favorite = false,
  onToggleFavorite,
  onRemove,
  children,
  className = "",
}: CurriculumCardProps) {
  const hasActions = Boolean(onToggleFavorite || onRemove);
  const selectCard = onSelect ?? onPrimaryAction;
  const cardClass = ["lecture-card", "curriculum-card", expanded ? "expanded" : "", selected ? "selected" : "", className].filter(Boolean).join(" ");

  return <article className={cardClass}>
    <button className="lecture-open" onClick={selectCard}>
      <span className="lecture-copy">
        <small>{course.toUpperCase()}</small>
        <strong>{title}</strong>
        <em>{lecturer} · {lectureWeekLabel(week)}</em>
      </span>
    </button>

    {weekEditable ? <label className={`lecture-week-control ${hasActions ? "" : "curriculum-week-readonly-position"}`.trim()}>
      <select aria-label={`Curriculum week for ${title}`} value={week ?? ""} onChange={(event) => onWeekChange?.(event.target.value)}>
        <option value="">Week —</option>
        {LECTURE_WEEK_OPTIONS.map((option) => <option key={option} value={option}>Week {option}</option>)}
      </select>
    </label> : <span className="lecture-week-control lecture-week-display curriculum-week-readonly-position" aria-label={`Curriculum week: ${lectureWeekLabel(week)}`}>{lectureWeekLabel(week)}</span>}

    <div className="lecture-card-rail">
      {countTooltip ? <><button className="lecture-slo-peek" aria-label={`Preview ${countLabel}`}><b>{countLabel}</b></button><span className="slo-tooltip" role="tooltip">{countTooltip}</span></> : <span className="catalog-count">{countLabel}</span>}
      <button className="card-open-brief" onClick={onPrimaryAction}><span>{primaryActionLabel}</span></button>
    </div>

    {hasActions && <span className="lecture-actions">
      {onToggleFavorite && <button className={favorite ? "favorited" : ""} aria-label={favorite ? "Remove from favorites" : "Add to favorites"} title={favorite ? "Remove from favorites" : "Add to favorites"} onClick={onToggleFavorite}><AppIcon name="star"/></button>}
      {onRemove && <button className="remove-action" aria-label="Remove lecture" title="Remove lecture" onClick={onRemove}><AppIcon name="trash"/></button>}
    </span>}

    {expanded && children}
  </article>;
}
