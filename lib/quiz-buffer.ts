import { freshQuizProgress, nextQuestionPlan, recordQuizAnswer, shuffleQuizChoices, validateQuizQuestion, QuizGenerationError, type QuizProgress, type QuizQuestion, type QuizReservation, type QuizSource, type QuizTopic } from "./adaptive-quiz.ts";

export type BufferedQuizService = {
  topics(source:QuizSource,signal:AbortSignal):Promise<QuizTopic[]>;
  question(source:QuizSource,topics:QuizTopic[],progress:QuizProgress,signal:AbortSignal,pending?:QuizReservation[]):Promise<QuizQuestion>;
};
type Slot = {plan:ReturnType<typeof nextQuestionPlan>; question?:QuizQuestion; state:"waiting"|"loading"|"ready"|"failed"; error?:string};
export type QuizBufferSnapshot = {progress:QuizProgress; current:QuizQuestion|null; ready:number; initialized:boolean; busy:boolean; error:string; retrying:boolean};
export const QUIZ_BUFFER_SIZE=5;
const pause=(ms:number,signal:AbortSignal)=>new Promise<void>((resolve,reject)=>{
  if(signal.aborted){reject(new Error("Cancelled"));return;}
  const cancel=()=>{clearTimeout(timer);reject(new Error("Cancelled"));};
  const timer=setTimeout(()=>{signal.removeEventListener("abort",cancel);resolve();},ms);
  signal.addEventListener("abort",cancel,{once:true});
});
const signature=(s:string)=>s.toLowerCase().replace(/\W/g,"");

// Owns only in-memory state. Slots stay ordered even when requests finish out of order.
export class QuizBuffer {
  private controller=new AbortController();
  private slots:Slot[]=[];
  private topics:QuizTopic[]=[];
  private progress=freshQuizProgress();
  private active=0;
  private loadingTopics=false;
  private error="";
  private initialized=false;
  private retries=0;
  private begun=false;
  private source:QuizSource;
  private service:BufferedQuizService;
  private changed:(snapshot:QuizBufferSnapshot)=>void;
  private sleep:typeof pause;
  constructor(source:QuizSource,service:BufferedQuizService,changed:(snapshot:QuizBufferSnapshot)=>void,sleep=pause){this.source=source;this.service=service;this.changed=changed;this.sleep=sleep;}
  snapshot():QuizBufferSnapshot {
    return {progress:this.progress,current:this.initialized?this.slots[0]?.question??null:null,ready:this.slots.filter(s=>s.state==="ready").length,initialized:this.initialized,busy:this.loadingTopics||this.active>0,error:this.error||this.slots.find(s=>s.state==="failed")?.error||"",retrying:this.retries>0};
  }
  private emit(){if(!this.controller.signal.aborted)this.changed(this.snapshot());}
  async start(){
    if(this.begun||this.controller.signal.aborted)return;
    this.begun=true;this.loadingTopics=true;this.error="";this.emit();
    try{this.topics=await this.service.topics(this.source,this.controller.signal);if(!this.topics.length)throw new Error("No lecture topics available.");}
    catch(error){if(!this.controller.signal.aborted)this.error=error instanceof Error?error.message:"Could not read lecture topics.";}
    finally{this.loadingTopics=false;}
    if(this.controller.signal.aborted)return;
    if(!this.error)this.fill();
    this.emit();
  }
  private reservations(slots=this.slots):QuizReservation[]{return slots.map(s=>({topicId:s.plan.topic.id,kind:s.plan.kind,stem:s.question?`${s.question.vignette} ${s.question.stem}`.slice(0,2400):""}));}
  private fill(){
    if(this.controller.signal.aborted)return;
    while(this.slots.length<QUIZ_BUFFER_SIZE)this.slots.push({plan:nextQuestionPlan(this.topics,this.progress,this.reservations()),state:"waiting"});
    this.pump();
  }
  private pump(){
    if(this.controller.signal.aborted)return;
    // Two concurrent requests provide headroom without a five-call burst.
    while(this.active<2){const slot=this.slots.find(s=>s.state==="waiting");if(!slot)break;slot.state="loading";this.active++;void this.generate(slot);}
  }
  private async generate(slot:Slot){
    const signal=this.controller.signal;
    try{
      for(let attempt=0;attempt<3;attempt++){
        if(signal.aborted)return;
        const pending=this.reservations(this.slots.slice(0,this.slots.indexOf(slot)));
        const progress=this.progress;
        slot.plan=nextQuestionPlan(this.topics,progress,pending);
        try{
          const result=await this.service.question(this.source,this.topics,progress,signal,pending);
          if(signal.aborted)return;
          let checked:QuizQuestion;
          try{
            checked=validateQuizQuestion(result,slot.plan,this.source);
            const key=signature(`${checked.vignette} ${checked.stem}`.slice(0,2400));
            if(this.progress.recent.some(q=>signature(q.stem)===key)||this.slots.some(s=>s!==slot&&s.question&&signature(`${s.question.vignette} ${s.question.stem}`.slice(0,2400))===key))throw new Error("Question repeated an existing case.");
          }catch(error){throw new QuizGenerationError(error instanceof Error?error.message:"Invalid question.",true);}
          slot.question=shuffleQuizChoices(checked);slot.state="ready";return;
        }catch(error){
          if(signal.aborted)return;
          if(!(error instanceof QuizGenerationError)||!error.quality)throw error;
          if(attempt===2)throw new Error("Luna could not produce a valid question after automatic retries. Your prepared questions and progress are safe.");
          this.retries++;this.emit();
          try{await this.sleep((attempt+1)*1000,signal);}finally{this.retries--;}
        }
      }
    }catch(error){slot.state="failed";slot.error=error instanceof Error?error.message:"Question generation failed.";}
    finally{
      this.active--;
      if(!signal.aborted){
        if(this.slots.length===QUIZ_BUFFER_SIZE&&this.slots.every(s=>s.state==="ready"))this.initialized=true;
        this.pump();this.emit();
      }
    }
  }
  answer(questionId:string,index:number){
    const question=this.snapshot().current;
    if(!question||question.id!==questionId)throw new Error("This question has already been submitted.");
    this.progress=recordQuizAnswer(this.progress,question,index);
    this.slots.shift();this.fill();this.emit();
  }
  retry(){
    if(this.controller.signal.aborted)return;
    if(this.error){this.begun=false;void this.start();return;}
    for(const s of this.slots)if(s.state==="failed"){s.state="waiting";s.error="";}
    this.pump();this.emit();
  }
  dispose(){this.controller.abort();this.slots=[];this.progress=freshQuizProgress();}
}
