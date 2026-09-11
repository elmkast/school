import { test } from "node:test";
import assert from "node:assert/strict";
import { freshQuizProgress, makeQuizSource, nextQuestionPlan, recordQuizAnswer, shuffleQuizChoices, validateQuizQuestion, type QuizProgress } from "../lib/adaptive-quiz.ts";
import { createQuizHandler } from "../netlify/functions/quiz.mts";
import { QuizBuffer, type BufferedQuizService } from "../lib/quiz-buffer.ts";
import { QuizGenerationError } from "../lib/adaptive-quiz.ts";
import { quizEvidence, attachQuizEvidence } from "../lib/quiz-evidence.ts";
import { quizServiceFailure } from "../lib/quiz-errors.ts";

const settle=()=>new Promise(resolve=>setTimeout(resolve,0));

const source={id:"test",title:"Enzymes",truncated:false,slides:[{page:9,heading:"Inhibition",text:"Competitive inhibition increases apparent Km while Vmax is unchanged. Noncompetitive inhibition decreases Vmax without changing Km."}]};
const topics=[{id:"t1",title:"Inhibition",pages:[9]},{id:"t2",title:"Kinetics",pages:[9]},{id:"t3",title:"Catalysis",pages:[9]}];
const rawQuestion=()=>({vignette:"A patient participates in a study of a reversible inhibitor. A sample of the patient's enzyme is tested with and without the study compound at several substrate concentrations. The technician finds that the same maximal reaction rate is eventually reached in both preparations, but more substrate is needed to reach half of that rate in the treated preparation.",stem:"Which change in the apparent kinetic parameters best explains the findings?",choices:[{text:"Increased Km, unchanged Vmax",rationale:"Competitive inhibition requires more substrate for the same rate."},{text:"Decreased Km, unchanged Vmax",rationale:"This pattern is not consistent with the increased substrate requirement."},{text:"Unchanged Km, decreased Vmax",rationale:"This predicts a lower maximum rate, unlike the experiment."},{text:"Increased Km, increased Vmax",rationale:"The maximal rate did not increase in the experiment."}],correctIndex:0,explanation:"The unchanged maximum rate with increased substrate requirement is consistent with competitive inhibition.",teachingPoint:"Competitive inhibition raises apparent Km without changing Vmax.",reasoningSteps:["Infer competitive inhibition from the unchanged maximum and shifted substrate requirement.","Use this inhibition mechanism to predict higher apparent Km with unchanged Vmax."],sourceId:"p9-e1",sourcePages:[9],sourceQuote:"Competitive inhibition increases apparent Km while Vmax is unchanged."});
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
  const events:Record<string,unknown>[]=[];
  const handler=createQuizHandler({env:name=>({OPENAI_API_KEY:"test-key",VITE_SUPABASE_URL:"https://test.supabase.co",VITE_SUPABASE_PUBLISHABLE_KEY:"test-public"}[name]),fetch:async(input,init)=>{
    const url=String(input);const body=init?.body?JSON.parse(String(init.body)):undefined;calls.push({url,body});
    if(url.includes("/auth/v1/user"))return Response.json({id:"test-user"});
    const output=outputs.shift();if(output instanceof Response)return output;
    return Response.json({status:"completed",output:[{content:[{type:"output_text",text:JSON.stringify(output)}]}]});
  },log:event=>events.push(event)});
  const request=(body:unknown,auth=true)=>handler(new Request("https://example.test/.netlify/functions/quiz",{method:"POST",headers:{"Content-Type":"application/json",...(auth?{Authorization:"Bearer user-token"}:{})},body:JSON.stringify(body)}));
  return {request,calls,handler,events};
}
const questionBody=()=>({action:"question",source,topics,progress:freshQuizProgress()});
test("unauthenticated request makes no upstream calls",async()=>{const s=setup();const r=await s.request(questionBody(),false);assert.equal(r.status,401);assert.equal(s.calls.length,0);});
test("topic plan returns stable canonical IDs",async()=>{const s=setup([{topics:topics.map(t=>({title:t.title,pages:t.pages}))}]);const r=await s.request({action:"topics",source});assert.equal(r.status,200);assert.deepEqual((await r.json()).topics,topics);});
test("question generation uses strict output and no stored responses",async()=>{
  const s=setup();const r=await s.request(questionBody());assert.equal(r.status,200);const result=await r.json();assert.equal(result.question.kind,"clinical");assert.equal(result.question.choices.length,4);assert.equal(r.headers.get("cache-control"),"no-store");
  const body=s.calls.find(c=>c.url.includes("openai"))!.body!;assert.equal(body.store,false);assert.equal(body.model,"gpt-5.6-luna");assert.ok(String(body.instructions).includes("second-order"));
});
test("invalid reference reports the precise check and a fresh request replaces it",async()=>{
  const s=setup([{...rawQuestion(),sourceId:"invented"},rawQuestion()]);
  const r=await s.request(questionBody());assert.equal(r.status,502);
  assert.deepEqual((await r.json()).issues,["SOURCE_REFERENCE"]);
  assert.equal(s.calls.filter(c=>c.url.includes("openai")).length,1);
  const recovered=await s.request({...questionBody(),retry:{attempt:1,issues:["SOURCE_REFERENCE"]}});
  assert.equal(recovered.status,200);assert.equal(s.calls.filter(c=>c.url.includes("openai")).length,2);
  assert.match(String(s.calls.at(-1)!.body!.instructions),/replacement attempt 2/);
  assert.match(String(s.calls.at(-1)!.body!.instructions),/SOURCE_REFERENCE/);
});
test("repeated invalid answers fail without unbounded retries",async()=>{
  const invalid={...rawQuestion(),correctIndex:55};const s=setup([invalid,invalid]);const r=await s.request(questionBody());assert.equal(r.status,502);assert.equal(s.calls.length,2);
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
  const s=setup(Array.from({length:36},rawQuestion));
  for(let i=0;i<36;i++)assert.equal((await s.request(questionBody())).status,200);
  assert.equal((await s.request(questionBody())).status,429);
  assert.equal(s.calls.filter(c=>c.url.includes("openai")).length,36);
});

function bufferedService(){
  const calls:{progress:QuizProgress;number:number;resolve:(q:ReturnType<typeof q>)=>void;reject:(error:Error)=>void;signal:AbortSignal;question:ReturnType<typeof q>}[]=[];
  const service:BufferedQuizService={async topics(){return topics;},question(s,t,p,signal,pending=[]){
    const plan=nextQuestionPlan(t,p,pending);
    const question=validateQuizQuestion({...rawQuestion(),stem:`Case ${plan.number}: which change in the apparent kinetic parameters best explains the findings?`},plan,s);
    return new Promise((resolve,reject)=>calls.push({progress:p,number:plan.number,resolve,reject,signal,question}));
  }};
  return {service,calls};
}
async function prime(buffer:QuizBuffer,s:ReturnType<typeof bufferedService>){
  await buffer.start();
  // Deliberately complete pairs out of order.
  for(let i=0;i<4;i+=2){s.calls[i+1].resolve(s.calls[i+1].question);s.calls[i].resolve(s.calls[i].question);await settle();}
  assert.equal(buffer.snapshot().current,null);
  s.calls[4].resolve(s.calls[4].question);await settle();
}
test("buffer prepares five, preserves order, and refills once per actual answer",async()=>{
  const s=bufferedService();const b=new QuizBuffer(source,s.service,()=>{});
  await prime(b,s);
  assert.equal(s.calls.length,5);assert.equal(b.snapshot().ready,5);assert.equal(b.snapshot().progress.answered,0);
  const first=b.snapshot().current!;assert.match(first.stem,/Case 1:/);
  b.answer(first.id,first.correctIndex===0?1:0);
  assert.equal(s.calls.length,6);assert.equal(s.calls[5].progress.answered,1);
  assert.equal(Object.values(s.calls[5].progress.topics).reduce((n,t)=>n+t.incorrect,0),1);
  assert.match(b.snapshot().current!.stem,/Case 2:/);assert.equal(b.snapshot().ready,4);
  assert.throws(()=>b.answer(first.id,0));
  b.dispose();
});
test("rapid answers consume ready questions without aborting refill requests",async()=>{
  const s=bufferedService();const b=new QuizBuffer(source,s.service,()=>{});await prime(b,s);
  for(let i=0;i<5;i++){const current=b.snapshot().current!;b.answer(current.id,current.correctIndex);}
  assert.equal(b.snapshot().current,null);assert.equal(s.calls.length,7);assert.equal(s.calls[5].signal.aborted,false);
  s.calls[6].resolve(s.calls[6].question);await settle();assert.equal(b.snapshot().current,null);
  s.calls[5].resolve(s.calls[5].question);await settle();assert.match(b.snapshot().current!.stem,/Case 6:/);
  assert.equal(b.snapshot().progress.answered,5);b.dispose();
});
test("quality rejection retries automatically without changing score; exit cancels pending work",async()=>{
  const s=bufferedService();let updates=0;const b=new QuizBuffer(source,s.service,()=>{updates++;},async()=>{});
  await b.start();s.calls[0].reject(new QuizGenerationError("Bad citation",true));await settle();
  assert.equal(s.calls.length,3);assert.equal(s.calls[2].number,1);assert.equal(b.snapshot().error,"");assert.equal(b.snapshot().progress.answered,0);
  b.dispose();const before=updates;
  for(const call of s.calls){assert.ok(call.signal.aborted);call.resolve(call.question);}
  await settle();assert.equal(updates,before);assert.equal(s.calls.length,3);
});
test("automatic quality retry budget is finite and does not retry authentication failures",async()=>{
  let attempts=0;
  const failing:BufferedQuizService={async topics(){return topics;},async question(){attempts++;throw new QuizGenerationError("Invalid",true);}};
  const b=new QuizBuffer(source,failing,()=>{},async()=>{});await b.start();
  for(let i=0;i<10;i++)await settle();
  assert.ok(attempts>=6&&attempts<=12);assert.match(b.snapshot().error,/Generation stopped/);b.dispose();
  attempts=0;
  const auth=new QuizBuffer(source,{...failing,async question(){attempts++;throw new QuizGenerationError("Sign in again");}},()=>{});
  await auth.start();for(let i=0;i<5;i++)await settle();
  assert.equal(attempts,2);assert.match(auth.snapshot().error,/Sign in/);auth.dispose();
});
test("planned questions maintain the clinical ratio without inventing answers",()=>{
  let p=freshQuizProgress();const queue:ReturnType<typeof q>[]=[];
  for(let i=0;i<100;i++){
    while(queue.length<5){
      const pending=queue.map(q=>({topicId:q.topicId,kind:q.kind,stem:q.stem}));
      queue.push(validateQuizQuestion(rawQuestion(),nextQuestionPlan(topics,p,pending),source));
    }
    const current=queue.shift()!;p=recordQuizAnswer(p,current,i%2);
    assert.ok(p.clinical/p.answered>=.7);
    assert.equal(Object.values(p.topics).reduce((n,t)=>n+t.correct+t.incorrect,0),i+1);
  }
});
test("server accounts for queued questions and marks quality failures as retryable",async()=>{
  const pending=[{topicId:"t1",kind:"clinical",stem:""},{topicId:"t2",kind:"clinical",stem:""},{topicId:"t3",kind:"clinical",stem:""}];
  const s=setup();const r=await s.request({...questionBody(),pending});assert.equal(r.status,200);assert.equal((await r.json()).question.kind,"knowledge");
  const input=JSON.parse(String(s.calls[1].body!.input));assert.equal(input.questionNumber,4);assert.equal(input.queued.length,3);
  const bad=setup([{...rawQuestion(),correctIndex:44},{...rawQuestion(),correctIndex:44}]);
  assert.equal((await (await bad.request(questionBody())).json()).code,"QUALITY_REJECTED");
  const invalid=setup();assert.equal((await invalid.request({...questionBody(),pending:Array(5).fill(pending[0])})).status,400);
});

test("citations use exact PDF excerpts, not generated quotations",()=>{
  const pdfText="Ligand’s effects — α-subunit ﬁndings; Km increases. "+"Detailed evidence. ".repeat(95)+" END";
  const s={...source,slides:[{page:9,heading:"Evidence",text:pdfText}]};
  const evidence=quizEvidence(s);
  assert.ok(evidence.length>1);
  for(const e of evidence){assert.ok(e.text.length>=20&&e.text.length<=900);assert.ok(pdfText.includes(e.text));}
  assert.ok(evidence.at(-1)!.text.endsWith("END"));
  const attached=attachQuizEvidence({...rawQuestion(),sourceId:evidence[0].id,sourceQuote:"model invented quote",sourcePages:[999]},evidence);
  assert.equal(attached.sourceQuote,evidence[0].text);assert.deepEqual(attached.sourcePages,[9]);
  assert.doesNotThrow(()=>validateQuizQuestion(attached,nextQuestionPlan(topics,freshQuizProgress()),s));
  assert.throws(()=>attachQuizEvidence({...rawQuestion(),sourceId:"p999-e1"},evidence),/sourceId/);
});
test("schema matches feedback checks and generates source IDs only",async()=>{
  const s=setup();await s.request(questionBody());
  const body=s.calls[1].body! as {text:{format:{schema:{properties:Record<string,{minLength?:number;minItems?:number;enum?:string[]}>}}};input:string};
  const props=body.text.format.schema.properties;
  assert.equal(props.reasoningSteps.minItems,2);assert.equal(props.explanation.minLength,30);
  assert.deepEqual(props.sourceId.enum,["p9-e1"]);
  assert.equal("sourceQuote" in props,false);assert.equal("sourcePages" in props,false);
  assert.equal(JSON.parse(body.input).evidence[0].text,source.slides[0].text);
});
test("diagnostics identify the failed check without logging private text",async()=>{
  const s=setup([{...rawQuestion(),correctIndex:99}]);const result=await (await s.request(questionBody())).json();
  assert.deepEqual(result.issues,["ANSWER_INDEX"]);assert.equal(result.diagnostic.stage,"validation");
  assert.equal(s.events[0].requestId,result.requestId);assert.ok(result.requestId);
  const log=JSON.stringify(s.events);
  for(const secret of ["test-key","user-token",source.title,source.slides[0].text,rawQuestion().vignette])assert.ok(!log.includes(secret));
});
test("temporary failures recover but permanent errors do not loop",()=>{
  for(const status of [429,502,503,504])assert.equal(quizServiceFailure(status,null).retryable,true);
  for(const code of ["CONFIGURATION","PROVIDER_CONFIGURATION","AUTHENTICATION","BILLING_LIMIT","REFUSAL","BAD_REQUEST"])assert.equal(quizServiceFailure(503,{code}).retryable,false);
  assert.equal(quizServiceFailure(429,{retryAfterMs:1000},"60").retryAfterMs,60000);
  const quality=quizServiceFailure(502,{code:"QUALITY_REJECTED",issues:["SOURCE_REFERENCE","secret PDF content"],error:"secret API key"});
  assert.deepEqual(quality.issues,["SOURCE_REFERENCE"]);assert.ok(!quality.message.includes("secret"));
});
test("provider quota and throttling remain distinguishable",async()=>{
  for(const [status,code,expected] of [[429,"insufficient_quota","BILLING_LIMIT"],[429,"rate_limit_exceeded","RATE_LIMIT"],[400,"invalid_json_schema","PROVIDER_CONFIGURATION"]] as const){
    const s=setup([Response.json({error:{code,message:"private details"}},{status,headers:{"Retry-After":"30"}})]);
    const r=await s.request(questionBody());const body=await r.json();assert.equal(body.code,expected);
    if(expected==="RATE_LIMIT"){assert.equal(body.retryAfterMs,30000);assert.equal(r.headers.get("Retry-After"),"30");}
    assert.ok(!JSON.stringify(body).includes("private details"));
  }
});
test("cooldown is automatic and there is no manual Retry action",async()=>{
  const s=bufferedService();const delays:number[]=[];const logs:Record<string,unknown>[]=[];
  const b=new QuizBuffer(source,{...s.service,diagnostic:e=>logs.push(e)},()=>{},async ms=>{delays.push(ms);});
  await b.start();s.calls[0].reject(new QuizGenerationError("cooldown",false,{code:"RATE_LIMIT",retryable:true,retryAfterMs:60000}));
  await settle();assert.equal(delays[0],60000);assert.equal(s.calls[2].number,1);assert.equal(b.snapshot().error,"");
  assert.equal("retry" in b,false);assert.equal(logs[0].code,"RATE_LIMIT");b.dispose();
});
test("invalid source IDs recover through endpoint and buffer without user action",async()=>{
  let calls=0;const prompts:string[]=[];
  const handler=createQuizHandler({env:name=>({OPENAI_API_KEY:"test",VITE_SUPABASE_URL:"https://test.supabase.co",VITE_SUPABASE_PUBLISHABLE_KEY:"public"}[name]),fetch:async(url,init)=>{
    if(String(url).includes("/auth/v1/user"))return Response.json({id:"test"});
    calls++;const request=JSON.parse(String(init!.body));const input=JSON.parse(request.input);prompts.push(request.instructions);
    return Response.json({status:"completed",output_text:JSON.stringify({...rawQuestion(),stem:"Question "+input.questionNumber+": which kinetic changes are expected?",sourceId:calls===1?"invented":"p9-e1"})});
  }});
  const service:BufferedQuizService={async topics(){return topics;},async question(source,topics,progress,signal,pending,retry){
    const r=await handler(new Request("https://example.test/quiz",{method:"POST",headers:{Authorization:"Bearer test"},signal,body:JSON.stringify({action:"question",source,topics,progress,pending,retry})}));
    const data=await r.json();if(!r.ok)throw quizServiceFailure(r.status,data);return data.question;
  }};
  const b=new QuizBuffer(source,service,()=>{},async()=>{});await b.start();
  for(let i=0;i<15&&!b.snapshot().initialized;i++)await settle();
  assert.equal(b.snapshot().error,"");assert.equal(b.snapshot().ready,5);assert.equal(b.snapshot().progress.answered,0);assert.equal(calls,6);
  assert.ok(prompts.some(p=>p.includes("SOURCE_REFERENCE")));b.dispose();
});

test("permanent failures stop new requests but leave prepared questions and scores usable",async()=>{
  const s=bufferedService();const b=new QuizBuffer(source,s.service,()=>{});await prime(b,s);
  const first=b.snapshot().current!;b.answer(first.id,first.correctIndex);
  s.calls[5].reject(new QuizGenerationError("Account configuration needs attention.",false,{code:"CONFIGURATION"}));await settle();
  assert.match(b.snapshot().error,/configuration/);
  for(let i=0;i<3;i++){const current=b.snapshot().current!;b.answer(current.id,current.correctIndex);}
  assert.equal(s.calls.length,6);assert.equal(b.snapshot().progress.answered,4);
  assert.match(b.snapshot().current!.stem,/Case 5:/);b.dispose();
});
