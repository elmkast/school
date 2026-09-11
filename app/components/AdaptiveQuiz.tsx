"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Lecture } from "../../lib/lecture-store";
import { freshQuizProgress, makeQuizSource, quizCorrectCount, type QuizQuestion, type QuizSource } from "../../lib/adaptive-quiz";
import { QuizBuffer, type QuizBufferSnapshot } from "../../lib/quiz-buffer";
import { liveQuizService, type QuizService } from "../../lib/quiz-client";
import "./adaptive-quiz.css";

export function AdaptiveQuiz({lectures,initialLectureId="",onExit,service=liveQuizService,preview=false}: {
  lectures:Lecture[];initialLectureId?:string;onExit():void;service?:QuizService;preview?:boolean;
}) {
  const dialog=useRef<HTMLDialogElement>(null);
  const questionHeading=useRef<HTMLHeadingElement>(null);
  const buffer=useRef<QuizBuffer|null>(null);
  const submitted=useRef(false);
  const [lectureId,setLectureId]=useState(initialLectureId);
  const [started,setStarted]=useState(false);
  const [source,setSource]=useState<QuizSource|null>(null);
  const [snapshot,setSnapshot]=useState<QuizBufferSnapshot>({progress:freshQuizProgress(),current:null,ready:0,initialized:false,busy:false,error:"",retrying:false});
  const [feedback,setFeedback]=useState<QuizQuestion|null>(null);
  const [choice,setChoice]=useState<number|null>(null);
  const [setupError,setSetupError]=useState("");
  const lecture=lectures.find(l=>l.id===lectureId);
  const question=feedback??snapshot.current;
  const answered=Boolean(feedback);
  const progress=snapshot.progress;
  const error=setupError||snapshot.error;
  const busy=snapshot.busy;
  const feedbackCorrect=choice===question?.correctIndex;

  useEffect(()=>{const element=dialog.current;element?.showModal();return ()=>{buffer.current?.dispose();element?.close();};},[]);
  useEffect(()=>{if(question&&!answered)questionHeading.current?.focus();},[question,answered]);
  function exit(){buffer.current?.dispose();onExit();}
  function start(){
    if(!lecture||buffer.current)return;
    try{
      const s=makeQuizSource(lecture);setSource(s);setStarted(true);setSetupError("");
      const session=new QuizBuffer(s,service,setSnapshot);buffer.current=session;void session.start();
    }catch(err){setSetupError(err instanceof Error?err.message:"This lecture cannot be used for a quiz.");}
  }
  function submit(){
    if(choice===null||!question||submitted.current||!buffer.current)return;
    submitted.current=true;setFeedback(question);buffer.current.answer(question.id,choice);
  }
  function advance(){
    if(!snapshot.current)return;
    setFeedback(null);setChoice(null);submitted.current=false;dialog.current?.scrollTo({top:0});
  }

  return createPortal(<dialog className="adaptive-quiz" ref={dialog} aria-label="Lecture quiz" onCancel={event=>{event.preventDefault();exit();}}>
    <header><div><strong>{started?source?.title:"Quiz"}</strong>{preview&&<span className="aq-preview">Preview · no API calls</span>}</div><button type="button" onClick={exit}>Exit quiz</button></header>
    {!started?<div className="aq-setup"><label htmlFor="quiz-lecture">Lecture</label><select id="quiz-lecture" value={lectureId} onChange={e=>{setLectureId(e.target.value);setSetupError("");}}><option value="">Select a lecture</option>{[...lectures].sort((a,b)=>a.course.localeCompare(b.course)||(b.week??0)-(a.week??0)||a.title.localeCompare(b.title)).map(l=><option value={l.id} key={l.id}>{l.course} · {l.week?`Week ${l.week}`:"Unassigned week"} · {l.title}</option>)}</select><p>Adaptive multiple choice. At least 70% clinical, second-order questions. Exiting clears the session.</p>{error&&<p className="aq-error" role="alert">{error}</p>}<button className="aq-primary" disabled={!lecture||Boolean(busy)} onClick={start}>Start quiz</button></div>:<>
      <div className="aq-status"><span>Question {progress.answered+(answered?0:1)}</span><span>{quizCorrectCount(progress)} / {progress.answered} correct</span><span className="aq-status-note">AI-generated practice · not official NBME material</span></div>
      {source?.truncated&&!question&&<p className="aq-source-note">This long lecture uses excerpts from every text-bearing slide.</p>}
      {question&&<div className="aq-question">
        {question.vignette&&<p className="aq-vignette">{question.vignette}</p>}
        <h2 ref={questionHeading} tabIndex={-1}>{question.stem}</h2>
        <fieldset disabled={answered}><legend className="aq-sr-only">Choose one answer</legend>{question.choices.map((option,index)=><label key={index} className={`aq-option ${answered&&index===question.correctIndex?"aq-correct":""} ${answered&&index===choice&&index!==question.correctIndex?"aq-incorrect":""}`}><input type="radio" name={`answer-${question.id}`} checked={choice===index} onChange={()=>setChoice(index)}/><span className="aq-letter">{String.fromCharCode(65+index)}.</span><span>{option.text}</span>{answered&&index===question.correctIndex&&<small>Correct answer</small>}{answered&&index===choice&&index!==question.correctIndex&&<small>Your answer</small>}</label>)}</fieldset>
        {!answered&&<button className="aq-primary" disabled={choice===null} onClick={submit}>Submit answer</button>}
        {answered&&<section className="aq-feedback" aria-label="Answer feedback"><h3>{feedbackCorrect?"Correct":"Incorrect"}</h3><p>{question.explanation}</p><ol>{question.reasoningSteps.map((step,i)=><li key={i}>{step}</li>)}</ol><p><b>Takeaway:</b> {question.teachingPoint}</p><details><summary>Answer explanations</summary>{question.choices.map((c,i)=><p key={i}><b>{String.fromCharCode(65+i)}. {c.text}</b><br/>{c.rationale}</p>)}</details><details><summary>Lecture source · {question.sourcePages.map(p=>`p. ${p}`).join(", ")}</summary><blockquote>{question.sourceQuote}</blockquote>{question.sourcePages.map(p=><div className="aq-source-text" key={p}><b>Page {p}</b><p>{source?.slides.find(s=>s.page===p)?.text}</p></div>)}</details></section>}
      </div>}
      {((busy&&(!snapshot.initialized||!snapshot.current||snapshot.retrying))||error||answered)&&<footer className="aq-generation">{busy&&(!snapshot.initialized||!snapshot.current||snapshot.retrying)&&<span role="status">{snapshot.retrying?"Replacing a question…":!snapshot.initialized?`Preparing quiz · ${snapshot.ready}/5 ready`:"Preparing next question…"}</span>}{error&&<div className="aq-error" role="alert"><p>{error}</p><button onClick={()=>buffer.current?.retry()}>Retry generation</button></div>}{answered&&<button className="aq-primary" disabled={!snapshot.current} onClick={advance}>Next question</button>}</footer>}
    </>}
  </dialog>,document.body);
}
