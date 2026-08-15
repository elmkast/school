"use client";

import type { CSSProperties, ReactNode } from "react";

type SidebarProps = {
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
  ariaLabel?: string;
};

type SidebarSectionProps = {
  children: ReactNode;
  className?: string;
  label?: string;
};

type SidebarItemProps = {
  label: string;
  active?: boolean;
  count?: number;
  depth?: number;
  expanded?: boolean;
  expandable?: boolean;
  quiet?: boolean;
  onClick?: () => void;
};

export function Sidebar({ children, className = "", footer, ariaLabel = "Curriculum navigation" }: SidebarProps) {
  return <aside className={`sidebar-system ${className}`.trim()} aria-label={ariaLabel}>
    <nav>{children}</nav>
    {footer && <footer className="sidebar-system-footer">{footer}</footer>}
  </aside>;
}

export function SidebarSection({ children, className = "", label }: SidebarSectionProps) {
  return <section className={`sidebar-system-section ${className}`.trim()}>
    {label && <div className="sidebar-system-section-label">{label}</div>}
    {children}
  </section>;
}

export function SidebarItem({ label, active = false, count, depth = 0, expanded = false, expandable = false, quiet = false, onClick }: SidebarItemProps) {
  return <button type="button" className={`sidebar-system-item ${active ? "active" : ""} ${quiet ? "quiet" : ""}`.trim()} style={{ "--sidebar-depth": depth } as CSSProperties} aria-current={active ? "page" : undefined} aria-expanded={expandable ? expanded : undefined} onClick={onClick}>
    {expandable ? <span className={`sidebar-system-chevron ${expanded ? "expanded" : ""}`} aria-hidden="true">›</span> : <span className="sidebar-system-spacer" />}
    <span className="sidebar-system-label">{label}</span>
    {typeof count === "number" && <SidebarCount value={count} />}
  </button>;
}

export function SidebarTree({ children }: { children: ReactNode }) {
  return <div className="sidebar-system-tree">{children}</div>;
}

export function SidebarTreeItem(props: SidebarItemProps) {
  return <SidebarItem {...props} />;
}

export function SidebarCount({ value }: { value: number }) {
  return <span className="sidebar-system-count" aria-label={`${value} items`}>{value}</span>;
}

export function SidebarDivider() {
  return <div className="sidebar-system-divider" role="separator" />;
}
