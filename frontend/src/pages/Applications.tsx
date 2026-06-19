import { useEffect, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import SavedTrialCard, { EmptyState, PageHead, timeAgo } from "../components/SavedTrialCard";
import { getApplied, onStatsChange, withdrawApplication } from "../session";

export default function Applications() {
  const [items, setItems] = useState(getApplied);
  useEffect(() => onStatsChange(() => setItems(getApplied())), []);

  return (
    <DashboardLayout>
      <PageHead
        title="Trial applications"
        count={items.length}
        subtitle="Simulated applications you've submitted from match results."
      />
      {items.length === 0 ? (
        <EmptyState
          title="No applications yet"
          body="Use “Apply to this trial” on a match to track it here."
          icon={
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
              <path d="M14 2v6h6M9 13h6M9 17h6" />
            </svg>
          }
        />
      ) : (
        <div className="space-y-4">
          {items.map((t, i) => (
            <SavedTrialCard
              key={t.nctId}
              trial={t}
              index={i}
              removeLabel="Withdraw"
              onRemove={() => withdrawApplication(t.nctId)}
              badge={
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    Submitted
                  </span>
                  <span className="text-[11px] text-slate-400">{timeAgo(t.ts)}</span>
                </div>
              }
            />
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
