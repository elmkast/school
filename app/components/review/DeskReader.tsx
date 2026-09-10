import { useState } from "react";
import { slideTitles, type ReviewLecture } from "./fixtures";

/** A vector fixture, not a rendering of an uploaded PDF. */
export function DeskSlide({ title, cover = false, variant = 0 }: {
  title: string; cover?: boolean; variant?: number;
}) {
  const words = title.split(" ");
  const lines: string[] = [];
  for (const word of words) {
    if (!lines.length || `${lines[lines.length - 1]} ${word}`.length > 32) lines.push(word);
    else lines[lines.length - 1] += ` ${word}`;
  }
  return <svg className="desk-slide" viewBox="0 0 800 500" role="img" aria-label={`Sample slide: ${title}`}>
    <rect width="800" height="500" fill="#fffefa" />
    <text x="54" y="48" fontSize="13" fill="#666861">MCF / Medical &amp; Clinical Foundations</text>
    <path d="M54 68H746" stroke="#b9bcb4" />
    {lines.map((line, i) => <text key={i} x="54" y={132 + i * 41} fontSize="34" fill="#252822">{line}</text>)}
    {cover ? <>
      <path d="M54 365H280" stroke="#344a80" strokeWidth="3" />
      <text x="54" y="403" fontSize="16" fill="#565951">Session material</text>
      {variant % 2 === 0 ? <g fill="none" stroke="#9baba7" strokeWidth="1.5">
        {[0, 1, 2, 3].map(i => <ellipse key={i} cx="621" cy="342" rx={64 + i * 13} ry={26 + i * 13} transform={`rotate(${i * 22} 621 342)`} />)}
      </g> : <g fill="none" stroke="#9baba7">
        {[0, 1, 2, 3, 4].map(i => <path key={i} d={`M510 ${390-i*17} Q565 ${295-i*9} 650 ${335-i*16} T744 ${285-i*9}`} />)}
      </g>}
    </> : <>
      <text x="54" y="274" fontSize="19" fill="#343830">Enzyme activity depends on substrate availability.</text>
      <text x="54" y="308" fontSize="19" fill="#343830">Rate approaches a maximum as sites become occupied.</text>
      <path d="M520 348V438H732" stroke="#73796f" fill="none" />
      <path d="M525 432Q553 355 625 357T727 357" stroke="#344a80" strokeWidth="3" fill="none" />
      <path d="M525 357H732" stroke="#a3a79d" strokeDasharray="4 5" />
      <text x="54" y="410" fontSize="14" fill="#62675c">Illustrative review content</text>
    </>}
    <text x="54" y="470" fontSize="12" fill="#77796f">FCOM</text>
  </svg>;
}

export function DeskReader({ lecture, initialPage, objective, onBack, onPage }: {
  lecture: ReviewLecture;
  initialPage: number;
  objective?: string;
  onBack(): void;
  onPage(page: number): void;
}) {
  const [page, setPage] = useState(initialPage);
  const [contents, setContents] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [marked, setMarked] = useState<number[]>([]);
  function go(next: number) { setPage(next); onPage(next); }
  return <div className="desk-reader">
    <header className="desk-reader-header">
      <button onClick={onBack}>← Back</button>
      <span>{lecture.title}</span>
      <button aria-expanded={contents} onClick={() => setContents(!contents)}>Contents</button>
    </header>
    {objective && <div className="desk-source-context"><span>Studying</span><p>{objective}</p></div>}
    <div className="desk-reader-body">
      {contents && <nav className="desk-contents" aria-label="Concept slide contents">
        {slideTitles.map((title, i) => <button key={title} aria-current={page === i + 1 ? "page" : undefined} onClick={() => go(i + 1)}><span>{i + 1}</span>{i === 0 ? lecture.title : title}</button>)}
      </nav>}
      <div className="desk-document-scroll"><div className="desk-document" style={{ width: `${zoom}%` }}>
        <DeskSlide title={page === 1 ? lecture.title : slideTitles[page - 1]} cover={page === 1} />
      </div></div>
    </div>
    <footer className="desk-reader-footer">
      <div><button aria-label="Previous sample slide" disabled={page === 1} onClick={() => go(page - 1)}>←</button><span>{page} / 12</span><button aria-label="Next sample slide" disabled={page === 12} onClick={() => go(page + 1)}>→</button></div>
      <div><button aria-label="Zoom out sample slide" disabled={zoom === 100} onClick={() => setZoom(zoom - 25)}>−</button><button onClick={() => setZoom(100)} aria-label="Fit sample slide">{zoom}%</button><button aria-label="Zoom in sample slide" disabled={zoom === 400} onClick={() => setZoom(zoom + 25)}>+</button></div>
      <button aria-pressed={marked.includes(page)} onClick={() => setMarked(items => items.includes(page) ? items.filter(p => p !== page) : [...items, page])}>{marked.includes(page) ? "Marked" : "Mark"}</button>
    </footer>
  </div>;
}
