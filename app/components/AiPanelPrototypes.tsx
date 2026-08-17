"use client";

import { useState } from "react";

const assistantAnswer = "Hexokinase is inhibited by glucose-6-phosphate, while glucokinase remains active when hepatic glucose is high. That lets the liver continue buffering post-meal glucose without trapping it during fasting.";

function Composer({ dark = false }: { dark?: boolean }) {
  return <div className={`ai-prototype-composer ${dark ? "dark" : ""}`}><textarea aria-label="Prototype message to Luna"/><div><button type="button">Add context</button><button className="send" type="button" aria-label="Send message">↑</button></div></div>;
}

function ConversationFirst() {
  return <div className="ai-prototype-canvas conversation-first">
    <header><div><span>Luna</span><small>PDF page 20</small></div><button aria-label="Close prototype">×</button></header>
    <div className="ai-conversation-feed">
      <div className="ai-prototype-welcome"><strong>What would you like to understand?</strong></div>
      <article className="prototype-message user">Why does the liver use glucokinase instead of hexokinase after a meal?</article>
      <article className="prototype-message assistant"><small>LUNA</small><p>{assistantAnswer}</p><button>Explain the Km difference</button></article>
    </div>
    <div className="ai-conversation-bottom"><Composer/><div className="ai-context-links"><button><b>2</b> Marked</button><button><b>1</b> Flagged SLO</button><button><b>✓</b> Note saved</button></div></div>
  </div>;
}

function TabbedWorkspace() {
  const [tab, setTab] = useState<"chat" | "notes" | "marks">("chat");
  return <div className="ai-prototype-canvas tabbed-workspace">
    <header><div><small>STUDY COMPANION</small><strong>Slide 20</strong></div><button aria-label="Close prototype">×</button></header>
    <nav aria-label="Prototype study tools">{(["chat", "notes", "marks"] as const).map((item) => <button className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)}>{item === "chat" ? "Ask Luna" : item === "notes" ? "My note" : "Marked slides"}{item === "marks" && <b>2</b>}</button>)}</nav>
    {tab === "chat" && <div className="tabbed-prototype-body"><div className="tabbed-prompt"><small>LUNA · PAGE 20</small><p>{assistantAnswer}</p></div><div className="prototype-suggestions"><button>Compare the enzymes</button><button>Quiz me on this pathway</button><button>Connect this to diabetes</button></div></div>}
    {tab === "notes" && <div className="tabbed-prototype-body note"><label>MY NOTE FOR SLIDE 20<textarea defaultValue="Glucokinase acts as a hepatic glucose sensor because of its high Km."/></label><button>Save note</button></div>}
    {tab === "marks" && <div className="tabbed-prototype-body marks"><button><span>14</span><strong>Rate-limiting steps of glycolysis</strong></button><button className="active"><span>20</span><strong>Hexokinase versus glucokinase</strong></button></div>}
    <footer><Composer/></footer>
  </div>;
}

function FocusMode() {
  return <div className="ai-prototype-canvas focus-assistant">
    <header><div><small>PAGE 20</small><strong>Ask Luna</strong></div><button aria-label="Close prototype">×</button></header>
    <div className="focus-conversation"><article className="prototype-message user">When would glucokinase activity decrease?</article><article className="prototype-message assistant"><small>LUNA</small><p>During fasting, lower portal glucose and glucokinase sequestration reduce hepatic glucose phosphorylation. Glucagon also shifts the liver away from glycolysis.</p></article></div>
    <div className="focus-composer"><Composer dark/><small>Luna can use general medical knowledge in addition to this lecture.</small></div>
    <div className="focus-context"><div><small>STUDY CONTEXT</small><span>3 items</span></div><button><strong>Notes</strong><span>Glucokinase as a glucose sensor…</span></button><button><strong>Marked</strong><span>Slides 14, 20</span></button><button><strong>Flagged SLO</strong><span>Compare hexokinase and glucokinase.</span></button></div>
  </div>;
}

export function AiPanelPrototypes() {
  return <div className="ai-review-grid">
    <article className="ai-review-card"><div className="ai-review-description"><span>A · Conversation first</span><b>Recommended</b><p>ChatGPT-inspired. Conversation owns the panel; study tools become quiet contextual links.</p></div><ConversationFirst/></article>
    <article className="ai-review-card"><div className="ai-review-description"><span>B · Tabbed workspace</span><p>Chat, notes, and marked slides share one controlled surface instead of competing vertically.</p></div><TabbedWorkspace/></article>
    <article className="ai-review-card"><div className="ai-review-description"><span>C · Focus assistant</span><p>A darker, immersive conversation with saved study context collected below the composer.</p></div><FocusMode/></article>
  </div>;
}
