import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Wordmark } from "./Brand";
import {
  appliedCount,
  favoritesCount,
  getClinicianId,
  getClinicianName,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notificationsCount,
  onStatsChange,
  savedSearchesCount,
  type NotifKind,
  type Notification,
} from "../session";

/** Shared shell for all dashboard pages: sticky glass header (with a live
 * notification bell + preview popover) and a routed left nav with live counts.
 * Keeps Login/Match untouched. */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const clinicianName = getClinicianName();

  useEffect(() => {
    if (!getClinicianId()) navigate("/login");
  }, [navigate]);

  return (
    <div className="min-h-full">
      <Header clinicianName={clinicianName} />
      <div className="max-w-[1480px] mx-auto px-5 lg:px-8 py-7 flex gap-7">
        <SideNav />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}

/* ============================== side nav ============================== */

type NavIconName = "grid" | "doc" | "heart" | "bookmark" | "bell";

function SideNav() {
  const navigate = useNavigate();
  const [c, setC] = useState(readCounts);
  useEffect(() => onStatsChange(() => setC(readCounts())), []);

  const items: { to: string; label: string; icon: NavIconName; badge?: number }[] = [
    { to: "/patients", label: "Dashboard", icon: "grid" },
    { to: "/applications", label: "Applications", icon: "doc", badge: c.applied || undefined },
    { to: "/favorites", label: "Favorites", icon: "heart", badge: c.fav || undefined },
    { to: "/saved", label: "Saved", icon: "bookmark", badge: c.saved || undefined },
    { to: "/notifications", label: "Notifications", icon: "bell", badge: c.notif || undefined },
  ];

  return (
    <aside className="hidden lg:block w-[228px] shrink-0">
      <div className="sticky top-[76px] space-y-4">
        <nav className="space-y-0.5">
          {items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              className={({ isActive }) =>
                "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors duration-150 " +
                (isActive
                  ? "text-slate-900"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-100/70")
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute inset-0 rounded-lg bg-brand-50" aria-hidden />}
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-1 rounded-full bg-brand-600" aria-hidden />
                  )}
                  <span className="relative">
                    <NavIcon name={it.icon} active={isActive} />
                  </span>
                  <span className="relative flex-1">{it.label}</span>
                  {it.badge != null && (
                    <span
                      className={
                        "relative text-[10px] font-bold rounded-full min-w-[17px] h-[17px] px-1 inline-flex items-center justify-center " +
                        (it.icon === "bell" ? "text-white bg-amber-500" : "text-white bg-brand-600")
                      }
                    >
                      {it.badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Live engine / agents card */}
        <EngineCard />

        {/* Vibrant quick-action card */}
        <button
          onClick={() => navigate("/patients")}
          className="group relative block w-full overflow-hidden rounded-2xl p-4 text-left text-white shadow-lift"
          style={{
            backgroundImage:
              "linear-gradient(135deg, #2563eb 0%, #1e40af 50%, #059669 140%)",
          }}
        >
          {/* sheen */}
          <span className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-white/15 blur-xl" />
          <span className="pointer-events-none absolute -left-4 bottom-0 h-16 w-16 rounded-full bg-white/10 blur-lg" />
          <div className="relative">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 backdrop-blur">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
              </svg>
            </div>
            <div className="mt-3 text-[14px] font-semibold leading-tight">Start a new match</div>
            <div className="mt-0.5 text-[12px] text-white/75 leading-snug">
              Pick a patient and watch the agents work in real time.
            </div>
            <div className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-semibold">
              Go to roster
              <svg className="transition-transform duration-200 group-hover:translate-x-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </div>
          </div>
        </button>

        <div className="px-1 text-[11px] leading-relaxed text-slate-400">
          Synthetic data · No PHI
        </div>
      </div>
    </aside>
  );
}

/** Compact live status card for the sidebar — engine + the four agents. Reads
 * as "alive" without claiming false precision (membership ≠ process online). */
function EngineCard() {
  const agents = [
    { label: "Intake", color: "bg-intake" },
    { label: "Discovery", color: "bg-discoverer" },
    { label: "Eligibility", color: "bg-parser" },
    { label: "Analysis", color: "bg-analyzer" },
  ];
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold text-slate-700">Matching engine</span>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Online
        </span>
      </div>
      <div className="mt-3 space-y-1.5">
        {agents.map((a) => (
          <div key={a.label} className="flex items-center gap-2 text-[12px] text-slate-500">
            <span className={"h-1.5 w-1.5 rounded-full " + a.color} />
            <span className="flex-1">{a.label} agent</span>
            <span className="text-[10px] text-slate-400">ready</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function readCounts() {
  return {
    applied: appliedCount(),
    fav: favoritesCount(),
    saved: savedSearchesCount(),
    notif: notificationsCount(),
  };
}

/* =============================== header =============================== */

export function Header({ clinicianName }: { clinicianName: string }) {
  const initials = clinicianName
    .replace(/^Dr\.?\s*/i, "")
    .split(" ")
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="bg-white/80 backdrop-blur-xl border-b border-slate-200/70 sticky top-0 z-30">
      <div className="max-w-[1480px] mx-auto px-5 lg:px-8 h-[60px] flex items-center justify-between">
        <NavLink to="/patients" className="transition-opacity hover:opacity-80">
          <Wordmark size={28} />
        </NavLink>
        <div className="flex items-center gap-1.5">
          <NotificationBell />
          <span className="mx-1.5 h-5 w-px bg-slate-200" />
          <span className="text-[13px] font-medium text-slate-600 hidden sm:inline">
            {clinicianName}
          </span>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-[11px] font-semibold text-white shadow-sm">
            {initials || "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ========================== notification bell ========================= */

function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>(getNotifications);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => onStatsChange(() => setItems(getNotifications())), []);

  const unread = items.filter((n) => !n.read).length;
  const recent = items.slice(0, 5);

  function openNow() {
    if (timer.current) window.clearTimeout(timer.current);
    setOpen(true);
  }
  function closeSoon() {
    timer.current = window.setTimeout(() => setOpen(false), 140);
  }

  return (
    <div className="relative" onMouseEnter={openNow} onMouseLeave={closeSoon}>
      <button
        onClick={() => navigate("/notifications")}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
        aria-label="Notifications"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white ring-2 ring-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-[340px] origin-top-right animate-scale-in bg-white border border-slate-200/80 rounded-2xl shadow-lift overflow-hidden z-50"
          onMouseEnter={openNow}
          onMouseLeave={closeSoon}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold text-slate-900">Notifications</span>
              {unread > 0 && (
                <span className="text-[10px] font-bold text-white bg-amber-500 rounded-full px-1.5 py-0.5">
                  {unread} new
                </span>
              )}
            </div>
            {unread > 0 && (
              <button
                onClick={() => markAllNotificationsRead()}
                className="text-[12px] font-medium text-brand-600 hover:text-brand-700"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          {recent.length === 0 ? (
            <div className="px-4 py-8 text-center text-[13px] text-slate-400">
              You're all caught up.
            </div>
          ) : (
            <div className="max-h-[320px] overflow-y-auto divide-y divide-slate-50">
              {recent.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.read) markNotificationRead(n.id);
                    navigate("/notifications");
                  }}
                  className={
                    "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors " +
                    (n.read ? "hover:bg-slate-50" : "bg-brand-50/40 hover:bg-brand-50/70")
                  }
                >
                  <KindGlyph kind={n.kind} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-semibold text-slate-900 truncate">
                        {n.title}
                      </span>
                      {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-brand-500 shrink-0" />}
                    </div>
                    <div className="text-[12px] text-slate-500 leading-snug line-clamp-2">{n.body}</div>
                  </div>
                  <span className="text-[10px] text-slate-400 shrink-0 mt-0.5">{relTime(n.ts)}</span>
                </button>
              ))}
            </div>
          )}

          {/* Footer */}
          <button
            onClick={() => navigate("/notifications")}
            className="w-full text-center text-[12.5px] font-medium text-brand-600 hover:text-brand-700 hover:bg-slate-50 py-2.5 border-t border-slate-100 transition-colors"
          >
            View all notifications
          </button>
        </div>
      )}
    </div>
  );
}

function relTime(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return "now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

function KindGlyph({ kind }: { kind: NotifKind }) {
  const tone: Record<NotifKind, string> = {
    application: "text-analyzer bg-emerald-50",
    favorite: "text-rose-600 bg-rose-50",
    match: "text-brand-600 bg-brand-50",
    system: "text-slate-500 bg-slate-100",
  };
  const p = {
    width: 14, height: 14, viewBox: "0 0 24 24", fill: "none" as const,
    stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  };
  return (
    <span className={"flex h-8 w-8 items-center justify-center rounded-lg shrink-0 " + tone[kind]}>
      {kind === "application" ? (
        <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /></svg>
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

/* ============================== nav icons ============================== */

function NavIcon({ name, active }: { name: NavIconName; active?: boolean }) {
  const p = {
    width: 17, height: 17, viewBox: "0 0 24 24", fill: "none" as const,
    stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
    className: active ? "text-brand-600" : "text-slate-400 group-hover:text-slate-600 transition-colors",
  };
  switch (name) {
    case "grid":
      return (
        <svg {...p}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "doc":
      return (
        <svg {...p}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
          <path d="M14 2v6h6M9 13h6M9 17h6" />
        </svg>
      );
    case "heart":
      return (
        <svg {...p}>
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
        </svg>
      );
    case "bookmark":
      return (
        <svg {...p}>
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z" />
        </svg>
      );
    case "bell":
      return (
        <svg {...p}>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
      );
  }
}
