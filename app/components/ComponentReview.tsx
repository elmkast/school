"use client";

import { UploadReviewPrototype } from "./UploadReviewPrototype";
import { SloReviewPrototype } from "./SloReviewPrototype";

export function ComponentReview() {
  return <main className="component-review-page upload-review-sheet">
    <header className="component-review-header">
      <div><small>Internal UX review</small><h1>FCOM.lib interface</h1></div>
      <button type="button" onClick={() => { window.location.href = "/"; }}>Return to FCOM.lib</button>
    </header>
    <section className="component-review-section component-review-section-wide">
      <div className="component-review-label"><span>Lecture import · Garamond</span></div>
      <UploadReviewPrototype />
    </section>
    <section className="component-review-section component-review-section-wide">
      <div className="component-review-label"><span>SLO page overhaul · Garamond</span></div>
      <SloReviewPrototype />
    </section>
  </main>;
}
