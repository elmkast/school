import { supabase } from "./supabase-client";
import { recordDiagnostic } from "./diagnostics";
import { QuizGenerationError } from "./adaptive-quiz";
import type { BufferedQuizService } from "./quiz-buffer";

export type QuizService = BufferedQuizService;
async function requestQuiz(body:unknown, signal:AbortSignal) {
  if(!supabase)throw new Error("Quiz generation needs the hosted app and a signed-in account.");
  const {data,error}=await supabase.auth.getSession();
  if(error||!data.session)throw new Error("Sign in to start a quiz.");
  const timeout=AbortSignal.timeout(65000);
  let response:Response;
  try{response=await fetch("/.netlify/functions/quiz",{method:"POST",signal:AbortSignal.any([signal,timeout]),headers:{"Content-Type":"application/json",Authorization:`Bearer ${data.session.access_token}`},body:JSON.stringify(body)});}
  catch(error){if(signal.aborted)throw error;throw new Error(timeout.aborted?"Luna took too long. Retry without losing your progress.":"Could not connect to Luna. Check your connection and retry.");}
  const raw=await response.text();
  let result;try{result=JSON.parse(raw);}catch{throw new Error("The quiz service is unavailable. Use the deployed Netlify app, or retry after deployment finishes.");}
  if(!response.ok){recordDiagnostic("app","Quiz generation request failed",{status:response.status});throw new QuizGenerationError(result.error||"Could not generate a question. Retry without losing your progress.",result.code==="QUALITY_REJECTED");}
  return result;
}
export const liveQuizService:QuizService={
  async topics(source,signal){const result=await requestQuiz({action:"topics",source},signal);if(!Array.isArray(result.topics)||!result.topics.length)throw new Error("Luna did not return any lecture topics.");return result.topics;},
  async question(source,topics,progress,signal,pending=[]){const result=await requestQuiz({action:"question",source,topics,progress,pending},signal);if(!result.question||!Array.isArray(result.question.choices))throw new QuizGenerationError("Luna returned an incomplete question.",true);return result.question;},
};
