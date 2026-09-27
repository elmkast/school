// Opt-in only: makes paid OpenAI calls using synthetic sources, not user lectures.
// node --env-file=../.env.local --experimental-strip-types tests/exam-live-smoke.mts
// Auth is stubbed; this verifies the real provider, not deployed Supabase/Netlify.
import assert from "node:assert/strict";
import { createExamHandler } from "../netlify/functions/exam.mts";
import { createExamRequest } from "../lib/exam-transport.ts";
import { buildExamSourceIndex } from "../lib/exam-sources.ts";
import { ExamPool } from "../lib/exam-pool.ts";
import type { ExamQuestion } from "../lib/exam-prep.ts";
import type { ExamService } from "../lib/exam-client.ts";
import type { Lecture } from "../lib/lecture-store.ts";

assert.ok(process.env.OPENAI_API_KEY, "OPENAI_API_KEY must be set explicitly for this paid smoke test.");
const sources = [
  ["Oxidative phosphorylation", "The inner mitochondrial membrane maintains a proton gradient. Electron transfer through complexes I, III, and IV pumps protons to the intermembrane space. Oxygen is the terminal electron acceptor. Proton flow through ATP synthase drives phosphorylation of ADP to ATP. An uncoupler dissipates the gradient, reduces ATP synthesis, and increases heat production. Inhibition of complex IV prevents oxygen consumption and ATP production."],
  ["Enzyme kinetics", "Km is the substrate concentration at half maximal velocity. Vmax is the rate at saturating substrate concentration. A competitive inhibitor increases apparent Km without changing Vmax; sufficient substrate can overcome the inhibition. Pure noncompetitive inhibition decreases Vmax without changing Km. Increasing enzyme concentration increases Vmax without changing Km. Catalysts accelerate reactions without changing equilibrium."],
  ["Membrane transport", "Simple diffusion moves molecules down a concentration gradient without ATP. Facilitated diffusion uses a carrier or channel and also follows the gradient. Primary active transport couples transport directly to ATP hydrolysis. The sodium-potassium ATPase moves three sodium ions out and two potassium ions in per ATP. Secondary active transport uses a gradient created by another transporter. Sodium-glucose cotransport uses inward sodium movement to drive glucose uptake."],
  ["DNA replication", "DNA polymerase synthesizes DNA in the five-prime to three-prime direction and requires a primer. Leading strand synthesis is continuous. The lagging strand is synthesized in Okazaki fragments. Primase makes RNA primers. Ligase seals nicks between DNA fragments. Helicase separates the two template strands. Proofreading removes a mismatched nucleotide from the growing strand, improving fidelity."],
  ["Cell cycle", "The cell cycle includes G1, S, G2, and M phases. DNA replication occurs during S phase. Cyclin-dependent kinases are activated by cyclins. The G1 checkpoint restricts progression when DNA damage is present. P53 can activate p21, which inhibits cyclin-dependent kinases. Retinoblastoma protein restrains E2F; phosphorylation releases E2F to promote S phase entry. The spindle checkpoint delays chromosome separation until chromosomes are attached."],
  ["Protein targeting", "Secreted proteins enter the endoplasmic reticulum during translation. A signal peptide is recognized by the signal recognition particle. The ribosome docks at the ER membrane and translation resumes through a translocon. Proteins are modified in the ER and Golgi before secretion. Cytosolic proteins lacking an ER targeting signal are translated on free ribosomes. Lysosomal enzymes are targeted using mannose-6-phosphate."],
  ["Gene expression", "RNA polymerase makes RNA from a DNA template. Eukaryotic messenger RNA receives a five-prime cap and a poly-A tail. Splicing removes introns and joins exons. Alternative splicing can produce different proteins from one gene. Mature messenger RNA is exported from the nucleus and translated by ribosomes. Promoters recruit the transcription machinery, while enhancers can act from a distance."],
  ["Receptors", "Ligands bind receptors and alter downstream signaling. Gs increases adenylyl cyclase activity and cyclic AMP. Gi reduces adenylyl cyclase activity. Gq activates phospholipase C, forming IP3 and DAG. IP3 releases calcium from the endoplasmic reticulum. Receptor tyrosine kinases dimerize and phosphorylate tyrosine residues. Intracellular receptors bind lipid-soluble ligands and regulate gene expression."],
  ["Glycogen", "Glycogen is stored in liver and skeletal muscle. Glycogen synthase forms alpha-1,4 linkages. Branching enzyme creates alpha-1,6 linkages. Glycogen phosphorylase releases glucose-1-phosphate from alpha-1,4 linkages. Debranching enzyme is needed at branches. Liver glucose-6-phosphatase supports release of free glucose into blood; skeletal muscle lacks this enzyme and uses glycogen locally."],
];
const lectures = sources.map(([title, text], i) => ({ id: "synthetic-" + i, title, course: "MCF", week: 1, lecturer: "Smoke test", academicYear: "2026", toc: [], slides: [{ page: 1, heading: title, text }] } as unknown as Lecture));
const started = Date.now();
let calls = 0;
let active = 0;
let maxActive = 0;
const handler = createExamHandler({
  env: name => name === "VITE_SUPABASE_URL" ? "https://auth.test" : name === "VITE_SUPABASE_PUBLISHABLE_KEY" ? "test" : process.env[name],
  fetch: async (url, init) => {
    if (String(url).startsWith("https://auth.test")) return Response.json({ id: "synthetic-live-smoke" });
    assert.ok(++calls <= 18, "Smoke test call budget exceeded.");
    active++; maxActive = Math.max(maxActive, active);
    try { return await fetch(url, init); } finally { active--; }
  },
  log: event => console.log(JSON.stringify({ endpointFailure: event })),
});
const request = createExamRequest({ getAccessToken: async () => "synthetic", fetch: (url, init) => handler(new Request("https://local.test" + url, init)) });
const service: ExamService = {
  async mapTopics(unit, signal, retry) { return (await request({ action: "map-topics", unit, retry }, signal)).topics as { title: string; evidenceIds: string[] }[]; },
  async question(input, signal, retry) { return (await request({ action: "question", ...input, retry }, signal)).question as ExamQuestion; },
  diagnostic: event => {
    if (["topic-map-complete", "question-ready", "generation-failed"].includes(String(event.event))) console.log(JSON.stringify({ elapsed: Date.now() - started, ...event }));
  },
};
const index = await buildExamSourceIndex(lectures);
const pool = new ExamPool(index.units, index.lecturesById, service, () => undefined);
try {
  await pool.start();
  while (!pool.snapshot().initialized && !pool.snapshot().error && Date.now() - started < 150_000) await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(pool.snapshot().error, "");
  assert.equal(pool.snapshot().initialized, true, "Five questions failed to initialize within the smoke test deadline.");
  assert.equal(pool.snapshot().ready, 5);
  const startupMs = Date.now() - started;
  const lectureIds = new Set<string>();
  for (let i = 0; i < 5; i++) {
    const question = pool.snapshot().current!;
    lectureIds.add(question.lectureId);
    console.log(JSON.stringify({ question: i + 1, lecture: question.lectureTitle, stem: question.stem, choices: question.choices.length, evidence: question.sourcePages, level: question.level }));
    // Stop after inspecting five actual questions; cancel refill work on exit.
    if (i < 4) pool.answer(question.id, i % 2 ? (question.correctIndex + 1) % question.choices.length : question.correctIndex);
  }
  assert.equal(lectureIds.size, 5);
  assert.ok(maxActive <= 2);
  console.log(JSON.stringify({ success: true, startupMs, providerCalls: calls, maxConcurrent: maxActive, distinctStartupLectures: lectureIds.size, auth: "stubbed", provider: "real" }));
} finally { pool.dispose(); }
