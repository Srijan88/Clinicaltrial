import type { RunState } from "../types";
import { agentLabel } from "../agents";

/** The four-agent pipeline as a horizontal stepper. Core reassurance device
 * during a 1-3 min live run: completed stages fill with a tick, the ACTIVE
 * stage gets an orbiting conic ring (a line tracing the circle) so forward
 * motion is always visible and the wait never reads as frozen. */

const STAGES: { key: RunState; blurb: string }[] = [
  { key: "intake", blurb: "Reading patient profile" },
  { key: "discoverer", blurb: "Finding candidate trials" },
  { key: "parser", blurb: "Extracting eligibility" },
  { key: "analyzer", blurb: "Scoring & rationale" },
];

const ORDER: RunState[] = ["starting", "intake", "discoverer", "parser", "analyzer", "done"];

function rank(state: RunState): number {
  const i = ORDER.indexOf(state);
  return i < 0 ? 0 : i;
}

export default function PipelineProgress({ state }: { state: RunState }) {
  const current = rank(state);
  const done = state === "done";

  return (
    <div className="grid grid-cols-4 gap-1">
      {STAGES.map((s, i) => {
        const stageRank = i + 1; // intake=1 … analyzer=4
        const isDone = done || current > stageRank;
        const isActive = !done && current === stageRank;
        const isLast = i === STAGES.length - 1;

        return (
          <div key={s.key} className="flex flex-col items-center text-center">
            <div className="relative flex w-full items-center justify-center">
              {/* connector to the next node */}
              {!isLast && (
                <span className="absolute left-1/2 top-1/2 h-[3px] w-full -translate-y-1/2 rounded-full bg-slate-100 overflow-hidden">
                  <span
                    className={
                      "block h-full rounded-full bg-gradient-to-r from-analyzer to-brand-500 transition-[width] duration-700 ease-out " +
                      (isDone ? "w-full" : "w-0")
                    }
                  />
                </span>
              )}

              {/* node */}
              <span className={isActive ? "spin-ring" : ""}>
                <span
                  className={
                    "relative z-10 flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold transition-colors duration-300 " +
                    (isDone
                      ? "bg-analyzer text-white shadow-[0_6px_16px_-6px_rgba(5,150,105,0.6)]"
                      : isActive
                      ? "bg-white text-brand-700 ring-2 ring-brand-100 shadow-[0_6px_18px_-6px_rgba(37,99,235,0.5)]"
                      : "bg-slate-100 text-slate-400")
                  }
                >
                  {isDone ? (
                    <svg className="animate-pop-in" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </span>
              </span>
            </div>

            <div
              className={
                "mt-3 text-[12px] font-semibold transition-colors leading-tight " +
                (isActive ? "text-brand-700" : isDone ? "text-slate-800" : "text-slate-400")
              }
            >
              {agentLabel(s.key)}
            </div>
            <div
              className={
                "mt-0.5 text-[11px] leading-tight transition-colors hidden sm:block " +
                (isActive ? "text-slate-500" : "text-slate-400")
              }
            >
              {s.blurb}
            </div>
          </div>
        );
      })}
    </div>
  );
}
