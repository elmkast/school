import type { ReactNode } from "react";

type CurriculumPageToolbarProps = {
  heading: ReactNode;
  filters?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function CurriculumPageToolbar({ heading, filters, actions, className = "" }: CurriculumPageToolbarProps) {
  return <div className={`page-toolbar curriculum-page-toolbar ${className}`.trim()}>
    <div className="curriculum-page-heading">{heading}</div>
    {(filters || actions) && <div className="page-toolbar-actions">
      {filters && <div className="lecture-toolbar-controls">{filters}</div>}
      {actions}
    </div>}
  </div>;
}
