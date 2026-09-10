import { test } from "node:test";
import assert from "node:assert/strict";
import { freshQuizProgress, makeQuizSource, nextQuestionPlan, recordQuizAnswer, shuffleQuizChoices, validateQuizQuestion, type QuizProgress } from "../lib/adaptive-quiz.ts";
import { createQuizHandler } from "../netlify/functions/quiz.mts";

const source={id:"test",title:"Enzymes",truncated:false,slides:[{page:9,heading:"Inhibition",text:"Competitive inhibition increases apparent Km while Vmax is unchanged. Noncompetitive inhibition decreases Vmax without changing Km."}]};
const topics=[{id:"t1",title:"Inhibition",pages:[9]},{id:"t2",title:"Kinetics",pages:[9]},{id:"t3",title:"Catalysis",pages:[9]}];
const rawQuestion=()=>({vignette:"A patient participates in a study of a reversible inhibitor. A sample of the patient's enzyme is tested with and without the study compound at several substrate concentrations. The technician finds that the same maximal reaction rate is eventually reached in both preparations, but more substrate is needed to reach half of that rate in the treated preparation.",stem:"Which change in the apparent kinetic parameters best explains the findings?",choices:[{text:"Increased Km, unchanged Vmax",rationale:"Competitive inhibition requires more substrate for the same rate."},{text:"Decreased Km, unchanged Vmax",rationale:"This pattern is not consistent with the increased substrate requirement."},{text:"Unchanged Km, decreased Vmax",rationale:"This predicts a lower maximum rate, unlike the experiment."},{text:"Increased Km, increased Vmax",rationale:"The maximal rate did not increase in the experiment."}],correctIndex:0,explanation:"The unchanged maximum rate with increased substrate requirement is consistent with competitive inhibition.",teachingPoint:"Competitive inhibition raises apparent Km without changing Vmax.",reasoningSteps:["Infer competitive inhibition from the unchanged maximum and shifted substrate requirement.","Use this inhibition mechanism to predict higher apparent Km with unchanged Vmax."],sourcePages:[9],sourceQuote:"Competitive inhibition increases apparent Km while Vmax is unchanged."});
const q=(p:QuizProgress=freshQuizProgress())=>validateQuizQuestion(rawQuestion(),nextQuestionPlan(topics,p),source);

test("clinical fraction is >=70% for every session prefix through 250 answers",()=>{
  let p=freshQuizProgress();for(let i=0;i<250;i++){const question=q(p);p=recordQuizAnswer(p,question,i%2?0:1);assert.ok(p.clinical/p.answered>=.7,`prefix ${p.answered}`);}assert.equal(p.clinical,175);assert.equal(p.recent.length,16);
});
test("a wrong answer is revisited, then coverage prevents getting stuck",()=>{
  let p=freshQuizProgress();p=recordQuizAnswer(p,q(p),1);assert.equal(nextQuestionPlan(topics,p).topic.id,"t1");assert.equal(nextQuestionPlan(topics,p).difficulty,1);
  p=recordQuizAnswer(p,q(p),1);assert.notEqual(nextQuestionPlan(topics,p).topic.id,"t1");
});
test("correct answers explore unseen topics and consecutive topic successes raise difficulty",()=>{
  const p=recordQuizAnswer(freshQuizProgress(),q(),0);assert.equal(nextQuestionPlan(topics,p).topic.id,"t2");
  const p2=recordQuizAnswer(p,q(),0);assert.equal(nextQuestionPlan([topics[0]],p2).difficulty,3);
});
test("choice shuffling remaps the answer and keeps explanations attached",()=>{
  const original=q();const snapshot=JSON.stringify(original);const shuffled=shuffleQuizChoices(original,()=>0);assert.notEqual(shuffled.correctIndex,0);assert.deepEqual(shuffled.choices[shuffled.correctIndex],original.choices[0]);assert.equal(JSON.stringify(original),snapshot);
});
test("new quiz state contains no previous adaptation",()=>{
  const used=recordQuizAnswer(freshQuizProgress(),q(),1);const fresh=freshQuizProgress();assert.equal(used.answered,1);assert.equal(fresh.answered,0);assert.deepEqual(fresh.topics,{});assert.equal(nextQuestionPlan(topics,fresh).difficulty,2);
});
test("source budget preserves the end of a long lecture and excludes personal notes",()=>{
  const l={id:"large",title:"Large",notes:{1:"private"},slides:Array.from({length:100},(_,i)=>({page:i+1,heading:"Topic",text:"Source text. ".repeat(1000)}))};
  const s=makeQuizSource(l);assert.equal(s.slides.length,100);assert.equal(s.slides.at(-1)?.page,100);assert.ok(s.truncated);assert.ok(s.slides.reduce((n,p)=>n+p.text.length,0)<=140000);assert.equal("notes" in s,false);
  assert.throws(()=>makeQuizSource({id:"x",title:"x",slides:[]}));
});
test("reject invalid choices, indices, citations, quotes, and weak clinical structure",()=>{
  const plan=nextQuestionPlan(topics,freshQuizProgress());
  for(const patch of [{choices:rawQuestion().choices.slice(0,3)},{choices:[...rawQuestion().choices,...rawQuestion().choices.slice(0,2)]},{correctIndex:8},{choices:Array(4).fill(rawQuestion().choices[0])},{sourcePages:[999]},{sourceQuote:"This quote does not occur anywhere in the supplied source."},{vignette:"A patient is sick."},{reasoningSteps:["Just recall the answer without any inference."]}])assert.throws(()=>validateQuizQuestion({...rawQuestion(),...patch},plan,source));
  assert.doesNotThrow(()=>validateQuizQuestion({...rawQuestion(),choices:[...rawQuestion().choices,{text:"Unchanged Km, unchanged Vmax",rationale:"This would not account for the changed substrate requirement."}]},plan,source));
});

function setup(outputs:unknown[]=[rawQuestion()]){
  const calls:{url:string;body?:Record<string,unknown>}[]=[];
  const handler=createQuizHandler({env:name=>({OPENAI_API_KEY:"test-key",VITE_SUPABASE_URL:"https://test.supabase.co",VITE_SUPABASE_PUBLISHABLE_KEY:"test-public"}[name]),fetch:async(input,init)=>{
    const url=String(input);const body=init?.body?JSON.parse(String(init.body)):undefined;calls.push({url,body});
    if(url.includes("/auth/v1/user"))return Response.json({id:"test-user"});
    const output=outputs.shift();if(output instanceof Response)return output;
    return Response.json({status:"completed",output:[{content:[{type:"output_text",text:JSON.stringify(output)}]}]});
  }});
  const request=(body:unknown,auth=true)=>handler(new Request("https://example.test/.netlify/functions/quiz",{method:"POST",headers:{"Content-Type":"application/json",...(auth?{Authorization:"Bearer user-token"}:{})},body:JSON.stringify(body)}));
  return {request,calls,handler};
}
const questionBody=()=>({action:"question",source,topics,progress:freshQuizProgress()});
test("unauthenticated request makes no upstream calls",async()=>{const s=setup();const r=await s.request(questionBody(),false);assert.equal(r.status,401);assert.equal(s.calls.length,0);});
test("topic plan returns stable canonical IDs",async()=>{const s=setup([{topics:topics.map(t=>({title:t.title,pages:t.pages}))}]);const r=await s.request({action:"topics",source});assert.equal(r.status,200);assert.deepEqual((await r.json()).topics,topics);});
test("question generation uses strict output and no stored responses",async()=>{
  const s=setup();const r=await s.request(questionBody());assert.equal(r.status,200);const result=await r.json();assert.equal(result.question.kind,"clinical");assert.equal(result.question.choices.length,4);assert.equal(r.headers.get("cache-control"),"no-store");
  const body=s.calls.find(c=>c.url.includes("openai"))!.body!;assert.equal(body.store,false);assert.equal(body.model,"gpt-5.6-luna");assert.ok(String(body.instructions).includes("second-order"));
});
test("invalid citation triggers one bounded repair",async()=>{
  const s=setup([{...rawQuestion(),sourcePages:[999]},rawQuestion()]);const r=await s.request(questionBody());assert.equal(r.status,200);assert.equal(s.calls.filter(c=>c.url.includes("openai")).length,2);
});
test("repeated invalid answers fail without unbounded retries",async()=>{
  const invalid={...rawQuestion(),correctIndex:55};const s=setup([invalid,invalid]);const r=await s.request(questionBody());assert.equal(r.status,502);assert.equal(s.calls.length,3);
});
test("incomplete and refused model responses fail safely",async()=>{
  for(const body of [{status:"incomplete",output:[]},{status:"completed",output:[{content:[{type:"refusal",refusal:"declined"}]}]}]){const s=setup([Response.json(body)]);const r=await s.request(questionBody());assert.ok(r.status>=400);assert.equal(s.calls.length,2);}
});
test("upstream secrets/error details are not echoed to the browser",async()=>{const s=setup([new Response("sensitive-provider-details",{status:500})]);const r=await s.request(questionBody());assert.equal(r.status,502);assert.ok(!(await r.text()).includes("sensitive-provider-details"));});
test("invalid request and counters rejected before model call",async()=>{const s=setup();const r=await s.request({...questionBody(),progress:{...freshQuizProgress(),answered:5}});assert.equal(r.status,400);assert.equal(s.calls.length,1);});
test("no method other than POST is accepted",async()=>{const s=setup();const r=await s.handler(new Request("https://example.test/quiz"));assert.equal(r.status,405);assert.equal(s.calls.length,0);});

test("expired authentication never reaches the model",async()=>{
  let calls=0;
  const handler=createQuizHandler({env:()=>"test",fetch:async()=>{calls++;return new Response(null,{status:401});}});
  const r=await handler(new Request("https://example.test/quiz",{method:"POST",headers:{Authorization:"Bearer expired"},body:JSON.stringify(questionBody())}));
  assert.equal(r.status,401);assert.equal(calls,1);
});

test("per-instance request limit stops excess model calls",async()=>{
  const s=setup(Array.from({length:12},rawQuestion));
  for(let i=0;i<12;i++)assert.equal((await s.request(questionBody())).status,200);
  assert.equal((await s.request(questionBody())).status,429);
  assert.equal(s.calls.filter(c=>c.url.includes("openai")).length,12);
});
