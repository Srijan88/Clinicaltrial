import { useEffect, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import SavedTrialCard, { EmptyState, PageHead, timeAgo } from "../components/SavedTrialCard";
import { getFavorites, onStatsChange, removeFavorite } from "../session";

export default function Favorites() {
  const [items, setItems] = useState(getFavorites);
  useEffect(() => onStatsChange(() => setItems(getFavorites())), []);

  return (
    <DashboardLayout>
      <PageHead
        title="Favorite trials"
        count={items.length}
        subtitle="Trials you starred while reviewing matches."
      />
      {items.length === 0 ? (
        <EmptyState
          title="No favorites yet"
          body="Tap the heart on any trial card to save it here for quick access."
          icon={
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
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
              removeLabel="Remove"
              onRemove={() => removeFavorite(t.nctId)}
              badge={
                <span className="text-[11px] text-slate-400 shrink-0">{timeAgo(t.ts)}</span>
              }
            />
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
