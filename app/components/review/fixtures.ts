// Fictional review data. These components never access the user's library.
export const reviewLectures = [
  { id: "enzymes", title: "Enzymes", instructor: "Mitsouras", week: "3", course: "MCF" },
  { id: "glycolysis", title: "Carbohydrate Structure and Glycolysis", instructor: "Mitsouras", week: "3", course: "MCF" },
  { id: "signaling", title: "Signal Transduction", instructor: "Mitsouras", week: "3", course: "MCF" },
  { id: "pharmacology", title: "Introduction to Pharmacology", instructor: "Vansal", week: "3", course: "MCF" },
  { id: "chromatin", title: "Nucleic Acid and Chromatin Structure", instructor: "Huwe", week: "2", course: "MCF" },
  { id: "replication", title: "DNA Replication, Telomeres, and Repair", instructor: "Huwe", week: "2", course: "MCF" },
  { id: "genetics", title: "Introduction to Human Genetics", instructor: "Mitsouras", week: "2", course: "MCF" },
  { id: "embryology", title: "Introduction to Human Embryology", instructor: "Rinaldi", week: "2", course: "MCF" },
];
export type ReviewLecture = typeof reviewLectures[number];
export type Confidence = "Weak" | "O.K." | "Strong";
export const confidenceLevels: Confidence[] = ["Weak", "O.K.", "Strong"];
export const initialObjectives: {id:number; lectureId:string; text:string; strength:Confidence; priority:boolean; selected:boolean}[] = [
  {id:1, lectureId:"enzymes", text:"Define Km and Vmax and explain their significance.", strength:"Weak", priority:true, selected:true},
  {id:2, lectureId:"glycolysis", text:"Describe the regulation of glycolysis at its irreversible steps.", strength:"Weak", priority:false, selected:false},
  {id:3, lectureId:"signaling", text:"Compare G protein–coupled and enzyme-linked receptors.", strength:"Weak", priority:true, selected:false},
  {id:4, lectureId:"enzymes", text:"Compare competitive and noncompetitive inhibition.", strength:"O.K.", priority:false, selected:true},
  {id:5, lectureId:"glycolysis", text:"Trace the conversion of glucose to pyruvate.", strength:"O.K.", priority:false, selected:false},
  {id:6, lectureId:"pharmacology", text:"Distinguish potency from efficacy.", strength:"O.K.", priority:true, selected:false},
  {id:7, lectureId:"enzymes", text:"Describe how enzymes affect activation energy.", strength:"Strong", priority:false, selected:false},
  {id:8, lectureId:"signaling", text:"Identify the major classes of second messengers.", strength:"Strong", priority:false, selected:false},
  {id:9, lectureId:"replication", text:"Describe the roles of DNA polymerase and ligase.", strength:"O.K.", priority:false, selected:false},
];
export const slideTitles = ["Enzymes", "Session learning objectives", "Catalysis", "Activation energy", "Enzyme specificity", "Cofactors", "Reaction velocity", "Substrate concentration", "Michaelis–Menten kinetics", "Km and Vmax", "Competitive inhibition", "Noncompetitive inhibition"];
