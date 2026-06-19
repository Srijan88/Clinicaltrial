import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { findTrials, getPatients, getRunMessages, getRunStatus } from "../api";
import { getClinicianId, getClinicianName, getMode, incrementSearchCount, isSearchSaved, recordRun, saveSearch } from "../session";
import type {
  MatchResult,
  PatientHeadline,
  RoomMessage,
  RunState,
} from "../types";
import AgentTail from "../components/AgentTail";
import TrialCard, { TrialSkeleton } from "../components/TrialCard";
import PipelineProgress from "../components/PipelineProgress";
import CountUp from "../components/CountUp";
import { Logo } from "../components/Brand";

const EXPECTED_TRIAL_SLOTS = 3;

export default function Match() {
  const { patientId = "" } = useParams();
  const navigate = useNavigate();
  const clinicianName = getClinicianName();
  const mode = getMode();

  const [patient, setPatient] = useState<PatientHeadline | null>(null);
  const [state, setState] = useState<RunState>("starting");
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [saved, setSaved] = useState(() => isSearchSaved(patientId));

  const runIdRef = useRef<string>("");
  const startRef = useRef<number>(Date.now());
  const stoppedRef = useRef<boolean>(false);
  // Guards against React StrictMode double-invoking the mount effect (which
  // would POST two kickoffs / create two rooms per click). Keyed by patientId
  // so navigating to a different patient still starts a fresh run.
  const kickedForRef = useRef<string>("");

  const startRun = useCallback(async () => {
    setError("");
    setMessages([]);
    setResult(null);
    setState("starting");
    setElapsed(0);
    setPaused(false);
    stoppedRef.current = false;
    startRef.current = Date.now();
    try {
      const handle = await findTrials(patientId, getClinicianId(), getMode());
      runIdRef.current = handle.run_id;
      incrementSearchCount();
    } catch (e) {
      setError(String(e));
      setState("error");
    }
  }, [patientId]);

  // Stop tailing the current run (the backend keeps working; we just pause the
  // polling so the clinician stays in control of a long live run).
  const stopRun = useCallback(() => {
    stoppedRef.current = true;
    setPaused(true);
  }, []);

  // Resume tailing the same run from where we left off.
  const resumeRun = useCallback(() => {
    stoppedRef.current = false;
    setPaused(false);
  }, []);

  useEffect(() => {
    if (!getClinicianId()) {
      navigate("/login");
      return;
    }
    // Always start at the top of the page when a new patient run begins —
    // the user shouldn't have to scroll up to see "Matching in progress".
    window.scrollTo({ top: 0, behavior: "auto" });
    getPatients()
      .then((ps) => setPatient(ps.find((p) => p.patientId === patientId) || null))
      .catch(() => undefined);
    // Only kick off once per patient. StrictMode runs this effect twice in dev;
    // the second pass just re-enables polling rather than starting a 2nd run.
    if (kickedForRef.current !== patientId) {
      kickedForRef.current = patientId;
      startRun();
    } else {
      stoppedRef.current = false;
    }
    return () => {
      stoppedRef.current = true;
    };
  }, [patientId, navigate, startRun]);

  useEffect(() => {
    if (state === "done" || state === "error" || paused) return;
    const t = setInterval(() => {
      setElapsed(Math.round((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [state, paused]);

  // Poll the full transcript every 1.5s and reconcile by id. Fetching the full
  // (small) list and replacing — rather than appending a since-cursor delta —
  // is resilient to the backend's transcript composition varying between polls
  // (it merges several Band endpoints, any of which can transiently fail). That
  // variance was causing duplicate messages in the tail.
  useEffect(() => {
    const t = setInterval(async () => {
      if (!runIdRef.current || stoppedRef.current) return;
      try {
        const { messages: full } = await getRunMessages(runIdRef.current, "");
        if (!full || full.length === 0) return; // never wipe a populated tail
        const seen = new Set<string>();
        const deduped: RoomMessage[] = [];
        for (const m of full) {
          if (m.id && !seen.has(m.id)) {
            seen.add(m.id);
            deduped.push(m);
          }
        }
        setMessages((prev) =>
          prev.length === deduped.length && prev[prev.length - 1]?.id === deduped[deduped.length - 1]?.id
            ? prev // no change — avoid needless re-render/re-animation
            : deduped
        );
      } catch {
        // transient; keep polling
      }
    }, 1500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(async () => {
      if (!runIdRef.current || stoppedRef.current) return;
      try {
        const status = await getRunStatus(runIdRef.current);
        setState(status.state);
        if (status.state === "done" && status.result) {
          setResult(status.result);
          stoppedRef.current = true;
          // Auto-record this completed run so it appears under "Previous runs".
          const trials = status.result.trials || [];
          recordRun({
            patientId,
            mode: getMode(),
            matchCount: trials.filter((t) => t.lane === "match").length,
            total: trials.length,
            result: status.result,
          });
        } else if (status.state === "error") {
          setError(status.error || "Run failed.");
          stoppedRef.current = true;
        }
      } catch {
        // transient
      }
    }, 3000);
    return () => clearInterval(t);
  }, []);

  const inProgress = state !== "done" && state !== "error";
  const matchCount = result ? result.trials.filter((t) => t.lane === "match").length : 0;

  function onSaveSearch() {
    saveSearch({
      patientId,
      mode,
      matchCount,
      total: result?.trials.length ?? 0,
    });
    setSaved(true);
  }

  return (
    <div className="min-h-full flex flex-col">
      {/* Header strip */}
      <div className="bg-white/75 backdrop-blur-xl border-b border-slate-200/70 sticky top-0 z-20">
        <div className="max-w-[1440px] mx-auto px-8 h-[68px] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => navigate("/patients")}
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 shrink-0"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M11 18l-6-6 6-6" />
              </svg>
              Patients
            </button>
            <span className="h-5 w-px bg-slate-200 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="font-semibold text-slate-900">
                  {patient ? patient.patientId : patientId}
                </span>
                {patient && (
                  <>
                    <span className="text-[10px] font-semibold tracking-wide uppercase px-1.5 py-0.5 rounded-md bg-slate-900 text-white">
                      Stage {patient.stage}
                    </span>
                    <span className="text-[11px] font-semibold text-brand-700 bg-brand-50 border border-brand-100 rounded-full px-2 py-0.5">
                      {patient.subtype}
                    </span>
                    <span className="text-xs text-slate-500">
                      {patient.age} · <span className="capitalize">{patient.sex}</span> · ECOG {patient.ecog}
                    </span>
                    {patient.brainMets && (
                      <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-1.5 py-0.5">
                        Brain mets
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm shrink-0">
            <Timer inProgress={inProgress} done={state === "done"} elapsed={elapsed} mode={mode} paused={paused} />
            {inProgress && !paused && (
              <button
                onClick={stopRun}
                className="inline-flex items-center gap-1.5 rounded-full bg-white border border-slate-200 hover:border-red-200 hover:bg-red-50 hover:text-red-600 text-slate-600 px-3 py-1.5 text-xs font-semibold shadow-sm transition-colors"
              >
                <span className="flex h-3.5 w-3.5 items-center justify-center">
                  <span className="h-2.5 w-2.5 rounded-[3px] bg-current" />
                </span>
                Stop
              </button>
            )}
            {inProgress && paused && (
              <button
                onClick={resumeRun}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 text-xs font-semibold shadow-sm"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Resume
              </button>
            )}
            <button
              onClick={onSaveSearch}
              disabled={saved}
              title={saved ? "Saved to your searches" : "Save this search"}
              className={
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border shadow-sm transition-colors " +
                (saved
                  ? "bg-brand-50 text-brand-700 border-brand-200 cursor-default"
                  : "bg-white text-slate-600 border-slate-200 hover:border-brand-200 hover:text-brand-600")
              }
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill={saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z" />
              </svg>
              {saved ? "Saved" : "Save"}
            </button>
            <span className="hidden sm:inline text-slate-500">{clinicianName}</span>
          </div>
        </div>
      </div>

      {/* Two-column body */}
      <div className="flex-1 max-w-[1440px] w-full mx-auto px-8 py-8 grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* LEFT 60% */}
        <div className="lg:col-span-3 space-y-6">
          {/* Status banner — reassurance while running, payoff when done. */}
          {!error && (
            <StatusBanner
              state={state}
              mode={mode}
              matchCount={matchCount}
              total={result?.trials.length ?? EXPECTED_TRIAL_SLOTS}
              paused={paused}
              onResume={resumeRun}
              onRestart={startRun}
            />
          )}

          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">Trial matches</h2>
            {result && (
              <span className="text-xs font-medium text-slate-400">
                {result.trials.length} screened
              </span>
            )}
          </div>

          {error && (
            <div className="text-sm bg-red-50 border border-red-200 rounded-2xl p-5">
              <div className="font-semibold text-red-800 mb-1">Run failed</div>
              <div className="text-red-700 mb-3 leading-relaxed">{error}</div>
              <button
                onClick={startRun}
                className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg px-3.5 py-2 text-sm font-medium"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
                </svg>
                Retry
              </button>
            </div>
          )}

          {!result && !error && (
            <div className="space-y-5">
              {Array.from({ length: EXPECTED_TRIAL_SLOTS }).map((_, i) => (
                <TrialSkeleton key={i} index={i} />
              ))}
            </div>
          )}

          {result && (
            <div className="space-y-5">
              {[...result.trials]
                .sort((a, b) => (a.lane === b.lane ? 0 : a.lane === "match" ? -1 : 1))
                .map((t, i) => (
                  <TrialCard key={t.nctId} trial={t} index={i} patientId={patientId} />
                ))}
            </div>
          )}
        </div>

        {/* RIGHT 40% */}
        <div className="lg:col-span-2">
          <div className="bg-white border border-slate-200/80 rounded-2xl shadow-card p-5 h-[76vh] sticky top-[92px]">
            <AgentTail messages={messages} state={state} paused={paused} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* Reassurance + payoff banner. Carries the pipeline stepper during a run and
   the match summary on completion. */
function StatusBanner({
  state,
  mode,
  matchCount,
  total,
  paused,
  onResume,
  onRestart,
}: {
  state: RunState;
  mode: string;
  matchCount: number;
  total: number;
  paused: boolean;
  onResume: () => void;
  onRestart: () => void;
}) {
  if (state === "done") {
    const found = matchCount > 0;
    return (
      <div
        className={
          "animate-pop-in rounded-2xl border p-6 shadow-card " +
          (found
            ? "bg-gradient-to-br from-emerald-50 to-white border-emerald-200"
            : "bg-gradient-to-br from-slate-50 to-white border-slate-200")
        }
      >
        <div className="flex items-center gap-4">
          <span
            className={
              "flex h-12 w-12 items-center justify-center rounded-2xl shrink-0 " +
              (found
                ? "bg-analyzer text-white shadow-[0_10px_24px_-8px_rgba(5,150,105,0.7)]"
                : "bg-slate-300 text-white")
            }
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
              {found ? <path d="M20 6 9 17l-5-5" /> : <path d="M5 12h14" />}
            </svg>
          </span>
          <div>
            <div className="text-lg font-semibold tracking-tight text-slate-900">
              {found ? (
                <>
                  <CountUp value={matchCount} className="text-analyzer" /> matching{" "}
                  {matchCount === 1 ? "trial" : "trials"} found
                </>
              ) : (
                "No eligible trials"
              )}
            </div>
            <div className="text-sm text-slate-500">
              Screened {total} recruiting {total === 1 ? "trial" : "trials"} · verdicts are deterministic
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-card p-6">
      {/* Indeterminate progress stripe at the top edge — communicates "the
          system is doing something" the whole time, never frozen. */}
      {!paused && <span className="loading-stripe" />}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className={paused ? "" : "animate-float"}>
            <Logo size={30} />
          </span>
          <div>
            <div className="text-base font-semibold tracking-tight text-slate-900">
              {paused ? "Paused" : "Matching in progress"}
            </div>
            <div className="text-[13px] text-slate-500">
              {paused
                ? "The agents keep working in the background. Resume to continue tailing."
                : mode === "demo"
                ? "Replaying a cached run — about 30 seconds."
                : "Live agents are reasoning over the trials — this takes 1–3 minutes."}
            </div>
          </div>
        </div>
        {paused && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onResume}
              className="btn-primary inline-flex items-center gap-1.5 text-white text-xs font-semibold rounded-lg px-3 py-2"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              Resume
            </button>
            <button
              onClick={onRestart}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold px-3 py-2"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
              </svg>
              Restart
            </button>
          </div>
        )}
      </div>
      <div className={paused ? "opacity-50 saturate-50 transition-opacity" : "transition-opacity"}>
        <PipelineProgress state={state} />
      </div>
    </div>
  );
}

function Timer({
  inProgress,
  done,
  elapsed,
  mode,
  paused,
}: {
  inProgress: boolean;
  done: boolean;
  elapsed: number;
  mode: string;
  paused: boolean;
}) {
  if (!inProgress && !done) return null;
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums " +
        (done
          ? "bg-emerald-50 text-emerald-700"
          : paused
          ? "bg-amber-50 text-amber-700"
          : "bg-brand-50 text-brand-700")
      }
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      {done ? `Done in ${elapsed}s` : `${elapsed}s`}
      {!done && !paused && mode === "live" && <span className="text-brand-400">· live</span>}
      {!done && paused && <span className="text-amber-400">· paused</span>}
    </span>
  );
}
