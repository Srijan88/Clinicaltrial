import { useEffect, useState } from "react";
import DashboardLayout from "../components/DashboardLayout";
import { EmptyState, PageHead, timeAgo } from "../components/SavedTrialCard";
import {
  clearNotifications,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  onStatsChange,
  type NotifKind,
} from "../session";

export default function Notifications() {
  const [items, setItems] = useState(getNotifications);
  useEffect(() => onStatsChange(() => setItems(getNotifications())), []);

  const unread = items.filter((n) => !n.read).length;

  return (
    <DashboardLayout>
      <PageHead
        title="Notifications"
        count={unread}
        subtitle="Activity from your matches, favorites and applications."
        action={
          items.length > 0 ? (
            <div className="flex items-center gap-2">
              <button
                onClick={markAllNotificationsRead}
                disabled={unread === 0}
                className="text-[13px] font-medium text-brand-600 hover:text-brand-700 disabled:text-slate-300 disabled:cursor-not-allowed"
              >
                Mark all read
              </button>
              <span className="text-slate-300">·</span>
              <button
                onClick={clearNotifications}
                className="text-[13px] font-medium text-slate-400 hover:text-rose-600"
              >
                Clear all
              </button>
            </div>
          ) : undefined
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title="You're all caught up"
          body="Run a match or save a trial — updates will show up here."
          icon={
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
            </svg>
          }
        />
      ) : (
        <div className="space-y-2.5">
          {items.map((n, i) => (
            <div
              key={n.id}
              style={{ animationDelay: `${i * 40}ms` }}
              onClick={() => !n.read && markNotificationRead(n.id)}
              className={
                "card-hover animate-fade-in-up flex items-start gap-3.5 rounded-2xl border p-4 cursor-pointer " +
                (n.read
                  ? "bg-white border-slate-200/80"
                  : "bg-brand-50/40 border-brand-100")
              }
            >
              <KindGlyph kind={n.kind} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-semibold text-slate-900">{n.title}</span>
                  {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />}
                </div>
                <div className="text-[13px] text-slate-600 leading-snug mt-0.5">{n.body}</div>
              </div>
              <span className="text-[11px] text-slate-400 shrink-0">{timeAgo(n.ts)}</span>
            </div>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}

function KindGlyph({ kind }: { kind: NotifKind }) {
  const tone: Record<NotifKind, string> = {
    application: "text-analyzer bg-emerald-50",
    favorite: "text-rose-600 bg-rose-50",
    match: "text-brand-600 bg-brand-50",
    system: "text-slate-500 bg-slate-100",
  };
  const p = {
    width: 16, height: 16, viewBox: "0 0 24 24", fill: "none" as const,
    stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  };
  return (
    <span className={"flex h-9 w-9 items-center justify-center rounded-xl shrink-0 " + tone[kind]}>
      {kind === "application" ? (
        <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6M9 13h6M9 17h6" /></svg>
      ) : kind === "favorite" ? (
        <svg {...p}><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" /></svg>
      ) : kind === "match" ? (
        <svg {...p}><path d="M20 6 9 17l-5-5" /></svg>
      ) : (
        <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" /></svg>
      )}
    </span>
  );
}
