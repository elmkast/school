import { useMemo, useRef, useState } from "react";
import { AdaptiveQuiz } from "../AdaptiveQuiz";
import { nextQuestionPlan, validateQuizQuestion } from "../../../lib/adaptive-quiz";
import type { QuizService } from "../../../lib/quiz-client";
import type { Lecture } from "../../../lib/lecture-store";

const demoLecture:Lecture={id:"quiz-preview",title:"Enzyme kinetics · sample",lecturer:"Sample instructor",course:"MCF",week:3,academicYear:"2026-2027",favorite:false,pages:1,slos:[],outline:[],toc:[],summary:"",notes:{},markups:{},markedSlides:[],flaggedSLOs:[],sloStrengths:{},studySLOs:[],createdAt:"2026-09-10",slides:[{page:1,heading:"Competitive inhibition",text:"Competitive inhibition increases apparent Km while Vmax is unchanged. This results in more substrate being required to reach half the maximal rate."}]};

export function QuizReview(){
  const [open,setOpen]=useState(false);
  const [requests,setRequests]=useState(0);
  const [simulateFailure,setSimulateFailure]=useState(false);
  const fail=useRef(false);
  const service=useMemo<QuizService>(()=>({
    async topics(){return [{id:"t1",title:"Competitive inhibition",pages:[1]}];},
    async question(source,topics,progress,signal){
      setRequests(n=>n+1);
      await new Promise<void>((resolve,reject)=>{
        if(signal.aborted){reject(new Error("Cancelled"));return;}
        const cancel=()=>{clearTimeout(timer);reject(new Error("Cancelled"));};
        const timer=setTimeout(()=>{signal.removeEventListener("abort",cancel);resolve();},900);
        signal.addEventListener("abort",cancel,{once:true});
      });
      if(fail.current){fail.current=false;throw new Error("Simulated connection failure. Retry keeps this session intact.");}
      const plan=nextQuestionPlan(topics,progress);
      return validateQuizQuestion({vignette:plan.kind==="clinical"?"A patient participates in a study of a reversible inhibitor. The laboratory tests an enzyme sample with and without the compound at several substrate concentrations. The same maximal reaction rate is eventually reached in both preparations, but more substrate is required to reach half of that rate in the treated preparation. No change in the amount of enzyme is measured.":"",stem:plan.kind==="clinical"?`${progress.answered?"In a new experiment, which":"Which"} change in kinetic parameters best fits these findings?`:"Which kinetic changes characterize competitive inhibition?",choices:[{text:"Increased Km; unchanged Vmax",rationale:"A competitive inhibitor increases the apparent substrate requirement."},{text:"Decreased Km; unchanged Vmax",rationale:"Lower Km would predict less substrate needed, not more."},{text:"Unchanged Km; decreased Vmax",rationale:"A lower Vmax would change the maximal reaction rate."},{text:"Increased Km; increased Vmax",rationale:"There was no increase in the maximal rate."}],correctIndex:0,explanation:"The unchanged maximum with an increased substrate requirement is the pattern expected for competitive inhibition.",teachingPoint:"Competitive inhibition increases apparent Km without changing Vmax.",reasoningSteps:["Recognize competitive inhibition from the substrate-dependent shift with unchanged maximal activity.","Predict a higher apparent Km from that mechanism while Vmax stays the same."],sourcePages:[1],sourceQuote:"Competitive inhibition increases apparent Km while Vmax is unchanged."},plan,source);
    },
  }),[]);
  return <section style={{padding:28,minHeight:450}}>
    <h2>Adaptive quiz</h2><p>Interactive fixture. No API calls or saved results.</p>
    <p><label><input type="checkbox" checked={simulateFailure} onChange={e=>setSimulateFailure(e.target.checked)}/> Simulate first-request failure</label></p>
    <button className="ux-primary" onClick={()=>{fail.current=simulateFailure;setRequests(0);setOpen(true);}}>Open quiz preview</button>
    <p>Question requests: {requests}</p>
    {open&&<AdaptiveQuiz lectures={[demoLecture]} initialLectureId={demoLecture.id} service={service} preview onExit={()=>setOpen(false)}/>}
  </section>;
}
