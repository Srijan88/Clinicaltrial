import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import { EmptyState, PageHead, timeAgo } from "../components/SavedTrialCard";
import { getRunHistory, onStatsChange, removeRun, type RunRecord } from "../session";

export default function PreviousRuns() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<RunRecord[]>(getRunHistory);
  useEffect(() => onStatsChange(() => setRuns(getRunHistory())), []);

  return (
    <DashboardLayout>
      <PageHead
        title="Previous runs"
        count={runs.length}
        subtitle="Completed matches. Open one to see its results, or re-run live."
      />

      {runs.length === 0 ? (
        <EmptyState
          title="No runs yet"
          body="Run a match from the dashboard and it'll be saved here for review."
          icon={
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          }
        />
      ) : (
        <div className="space-y-3">
          {runs.map((r, i) => (
            <RunRow
              key={r.patientId}
              run={r}
              index={i}
              onOpen={() => navigate(`/runs/${r.patientId}`)}
              onRemove={() => removeRun(r.patientId)}
            />
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}

function RunRow({
  run,
  index,
  onOpen,
  onRemove,
}: {
  run: RunRecord;
  index: number;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const hasMatch = run.matchCount > 0;
  return (
    <div
      style={{ animationDelay: `${index * 50}ms` }}
      className="card-hover animate-fade-in-up bg-white border border-slate-200/80 rounded-2xl shadow-card overflow-hidden flex"
    >
      <button onClick={onOpen} className="flex-1 flex items-center gap-4 p-5 text-left min-w-0">
        <span
          className={
            "flex h-11 w-11 items-center justify-center rounded-xl text-[13px] font-bold shrink-0 " +
            (hasMatch ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")
          }
        >
          {run.patientId.replace(/\D/g, "") || run.patientId.slice(0, 2)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-semibold text-slate-900">{run.patientId}</span>
            <span
              className={
                "text-[11px] font-semibold rounded-full px-2 py-0.5 " +
                (hasMatch
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-slate-100 text-slate-500")
              }
            >
              {run.matchCount}/{run.total} match
            </span>
          </div>
          <div className="mt-0.5 text-[12px] text-slate-400 flex items-center gap-1.5">
            <span className="capitalize">{run.mode} mode</span>
            <span>·</span>
            <span>{timeAgo(run.ts)}</span>
            {!run.result && (
              <>
                <span>·</span>
                <span className="text-amber-500">results not stored</span>
              </>
            )}
          </div>
        </div>

        <span className="shrink-0 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-600">
          View results
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </span>
      </button>

      <button
        onClick={onRemove}
        title="Remove from history"
        className="px-3 text-slate-300 hover:text-rose-500 border-l border-slate-100 transition-colors"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        </svg>
      </button>
    </div>
  );
}
