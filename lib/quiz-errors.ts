import { QuizGenerationError } from "./adaptive-quiz.ts";

const codes=new Set(["QUALITY_REJECTED","TRANSIENT","TIMEOUT","RATE_LIMIT","AUTHENTICATION","CONFIGURATION","PROVIDER_CONFIGURATION","BILLING_LIMIT","REFUSAL","BAD_REQUEST","SOURCE_UNAVAILABLE","CANCELLED"]);
const issues=new Set(["QUESTION_SHAPE","FEEDBACK_FIELDS","VIGNETTE_FORMAT","VIGNETTE_LENGTH","REASONING_STEPS","CHOICES_FORMAT","DUPLICATE_CHOICES","ANSWER_INDEX","SOURCE_PAGES","SOURCE_QUOTE","SOURCE_REFERENCE","DUPLICATE_QUESTION","TOPICS_INVALID","OUTPUT_INCOMPLETE","OUTPUT_JSON"]);
export function quizServiceFailure(status:number,payload:unknown,retryAfter:string|null=null):QuizGenerationError{
  const body=payload&&typeof payload==="object"?payload as Record<string,unknown>:{};
  const fallback=status===429?"RATE_LIMIT":status===401||status===403?"AUTHENTICATION":status>=500||status===200?"TRANSIENT":"BAD_REQUEST";
  const code=typeof body.code==="string"&&codes.has(body.code)?body.code:fallback;
  const retryable=["QUALITY_REJECTED","TRANSIENT","TIMEOUT","RATE_LIMIT"].includes(code);
  const messages:Record<string,string>={AUTHENTICATION:"Your sign-in expired. Exit the quiz and sign in again.",CONFIGURATION:"Luna is not configured on the server.",PROVIDER_CONFIGURATION:"The Luna server configuration needs attention. Details are in Diagnostics.",BILLING_LIMIT:"The Luna API account has reached its usage allowance.",REFUSAL:"Luna declined this request.",BAD_REQUEST:"This quiz request could not be processed. Details are in Diagnostics.",SOURCE_UNAVAILABLE:"This topic has no usable slide text."};
  const headerSeconds=Number(retryAfter);
  const headerMs=Number.isFinite(headerSeconds)&&headerSeconds>0?headerSeconds*1000:Math.max(0,Date.parse(retryAfter??"")-Date.now())||0;
  const bodyMs=typeof body.retryAfterMs==="number"&&Number.isFinite(body.retryAfterMs)?body.retryAfterMs:0;
  return new QuizGenerationError(messages[code]??"Luna is preparing a replacement question.",code==="QUALITY_REJECTED",{code,retryable,issues:Array.isArray(body.issues)?body.issues.filter((i):i is string=>typeof i==="string"&&issues.has(i)).slice(0,12):[],retryAfterMs:Math.max(0,Math.min(120000,Math.max(headerMs,bodyMs,code==="RATE_LIMIT"?15000:0)))});
}
