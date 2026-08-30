"use client";

import { PdfControlBarProposals } from "./PdfControlBarProposals";

export function ComponentReview() {
  return <main className="component-review-page upload-review-sheet">
    <header className="component-review-header">
      <div><small>Internal UX review</small><h1>FCOM.lib interface</h1></div>
      <button type="button" onClick={() => { window.location.href = "/"; }}>Return to FCOM.lib</button>
    </header>
    <PdfControlBarProposals />
  </main>;
}
