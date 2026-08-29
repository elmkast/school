"use client";

import { UploadReviewPrototype } from "./UploadReviewPrototype";
import { SloBoardProposal, SloComposerProposal, SloLedgerProposal } from "./SloStudyProposals";

export function ComponentReview() {
  return <main className="component-review-page upload-review-sheet">
    <header className="component-review-header">
      <div><small>Internal UX review</small><h1>FCOM.lib interface</h1></div>
      <button type="button" onClick={() => { window.location.href = "/"; }}>Return to FCOM.lib</button>
    </header>
    <section className="component-review-section component-review-section-wide">
      <div className="component-review-label"><span>Lecture import · Georgia</span></div>
      <UploadReviewPrototype />
    </section>
    <section className="component-review-section component-review-section-wide">
      <div className="component-review-label"><span>A · Study set composer</span></div>
      <SloComposerProposal />
    </section>
    <section className="component-review-section component-review-section-wide">
      <div className="component-review-label"><span>B · Confidence board</span></div>
      <SloBoardProposal />
    </section>
    <section className="component-review-section component-review-section-wide">
      <div className="component-review-label"><span>C · Study ledger</span></div>
      <SloLedgerProposal />
    </section>
  </main>;
}
