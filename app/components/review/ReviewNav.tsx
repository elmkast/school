import type { ReactNode } from "react";

export function ReviewNav({ active, onArchive, onSlos, children }: {
  active: "Lectures" | "SLOs";
  onArchive(): void;
  onSlos(): void;
  children?: ReactNode;
}) {
  return <header className="ux-app-nav">
    <strong>lectures.lib</strong>
    <nav aria-label="Preview navigation">
      <button aria-current={active === "Lectures" ? "page" : undefined} onClick={onArchive}>Lectures</button>
      <button aria-current={active === "SLOs" ? "page" : undefined} onClick={onSlos}>SLOs</button>
    </nav>
    <div className="ux-nav-end">{children}</div>
  </header>;
}
