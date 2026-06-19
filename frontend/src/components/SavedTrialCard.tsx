import { Link } from "react-router-dom";
import type { SavedTrial } from "../session";

/** Compact row used by the Favorites and Applications pages. Shows the trial
 * metadata captured when it was saved, plus a re-run link and a remove action. */
export default function SavedTrialCard({
  trial,
  index = 0,
  badge,
  removeLabel,
  onRemove,
}: {
  trial: SavedTrial;
  index?: number;
  badge?: React.ReactNode;
  removeLabel: string;
  onRemove: () => void;
}) {
  const isMatch = trial.lane === "match";
  return (
    <div
      style={{ animationDelay: `${index * 60}ms` }}
      className="card-hover animate-fade-in-up bg-white border border-slate-200/80 rounded-2xl shadow-card overflow-hidden"
    >
      <div className="flex">
        <div className={isMatch ? "w-1.5 bg-analyzer" : "w-1.5 bg-slate-200"} />
        <div className="flex-1 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-slate-900">{trial.nctId}</span>
                {trial.phase && (
                  <span className="text-[11px] font-medium text-slate-600 bg-slate-100 rounded-md px-1.5 py-0.5">
                    {trial.phase}
                  </span>
                )}
                <LanePill isMatch={isMatch} />
              </div>
              <div className="mt-1.5 text-[14px] font-medium text-slate-800 leading-snug">
                {trial.title}
              </div>
              {trial.conditions.length > 0 && (
                <div className="mt-1 text-xs text-slate-400 truncate">
                  {trial.conditions.slice(0, 2).join(", ")}
                </div>
              )}
            </div>
            {badge}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-[13px]">
              <Link
                to={`/match/${trial.patientId}`}
                className="inline-flex items-center gap-1.5 font-medium text-brand-600 hover:text-brand-700"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
                </svg>
                Re-run for {trial.patientId}
              </Link>
              <a
                href={trial.detailsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700"
              >
                CT.gov
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 17 17 7M7 7h10v10" />
                </svg>
              </a>
            </div>
            <button
              onClick={onRemove}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-400 hover:text-rose-600 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              </svg>
              {removeLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LanePill({ isMatch }: { isMatch: boolean }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full " +
        (isMatch ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")
      }
    >
      {isMatch ? "MATCH" : "NO MATCH"}
    </span>
  );
}

export function timeAgo(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function EmptyState({
  title,
  body,
  icon,
}: {
  title: string;
  body: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="animate-fade-in-up flex flex-col items-center justify-center text-center py-20">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-300 mb-4">
        {icon}
      </span>
      <div className="text-base font-semibold text-slate-700">{title}</div>
      <p className="mt-1 text-sm text-slate-500 max-w-xs">{body}</p>
      <Link
        to="/patients"
        className="btn-primary mt-5 inline-flex items-center gap-2 text-white text-sm font-semibold rounded-xl px-4 py-2.5"
      >
        Go to dashboard
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </Link>
    </div>
  );
}

export function PageHead({
  title,
  count,
  subtitle,
  action,
}: {
  title: string;
  count?: number;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-6 animate-fade-in-up">
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight text-slate-900 flex items-center gap-2.5">
          {title}
          {count != null && count > 0 && (
            <span className="text-sm font-bold text-brand-700 bg-brand-50 border border-brand-100 rounded-full px-2.5 py-0.5 tabular-nums">
              {count}
            </span>
          )}
        </h1>
        <p className="mt-1 text-[14px] text-slate-500">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
