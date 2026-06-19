import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import { EmptyState, PageHead, timeAgo } from "../components/SavedTrialCard";
import { getSavedSearches, onStatsChange, removeSavedSearch } from "../session";

export default function SavedSearches() {
  const navigate = useNavigate();
  const [items, setItems] = useState(getSavedSearches);
  useEffect(() => onStatsChange(() => setItems(getSavedSearches())), []);

  return (
    <DashboardLayout>
      <PageHead
        title="Saved searches"
        count={items.length}
        subtitle="Re-run a previous patient match in one click."
      />
      {items.length === 0 ? (
        <EmptyState
          title="No saved searches"
          body="Run a match and hit “Save” in the header to keep it here."
          icon={
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z" />
            </svg>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {items.map((s, i) => (
            <div
              key={s.patientId}
              style={{ animationDelay: `${i * 60}ms` }}
              className="card-hover animate-fade-in-up bg-white border border-slate-200/80 rounded-2xl shadow-card p-5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-base font-semibold text-slate-900">{s.patientId}</div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    Saved {timeAgo(s.ts)} · {s.mode} mode
                  </div>
                </div>
                <span
                  className={
                    "text-[11px] font-semibold rounded-full px-2 py-0.5 " +
                    (s.matchCount > 0
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-slate-100 text-slate-500")
                  }
                >
                  {s.matchCount}/{s.total} match
                </span>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <button
                  onClick={() => navigate(`/match/${s.patientId}`)}
                  className="btn-primary inline-flex items-center gap-1.5 text-white text-sm font-semibold rounded-lg px-3.5 py-2"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" />
                  </svg>
                  Re-run
                </button>
                <button
                  onClick={() => removeSavedSearch(s.patientId)}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-rose-600 rounded-lg px-3 py-2 transition-colors"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
