// Pure quiz logic shared by the UI and function. No storage or network access.
export type QuizSource = { id:string; title:string; slides:{page:number; heading:string; text:string}[]; truncated:boolean };
export type QuizTopic = { id:string; title:string; pages:number[] };
export type QuizKind = "clinical" | "knowledge";
export type QuizQuestion = {
  id:string; topicId:string; kind:QuizKind; difficulty:1|2|3;
  vignette:string; stem:string; choices:{text:string; rationale:string}[]; correctIndex:number;
  explanation:string; teachingPoint:string; reasoningSteps:string[]; sourcePages:number[]; sourceQuote:string;
};
export type TopicProgress = { correct:number; incorrect:number; streak:number; lastSeen:number };
export type QuizAttempt = { topicId:string; stem:string; selected:string; answer:string; correct:boolean; teachingPoint:string };
export type QuizProgress = { answered:number; clinical:number; topics:Record<string,TopicProgress>; recent:QuizAttempt[] };
export type QuizReservation = { topicId:string; kind:QuizKind; stem:string };
export class QuizGenerationError extends Error {
  quality:boolean;
  code:string;
  issues:string[];
  retryAfterMs:number;
  retryable:boolean;
  constructor(message:string,quality=false,options:{code?:string;issues?:string[];retryAfterMs?:number;retryable?:boolean}={}){
    super(message);this.quality=quality;this.code=options.code??(quality?"QUALITY_REJECTED":"UNAVAILABLE");this.issues=options.issues??[];this.retryAfterMs=options.retryAfterMs??0;this.retryable=options.retryable??quality;
  }
}
export type QuizRetryContext={attempt:number;issues:string[]};
export class QuizValidationError extends Error {
  code:string;
  constructor(code:string,message:string){super(message);this.code=code;}
}
export const freshQuizProgress = ():QuizProgress => ({answered:0,clinical:0,topics:{},recent:[]});
export const QUIZ_SOURCE_BUDGET = 140_000;

export function makeQuizSource(lecture:{id:string;title:string;slides:{page:number;heading:string;text:string}[]}):QuizSource {
  const usable = lecture.slides.filter(s=>s.text.trim().length>20);
  if (!usable.length) throw new Error("This lecture has no usable extracted slide text. Re-import a text-based PDF before starting a quiz.");
  if (usable.length>600) throw new Error("This lecture is too large for a single quiz. Split it into smaller PDFs.");
  const perPage = Math.min(6000, Math.floor(QUIZ_SOURCE_BUDGET/usable.length));
  let truncated=false;
  const slides=usable.map(s=>{
    let text=s.text.trim();
    if(text.length>perPage){truncated=true; const half=Math.floor((perPage-24)/2);text=`${text.slice(0,half)}\n[excerpt omitted]\n${text.slice(-half)}`;}
    return {page:s.page,heading:s.heading.slice(0,200),text};
  });
  return {id:lecture.id,title:lecture.title,slides,truncated};
}

export function nextQuestionPlan(topics:QuizTopic[], progress:QuizProgress, pending:QuizReservation[]=[]) {
  if (!topics.length) throw new Error("No quiz topics available.");
  const n=progress.answered+pending.length+1;
  // Every completed prefix remains >=70% clinical, even if the user exits early.
  const kind:QuizKind = progress.clinical+pending.filter(q=>q.kind==="clinical").length < Math.ceil(n*7/10) ? "clinical" : "knowledge";
  const stats=(id:string)=>progress.topics[id]??{correct:0,incorrect:0,streak:0,lastSeen:0};
  const unseen=topics.filter(t=>stats(t.id).lastSeen===0);
  const last=progress.recent.at(-1);
  const repeated=progress.recent.slice(-2).length===2 && progress.recent.slice(-2).every(a=>a.topicId===last?.topicId);
  let topic:QuizTopic;
  if(last&&!last.correct&&!repeated) topic=topics.find(t=>t.id===last.topicId)??topics[0];
  else if(unseen.length && (n%3===0 || !last || last.correct)) topic=unseen[0];
  else {
    const candidates=topics.length>1?topics.filter(t=>t.id!==last?.topicId):topics;
    topic=[...candidates].sort((a,b)=>{
      const score=(t:QuizTopic)=>{const s=stats(t.id);const total=s.correct+s.incorrect;return 4*(s.incorrect+1)/(total+2)+(progress.answered-s.lastSeen)*.18-s.streak*.3+(total===0?1.5:0);};
      return score(b)-score(a) || a.id.localeCompare(b.id);
    })[0];
  }
  // Planned questions count toward coverage, never toward learner performance.
  if(pending.length && (!last || last.correct || pending.filter(q=>q.topicId===topic.id).length>=2)){
    const counts=(id:string)=>pending.filter(q=>q.topicId===id).length;
    const minimum=Math.min(...topics.map(t=>counts(t.id)));
    if(counts(topic.id)>minimum)topic=topics.filter(t=>counts(t.id)===minimum).sort((a,b)=>stats(a.id).lastSeen-stats(b.id).lastSeen)[0];
  }
  const s=stats(topic.id);
  const difficulty:1|2|3=s.streak>=2?3:s.incorrect>s.correct?1:2;
  return {topic,kind,difficulty,number:n};
}

export function recordQuizAnswer(progress:QuizProgress,q:QuizQuestion,selectedIndex:number):QuizProgress {
  if(!Number.isInteger(selectedIndex)||!q.choices[selectedIndex]) throw new Error("Choose an answer first.");
  const correct=selectedIndex===q.correctIndex;
  const old=progress.topics[q.topicId]??{correct:0,incorrect:0,streak:0,lastSeen:0};
  return {answered:progress.answered+1,clinical:progress.clinical+(q.kind==="clinical"?1:0),
    topics:{...progress.topics,[q.topicId]:{correct:old.correct+(correct?1:0),incorrect:old.incorrect+(correct?0:1),streak:correct?old.streak+1:0,lastSeen:progress.answered+1}},
    recent:[...progress.recent,{topicId:q.topicId,stem:`${q.vignette} ${q.stem}`.trim().slice(0,2400),selected:q.choices[selectedIndex].text,answer:q.choices[q.correctIndex].text,correct,teachingPoint:q.teachingPoint}].slice(-16)};
}

export function shuffleQuizChoices(q:QuizQuestion, random:()=>number=Math.random):QuizQuestion {
  const choices=q.choices.map((choice,index)=>({choice,index}));
  for(let i=choices.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[choices[i],choices[j]]=[choices[j],choices[i]];}
  return {...q,choices:choices.map(c=>c.choice),correctIndex:choices.findIndex(c=>c.index===q.correctIndex)};
}

export function quizCorrectCount(progress:QuizProgress){return Object.values(progress.topics).reduce((sum,s)=>sum+s.correct,0);}

export function validateQuizQuestion(value:unknown, plan:ReturnType<typeof nextQuestionPlan>, source:QuizSource):QuizQuestion {
  if(!value||typeof value!=="object") throw new QuizValidationError("QUESTION_SHAPE","Luna returned an invalid question.");
  const q=value as Record<string,unknown>;
  const string=(v:unknown,min:number,max:number)=>typeof v==="string"&&v.trim().length>=min&&v.length<=max;
  if(!string(q.stem,20,1800)||!string(q.explanation,30,5000)||!string(q.teachingPoint,10,800)||!string(q.sourceQuote,20,1000)) throw new QuizValidationError("FEEDBACK_FIELDS","Luna returned incomplete question feedback.");
  if(typeof q.vignette!=="string"||q.vignette.length>5000) throw new QuizValidationError("VIGNETTE_FORMAT","Luna returned an invalid vignette.");
  if(plan.kind==="clinical"&&q.vignette.trim().split(/\s+/).length<45) throw new QuizValidationError("VIGNETTE_LENGTH","The question did not include a sufficient clinical vignette.");
  if(!Array.isArray(q.reasoningSteps)||q.reasoningSteps.length<(plan.kind==="clinical"?2:1)||q.reasoningSteps.length>4||!q.reasoningSteps.every(s=>string(s,15,1000))) throw new QuizValidationError("REASONING_STEPS","The question did not include the required reasoning links.");
  if(!Array.isArray(q.choices)||q.choices.length<4||q.choices.length>5||!q.choices.every(c=>c&&typeof c==="object"&&string(c.text,1,700)&&string(c.rationale,10,1800))) throw new QuizValidationError("CHOICES_FORMAT","The question must have four or five explained answer choices.");
  if(new Set(q.choices.map(c=>c.text.trim().toLowerCase())).size!==q.choices.length) throw new QuizValidationError("DUPLICATE_CHOICES","Luna returned duplicate answer choices.");
  if(!Number.isInteger(q.correctIndex)||Number(q.correctIndex)<0||Number(q.correctIndex)>=q.choices.length) throw new QuizValidationError("ANSWER_INDEX","Luna returned an invalid correct answer.");
  if(!Array.isArray(q.sourcePages)||!q.sourcePages.length||q.sourcePages.length>6||!q.sourcePages.every(p=>source.slides.some(s=>s.page===p))) throw new QuizValidationError("SOURCE_PAGES","Luna cited a slide outside the lecture.");
  const normalize=(s:string)=>s.replace(/\s+/g," ").trim().toLowerCase();
  if(!source.slides.some(s=>(q.sourcePages as number[]).includes(s.page)&&normalize(s.text).includes(normalize(q.sourceQuote as string)))) throw new QuizValidationError("SOURCE_QUOTE","Luna's supporting quote could not be verified against the slide text.");
  return {id:crypto.randomUUID(),topicId:plan.topic.id,kind:plan.kind,difficulty:plan.difficulty,
    vignette:q.vignette,stem:(q.stem as string).trim(),choices:q.choices,correctIndex:q.correctIndex as number,
    explanation:q.explanation as string,teachingPoint:q.teachingPoint as string,reasoningSteps:q.reasoningSteps as string[],sourcePages:q.sourcePages as number[],sourceQuote:q.sourceQuote as string};
}
