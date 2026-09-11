import { supabase } from "./supabase-client";
import { recordDiagnostic } from "./diagnostics";
import { QuizGenerationError, type QuizQuestion } from "./adaptive-quiz";
import { quizServiceFailure } from "./quiz-errors";
import type { BufferedQuizService } from "./quiz-buffer";

export type QuizService = BufferedQuizService;
async function requestQuiz(body:Record<string,unknown>,signal:AbortSignal){
  if(!supabase)throw new QuizGenerationError("Quiz generation needs the hosted app and a signed-in account.",false,{code:"CONFIGURATION"});
  const {data,error}=await supabase.auth.getSession();
  if(error||!data.session)throw new QuizGenerationError("Exit the quiz and sign in again.",false,{code:"AUTHENTICATION"});
  const started=Date.now();const timeout=AbortSignal.timeout(60000);
  let response:Response;
  try{response=await fetch("/.netlify/functions/quiz",{method:"POST",signal:AbortSignal.any([signal,timeout]),headers:{"Content-Type":"application/json",Authorization:"Bearer "+data.session.access_token},body:JSON.stringify(body)});}
  catch(error){if(signal.aborted)throw error;throw new QuizGenerationError("Waiting for Luna to reconnect.",false,{code:timeout.aborted?"TIMEOUT":"TRANSIENT",retryable:true});}
  let result:Record<string,unknown>;
  try{const parsed=await response.json();if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new Error("Invalid response.");result=parsed;}
  catch{const failure=quizServiceFailure(response.status,null,response.headers.get("Retry-After"));recordDiagnostic("app","Quiz response unreadable",{code:failure.code,status:response.status,elapsedMs:Date.now()-started});throw failure;}
  if(!response.ok){
    const failure=quizServiceFailure(response.status,result,response.headers.get("Retry-After"));
    const requestId=typeof result.requestId==="string"&&/^[a-f0-9-]{36}$/i.test(result.requestId)?result.requestId:"unavailable";
    recordDiagnostic("app","Quiz generation failed",{version:response.headers.get("X-Quiz-Version")==="evidence-v2"?"evidence-v2":"legacy",requestId,status:response.status,stage:body.action==="topics"?"topics":"question",code:failure.code,issues:failure.issues,elapsedMs:Date.now()-started,retryAfterMs:failure.retryAfterMs});
    throw failure;
  }
  return result;
}
export const liveQuizService:QuizService={
  async topics(source,signal,retry){const result=await requestQuiz({action:"topics",source,retry},signal);if(!Array.isArray(result.topics)||!result.topics.length)throw new QuizGenerationError("Invalid lecture topics.",true,{issues:["TOPICS_INVALID"]});return result.topics;},
  async question(source,topics,progress,signal,pending=[],retry){const result=await requestQuiz({action:"question",source,topics,progress,pending,retry},signal);if(!result.question||typeof result.question!=="object"||!Array.isArray((result.question as {choices?:unknown}).choices))throw new QuizGenerationError("Luna returned an incomplete question.",true,{issues:["QUESTION_SHAPE"]});return result.question as QuizQuestion;},
  diagnostic:event=>recordDiagnostic("app","Quiz recovery",event),
};
