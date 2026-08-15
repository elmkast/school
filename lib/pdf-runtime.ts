import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();

export { pdfjs };
