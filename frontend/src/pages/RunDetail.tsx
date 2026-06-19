import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import TrialCard from "../components/TrialCard";
import { EmptyState, timeAgo } from "../components/SavedTrialCard";
import { getRun, type RunRecord } from "../session";

export default function RunDetail() {
  const { patientId = "" } = useParams();
  const navigate = useNavigate();
  const [run, setRun] = useState<RunRecord | undefined>(() => getRun(patientId));

  useEffect(() => {
    setRun(getRun(patientId));
  }, [patientId]);

  const result = run?.result;
  const matchCount = result ? result.trials.filter((t) => t.lane === "match").length : 0;

  return (
    <DashboardLayout>
      {/* Back + header */}
      <button
        onClick={() => navigate("/runs")}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M11 18l-6-6 6-6" />
        </svg>
        Previous runs
      </button>

      {!run ? (
        <EmptyState
          title="Run not found"
          body="This run isn't in your history anymore."
          icon={
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8h.01M11 12h1v4h1" />
            </svg>
          }
        />
      ) : (
        <>
          {/* Patient + run summary */}
          <div className="flex items-start justify-between gap-4 mb-6 animate-fade-in-up">
            <div className="flex items-center gap-3 min-w-0">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white text-sm font-bold shadow-sm shrink-0">
                {patientId.replace(/\D/g, "") || patientId.slice(0, 2)}
              </span>
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900 flex items-center gap-2.5">
                  {patientId}
                  {result && result.subtype && (
                    <span className="text-[11px] font-semibold text-brand-700 bg-brand-50 border border-brand-100 rounded-full px-2 py-0.5">
                      {result.subtype}
                    </span>
                  )}
                </h1>
                <div className="mt-0.5 text-[13px] text-slate-500 flex items-center gap-1.5">
                  <span className="capitalize">{run.mode} mode</span>
                  <span>·</span>
                  <span>{timeAgo(run.ts)}</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => navigate(`/match/${patientId}`)}
              className="btn-primary inline-flex items-center gap-2 text-white text-sm font-semibold rounded-xl px-4 py-2.5 shrink-0"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
              </svg>
              Re-run live
            </button>
          </div>

          {/* Summary banner */}
          {result && (
            <div
              className={
                "rounded-2xl border p-5 mb-6 " +
                (matchCount > 0
                  ? "bg-gradient-to-br from-emerald-50 to-white border-emerald-200"
                  : "bg-gradient-to-br from-slate-50 to-white border-slate-200")
              }
            >
              <div className="flex items-center gap-3">
                <span
                  className={
                    "flex h-10 w-10 items-center justify-center rounded-xl shrink-0 " +
                    (matchCount > 0 ? "bg-analyzer text-white" : "bg-slate-300 text-white")
                  }
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                    {matchCount > 0 ? <path d="M20 6 9 17l-5-5" /> : <path d="M5 12h14" />}
                  </svg>
                </span>
                <div>
                  <div className="text-base font-semibold text-slate-900">
                    {matchCount > 0
                      ? `${matchCount} matching ${matchCount === 1 ? "trial" : "trials"}`
                      : "No eligible trials"}
                  </div>
                  <div className="text-[13px] text-slate-500">
                    Screened {result.trials.length} recruiting{" "}
                    {result.trials.length === 1 ? "trial" : "trials"} · verdicts are deterministic
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Trial cards (read-only stored result) */}
          {result ? (
            <div className="space-y-5">
              {[...result.trials]
                .sort((a, b) => (a.lane === b.lane ? 0 : a.lane === "match" ? -1 : 1))
                .map((t, i) => (
                  <TrialCard key={t.nctId} trial={t} index={i} patientId={patientId} />
                ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-5 py-8 text-center">
              <div className="text-[14px] font-medium text-slate-600">Results weren't stored for this run</div>
              <div className="text-[13px] text-slate-400 mt-1">
                This run predates result caching. Re-run it live to see the full breakdown.
              </div>
              <button
                onClick={() => navigate(`/match/${patientId}`)}
                className="btn-primary mt-4 inline-flex items-center gap-2 text-white text-sm font-semibold rounded-xl px-4 py-2.5"
              >
                Re-run live
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          )}
        </>
      )}
    </DashboardLayout>
  );
}
