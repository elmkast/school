"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Lecture } from "../../lib/lecture-store";
import { freshQuizProgress, makeQuizSource, nextQuestionPlan, quizCorrectCount, recordQuizAnswer, shuffleQuizChoices, validateQuizQuestion, type QuizProgress, type QuizQuestion, type QuizSource, type QuizTopic } from "../../lib/adaptive-quiz";
import { liveQuizService, type QuizService } from "../../lib/quiz-client";
import "./adaptive-quiz.css";

export function AdaptiveQuiz({lectures,initialLectureId="",onExit,service=liveQuizService,preview=false}: {
  lectures:Lecture[];initialLectureId?:string;onExit():void;service?:QuizService;preview?:boolean;
}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const questionHeading=useRef<HTMLHeadingElement>(null);
  const pending=useRef<AbortController|null>(null);
  const serial=useRef(0);
  const submitted=useRef(false);
  const [lectureId,setLectureId]=useState(initialLectureId);
  const [started,setStarted]=useState(false);
  const [source,setSource]=useState<QuizSource|null>(null);
  const [topics,setTopics]=useState<QuizTopic[]>([]);
  const [progress,setProgress]=useState<QuizProgress>(freshQuizProgress);
  const [question,setQuestion]=useState<QuizQuestion|null>(null);
  const [next,setNext]=useState<QuizQuestion|null>(null);
  const [choice,setChoice]=useState<number|null>(null);
  const [answered,setAnswered]=useState(false);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const lecture=lectures.find(l=>l.id===lectureId);
  const feedbackCorrect=choice===question?.correctIndex;

  useEffect(()=>{const element=dialog.current;element?.showModal();return ()=>{pending.current?.abort();element?.close();};},[]);
  useEffect(()=>{if(question&&!answered)questionHeading.current?.focus();},[question,answered]);
  function exit(){serial.current++;pending.current?.abort();onExit();}

  async function generate(s:QuizSource,knownTopics:QuizTopic[],p:QuizProgress,upcoming:boolean){
    pending.current?.abort();const controller=new AbortController();pending.current=controller;
    const request=++serial.current;setBusy(knownTopics.length?"Writing next question…":"Reading lecture topics…");setError("");
    try{
      const ts=knownTopics.length?knownTopics:await service.topics(s,controller.signal);
      if(controller.signal.aborted||serial.current!==request)return;
      setTopics(ts);setBusy("Writing next question…");
      const result=await service.question(s,ts,p,controller.signal);
      if(controller.signal.aborted||serial.current!==request)return;
      const checked=validateQuizQuestion(result,nextQuestionPlan(ts,p),s);
      const shuffled=shuffleQuizChoices(checked);
      if(upcoming)setNext(shuffled);else {setQuestion(shuffled);setChoice(null);setAnswered(false);submitted.current=false;}
    }catch(err){if(!controller.signal.aborted&&serial.current===request)setError(err instanceof Error?err.message:"Could not generate a question. Please retry.");}
    finally{if(serial.current===request&&!controller.signal.aborted)setBusy("");}
  }
  function start(){
    if(!lecture||busy)return;
    try{const s=makeQuizSource(lecture);const p=freshQuizProgress();setSource(s);setProgress(p);setStarted(true);void generate(s,[],p,false);}
    catch(err){setError(err instanceof Error?err.message:"This lecture cannot be used for a quiz.");}
  }
  function submit(){
    if(choice===null||!question||!source||submitted.current)return;
    submitted.current=true;const p=recordQuizAnswer(progress,question,choice);setProgress(p);setAnswered(true);setNext(null);
    // Wait for this answer before any generation: its outcome drives the next question.
    void generate(source,topics,p,true);
  }
  function advance(){if(!next)return;setQuestion(next);setNext(null);setChoice(null);setAnswered(false);submitted.current=false;dialog.current?.scrollTo({top:0});}

  return createPortal(<dialog className="adaptive-quiz" ref={dialog} aria-label="Lecture quiz" onCancel={event=>{event.preventDefault();exit();}}>
    <header><div><strong>{started?source?.title:"Quiz"}</strong>{preview&&<span className="aq-preview">Preview · no API calls</span>}</div><button type="button" onClick={exit}>Exit quiz</button></header>
    {!started?<div className="aq-setup"><label htmlFor="quiz-lecture">Lecture</label><select id="quiz-lecture" value={lectureId} onChange={e=>{setLectureId(e.target.value);setError("");}}><option value="">Select a lecture</option>{[...lectures].sort((a,b)=>a.course.localeCompare(b.course)||(b.week??0)-(a.week??0)||a.title.localeCompare(b.title)).map(l=><option value={l.id} key={l.id}>{l.course} · {l.week?`Week ${l.week}`:"Unassigned week"} · {l.title}</option>)}</select><p>Adaptive multiple choice. At least 70% clinical, second-order questions. Exiting clears the session.</p>{error&&<p className="aq-error" role="alert">{error}</p>}<button className="aq-primary" disabled={!lecture||Boolean(busy)} onClick={start}>Start quiz</button></div>:<>
      <div className="aq-status"><span>Question {progress.answered+(answered?0:1)}</span><span>{quizCorrectCount(progress)} / {progress.answered} correct</span><span className="aq-status-note">AI-generated practice · not official NBME material</span></div>
      {source?.truncated&&!question&&<p className="aq-source-note">This long lecture uses excerpts from every text-bearing slide.</p>}
      {question&&<div className="aq-question">
        {question.vignette&&<p className="aq-vignette">{question.vignette}</p>}
        <h2 ref={questionHeading} tabIndex={-1}>{question.stem}</h2>
        <fieldset disabled={answered}><legend className="aq-sr-only">Choose one answer</legend>{question.choices.map((option,index)=><label key={index} className={`aq-option ${answered&&index===question.correctIndex?"aq-correct":""} ${answered&&index===choice&&index!==question.correctIndex?"aq-incorrect":""}`}><input type="radio" name={`answer-${question.id}`} checked={choice===index} onChange={()=>setChoice(index)}/><span className="aq-letter">{String.fromCharCode(65+index)}.</span><span>{option.text}</span>{answered&&index===question.correctIndex&&<small>Correct answer</small>}{answered&&index===choice&&index!==question.correctIndex&&<small>Your answer</small>}</label>)}</fieldset>
        {!answered&&<button className="aq-primary" disabled={choice===null} onClick={submit}>Submit answer</button>}
        {answered&&<section className="aq-feedback" aria-label="Answer feedback"><h3>{feedbackCorrect?"Correct":"Incorrect"}</h3><p>{question.explanation}</p><ol>{question.reasoningSteps.map((step,i)=><li key={i}>{step}</li>)}</ol><p><b>Takeaway:</b> {question.teachingPoint}</p><details><summary>Answer explanations</summary>{question.choices.map((c,i)=><p key={i}><b>{String.fromCharCode(65+i)}. {c.text}</b><br/>{c.rationale}</p>)}</details><details><summary>Lecture source · {question.sourcePages.map(p=>`p. ${p}`).join(", ")}</summary><blockquote>{question.sourceQuote}</blockquote>{question.sourcePages.map(p=><div className="aq-source-text" key={p}><b>Page {p}</b><p>{source?.slides.find(s=>s.page===p)?.text}</p></div>)}</details></section>}
      </div>}
      {(busy||error||answered)&&<footer className="aq-generation">{busy&&<span role="status">{busy}</span>}{error&&<div className="aq-error" role="alert"><p>{error}</p><button onClick={()=>source&&void generate(source,topics,progress,answered)}>Retry generation</button></div>}{answered&&<button className="aq-primary" disabled={!next} onClick={advance}>Next question</button>}</footer>}
    </>}
  </dialog>,document.body);
}
