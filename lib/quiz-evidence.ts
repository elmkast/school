import { QuizValidationError, type QuizSource } from "./adaptive-quiz.ts";

export type QuizEvidence={id:string;page:number;text:string};
// Exact source slices, not generated quotations. Keep under the validator's 1,000-character cap.
export function quizEvidence(source:QuizSource):QuizEvidence[]{
  return source.slides.flatMap(slide=>{
    const excerpts:QuizEvidence[]=[];
    for(let offset=0;offset<slide.text.length;){
      let end=Math.min(offset+900,slide.text.length);
      if(end<slide.text.length){const boundary=slide.text.lastIndexOf(" ",end);if(boundary>offset+450)end=boundary;}
      // Include a short trailing remainder in an overlapping final excerpt.
      const start=slide.text.length-offset<20?Math.max(0,slide.text.length-900):offset;
      const text=slide.text.slice(start,end).trim();
      if(text.length>=20)excerpts.push({id:`p${slide.page}-e${excerpts.length+1}`,page:slide.page,text});
      offset=end;
    }
    return excerpts;
  });
}
export function attachQuizEvidence(value:unknown,evidence:QuizEvidence[]):Record<string,unknown>{
  if(!value||typeof value!=="object"||Array.isArray(value))throw new QuizValidationError("QUESTION_SHAPE","Luna did not return a question object.");
  const q=value as Record<string,unknown>;
  const entry=evidence.find(e=>e.id===q.sourceId);
  if(!entry)throw new QuizValidationError("SOURCE_REFERENCE","Select a sourceId from the supplied evidence list.");
  return {...q,sourcePages:[entry.page],sourceQuote:entry.text};
}
