import { useEffect, useRef, useState } from "react";
import type { RoomMessage, RunState } from "../types";
import { agentLabel } from "../agents";

const ROLE_COLOR: Record<string, string> = {
  intake: "bg-intake",
  discoverer: "bg-discoverer",
  parser: "bg-parser",
  analyzer: "bg-analyzer",
  orchestrator: "bg-orchestrator",
  participant: "bg-slate-400",
};

// rgb-triplet halo color per role (for the breathing halo on the working
// agent indicator). Matches the bg color from ROLE_COLOR but in raw rgb so
// it can drive a CSS variable inside box-shadow with alpha.
const ROLE_HALO: Record<string, string> = {
  intake: "37 99 235",
  discoverer: "124 58 237",
  parser: "8 145 178",
  analyzer: "5 150 105",
  orchestrator: "71 85 105",
  participant: "100 116 139",
};

// Rotating "working" copy so the indicator never looks frozen during Featherless
// rate-limit stalls (the live chain can pause for several seconds mid-hop).
const WORKING_COPY = [
  "is working",
  "is thinking it through",
  "is composing a response",
  "is coordinating with the room",
];

function relTime(iso: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const secs = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (secs < 60) return `${secs}s ago`;
  return `${Math.round(secs / 60)}m ago`;
}

function nextAgent(state: RunState): string | null {
  switch (state) {
    case "starting":
    case "intake":
      return "intake";
    case "discoverer":
      return "discoverer";
    case "parser":
      return "parser";
    case "analyzer":
      return "analyzer";
    default:
      return null;
  }
}

export default function AgentTail({
  messages,
  state,
  paused = false,
}: {
  messages: RoomMessage[];
  state: RunState;
  paused?: boolean;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [copyIdx, setCopyIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setCopyIdx((i) => (i + 1) % WORKING_COPY.length), 2800);
    return () => clearInterval(t);
  }, []);

  // Keep the latest message in view by scrolling ONLY the inner list. Never
  // call scrollIntoView() — it bubbles up to every ancestor scroll container
  // including the document, which used to drag the whole page down past the
  // "Matching in progress" banner whenever a new message arrived.
  useEffect(() => {
    if (!messages.length) return;
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const working = paused ? null : nextAgent(state);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[15px] font-semibold tracking-tight text-slate-900">
            Agent activity
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Live transcript from the Band room
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 bg-slate-50 border border-slate-200/70 rounded-full px-2.5 py-1">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          {messages.length}
        </span>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto space-y-3.5 pr-1 -mr-1">
        {messages.length === 0 && (
          <div className="text-sm text-slate-400 py-8 text-center">
            Waiting for the agents to start…
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className="flex gap-2.5 animate-fade-in-up">
            <div
              className={
                "shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold shadow-sm " +
                (ROLE_COLOR[m.author_role] || "bg-slate-400")
              }
              title={agentLabel(m.author_role)}
            >
              {agentLabel(m.author_role).charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-[13px] font-semibold text-slate-800 truncate">
                  {agentLabel(m.author_role)}
                </span>
                <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">
                  {relTime(m.posted_at)}
                </span>
              </div>
              <div className="mt-1 text-[13px] leading-relaxed text-slate-700 whitespace-pre-wrap break-words rounded-2xl rounded-tl-md bg-slate-50 border border-slate-200/60 px-3.5 py-2.5">
                {m.text}
              </div>
              {Array.isArray(m.tool_calls) &&
                (m.tool_calls as any[]).map((tc, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 mt-1.5 text-[11px] bg-white border border-slate-200 text-slate-500 rounded-full px-2 py-0.5"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="m13 2-3 8h6l-3 8" />
                    </svg>
                    called {String((tc && (tc.name || tc.tool)) || "tool")}
                  </span>
                ))}
            </div>
          </div>
        ))}
      </div>

      {working && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-3">
          <span
            className={
              "ai-pulse shrink-0 flex w-9 h-9 rounded-xl items-center justify-center text-white text-xs font-bold shadow-sm " +
              (ROLE_COLOR[working] || "bg-slate-400")
            }
            style={{ ["--halo" as any]: ROLE_HALO[working] || "100 116 139" }}
          >
            {agentLabel(working).charAt(0)}
          </span>
          <div className="text-sm text-slate-600 leading-tight">
            <span className="font-semibold text-slate-800">{agentLabel(working)}</span>{" "}
            <span className="text-slate-500">{WORKING_COPY[copyIdx]}</span>
            <span className="inline-flex gap-0.5 ml-0.5 align-middle">
              <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce" />
              <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce [animation-delay:0.15s]" />
              <span className="w-1 h-1 bg-slate-400 rounded-full animate-bounce [animation-delay:0.3s]" />
            </span>
          </div>
        </div>
      )}

      {paused && (
        <div className="mt-3 pt-3 border-t border-slate-100 text-sm text-slate-500 flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
          Tail paused
        </div>
      )}
    </div>
  );
}
