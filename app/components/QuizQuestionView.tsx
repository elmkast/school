"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import type { QuizQuestion } from "../../lib/adaptive-quiz";

type Props = {
  question: QuizQuestion;
  choice: number | null;
  answered: boolean;
  feedbackCorrect: boolean;
  questionHeading?: RefObject<HTMLHeadingElement | null>;
  submitLabel?: string;
  onChoice(value: number): void;
  onSubmit(): void;
  children?: ReactNode;
};

export function QuizQuestionView({ question, choice, answered, feedbackCorrect, questionHeading, submitLabel = "Submit answer", onChoice, onSubmit, children }: Props) {
  const localHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!answered) (questionHeading?.current ?? localHeading.current)?.focus();
  }, [question, answered, questionHeading]);

  return <div className="aq-question">
    {question.vignette && <p className="aq-vignette">{question.vignette}</p>}
    <h2 ref={questionHeading ?? localHeading} tabIndex={-1}>{question.stem}</h2>
    <fieldset disabled={answered}>
      <legend className="aq-sr-only">Choose one answer</legend>
      {question.choices.map((option, index) => <label key={index} className={`aq-option ${answered && index === question.correctIndex ? "aq-correct" : ""} ${answered && index === choice && index !== question.correctIndex ? "aq-incorrect" : ""}`}>
        <input type="radio" name={`answer-${question.id}`} checked={choice === index} onChange={() => onChoice(index)} />
        <span className="aq-letter">{String.fromCharCode(65 + index)}.</span><span>{option.text}</span>
        {answered && index === question.correctIndex && <small>Correct answer</small>}
        {answered && index === choice && index !== question.correctIndex && <small>Your answer</small>}
      </label>)}
    </fieldset>
    {!answered && <button className="aq-primary" disabled={choice === null} onClick={onSubmit}>{submitLabel}</button>}
    {answered && <section className="aq-feedback" aria-label="Answer feedback">
      <h3>{feedbackCorrect ? "Correct" : "Incorrect"}</h3><p>{question.explanation}</p>
      <ol>{question.reasoningSteps.map((step, index) => <li key={index}>{step}</li>)}</ol>
      <p><b>Takeaway:</b> {question.teachingPoint}</p>
      <details><summary>Answer explanations</summary>{question.choices.map((item, index) => <p key={index}><b>{String.fromCharCode(65 + index)}. {item.text}</b><br />{item.rationale}</p>)}</details>
      {children}
    </section>}
  </div>;
}
