import { useState } from "react";
import type { TrialContact, TrialLocation, TrialResult } from "../types";
import { isApplied, isFavorite, markApplied, toggleFavorite } from "../session";

export default function TrialCard({
  trial,
  index = 0,
  patientId = "",
}: {
  trial: TrialResult;
  index?: number;
  patientId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [fav, setFav] = useState(() => isFavorite(trial.nctId));
  const [applied, setApplied] = useState(() => isApplied(trial.nctId));
  const isMatch = trial.lane === "match";
  const passCount = trial.criteria.filter((c) => c.verdict === "pass").length;

  function onFav() {
    setFav(toggleFavorite(trial, patientId));
  }
  function onApply() {
    markApplied(trial, patientId);
    setApplied(true);
  }

  return (
    <div
      style={{ animationDelay: `${index * 70}ms` }}
      className={
        "card-hover animate-fade-in-up bg-white border rounded-2xl shadow-card overflow-hidden " +
        (isMatch ? "border-emerald-200 ring-1 ring-emerald-100 match-pulse" : "border-slate-200/80")
      }
    >
      <div className="flex">
        {/* Semantic accent rail — emerald only for a real MATCH. */}
        <div className={isMatch ? "w-1.5 bg-analyzer" : "w-1.5 bg-slate-200"} />

        <div className="flex-1 p-6">
          {/* Top row: recruiting + phase on the left, verdict + favorite on the right */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <RecruitingPill />
              {trial.phase && (
                <span className="text-[11px] font-medium text-slate-600 bg-slate-100 rounded-md px-1.5 py-0.5">
                  {trial.phase}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <StatusPill isMatch={isMatch} />
              <FavoriteButton active={fav} onClick={onFav} />
            </div>
          </div>

          {/* Title + id */}
          <div className="mt-3">
            <div className="text-[15px] font-semibold text-slate-900 leading-snug">
              {trial.title}
            </div>
            <div className="mt-0.5 text-xs font-medium text-slate-400">{trial.nctId}</div>
          </div>

          {/* Condition / locations / contact */}
          <div className="mt-3 space-y-1.5 text-[13px]">
            {trial.conditions.length > 0 && (
              <InfoRow icon="tag" label="Condition">
                {trial.conditions.slice(0, 2).join(", ")}
              </InfoRow>
            )}
            {/* Locations from raw ClinicalTrials.gov data */}
            <InfoRow icon="pin" label="Locations">
              {trial.locations && trial.locations.length > 0 ? (
                <LocationList locations={trial.locations} />
              ) : (
                <span className="text-slate-400">Not available</span>
              )}
            </InfoRow>
            {/* Contact from centralContacts */}
            <InfoRow icon="mail" label="Contact">
              {trial.contacts && trial.contacts.length > 0 ? (
                <ContactList contacts={trial.contacts} />
              ) : (
                <span className="text-slate-400">Not available</span>
              )}
            </InfoRow>
          </div>

          <a
            href={trial.detailsUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-brand-600 hover:text-brand-700 hover:underline"
          >
            View full details
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 17 17 7M7 7h10v10" />
            </svg>
          </a>

          {trial.explanation && (
            <p className="mt-3 text-sm text-slate-600 leading-relaxed">{trial.explanation}</p>
          )}

          {/* Show match details */}
          <button
            onClick={() => setOpen((o) => !o)}
            className="mt-4 w-full inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-300 rounded-lg py-2 transition-colors"
          >
            {open ? "Hide match details" : "Show match details"}
            <span className="text-slate-400 font-normal">
              {passCount}/{trial.criteria.length} pass
            </span>
            <svg
              className={"transition-transform duration-200 " + (open ? "rotate-180" : "")}
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>

          {/* Apply: opens the trial on ClinicalTrials.gov in a new tab AND
              records the click locally so it shows up under Applications. */}
          <a
            href={trial.detailsUrl}
            target="_blank"
            rel="noreferrer"
            onClick={onApply}
            className={
              "mt-2 w-full inline-flex items-center justify-center gap-2 text-sm font-semibold rounded-lg py-2.5 transition-colors " +
              (applied
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                : "btn-primary text-white")
            }
          >
            {applied ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                Applied · open trial page
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 17 17 7M9 7h8v8" />
                </svg>
              </>
            ) : (
              <>
                Apply to this trial
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 17 17 7M9 7h8v8" />
                </svg>
              </>
            )}
          </a>
        </div>
      </div>

      {open && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4 space-y-3 animate-fade-in">
          {trial.criteria.map((c) => {
            const pass = c.verdict === "pass";
            return (
              <div key={c.index} className="flex gap-2.5">
                <span
                  className={
                    "shrink-0 mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full " +
                    (pass ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600")
                  }
                  title={c.verdict}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                    {pass ? <path d="M20 6 9 17l-5-5" /> : <path d="M18 6 6 18M6 6l12 12" />}
                  </svg>
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] text-slate-800 leading-snug">
                    {c.text}{" "}
                    <span className="text-[11px] text-slate-400">({c.type})</span>
                  </div>
                  {c.rationale && (
                    <div className="text-xs text-slate-500 mt-0.5 leading-relaxed">{c.rationale}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RecruitingPill() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-0.5">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70 animate-ping" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
      </span>
      Recruiting
    </span>
  );
}

function FavoriteButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={active ? "Remove from favorites" : "Add to favorites"}
      className={
        "flex h-8 w-8 items-center justify-center rounded-full transition-colors " +
        (active ? "text-rose-500 bg-rose-50" : "text-slate-300 hover:text-rose-400 hover:bg-rose-50")
      }
    >
      <svg
        width="18" height="18" viewBox="0 0 24 24"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        className={active ? "animate-pop-in" : ""}
      >
        <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
      </svg>
    </button>
  );
}

function InfoRow({
  icon,
  label,
  children,
}: {
  icon: "tag" | "pin" | "mail";
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 text-slate-600">
      <span className="text-slate-400 mt-0.5 shrink-0">
        <RowIcon name={icon} />
      </span>
      <span className="text-slate-400 w-[68px] shrink-0">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/** Collapsible location list — shows 2 by default, expand to see all. */
function LocationList({ locations }: { locations: TrialLocation[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? locations : locations.slice(0, 2);
  const extra = locations.length - 2;
  return (
    <div className="space-y-0.5">
      {visible.map((loc, i) => (
        <div key={i} className="text-slate-700 leading-snug">
          <span className="font-medium">{loc.display}</span>
          {loc.facility && (
            <span className="text-slate-400 text-[11px] ml-1">— {loc.facility}</span>
          )}
          {loc.status === "RECRUITING" && (
            <span className="ml-1.5 inline-flex items-center text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1 py-0.5">
              Recruiting
            </span>
          )}
        </div>
      ))}
      {!expanded && extra > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="text-brand-600 text-[12px] font-medium hover:text-brand-700"
        >
          +{extra} more location{extra !== 1 ? "s" : ""}
        </button>
      )}
    </div>
  );
}

/** Contact block: name + phone + email. */
function ContactList({ contacts }: { contacts: TrialContact[] }) {
  return (
    <div className="space-y-1.5">
      {contacts.map((c, i) => (
        <div key={i} className="text-slate-700 leading-snug">
          <div className="font-medium">{c.name}</div>
          {c.phone && (
            <a
              href={`tel:${c.phone.replace(/\s/g, "")}`}
              className="text-slate-500 text-[12px] hover:text-brand-600 block"
            >
              {c.phone}
            </a>
          )}
          {c.email && (
            <a
              href={`mailto:${c.email}`}
              className="text-brand-600 text-[12px] hover:text-brand-700 hover:underline block truncate max-w-[220px]"
            >
              {c.email}
            </a>
          )}
        </div>
      ))}
    </div>
  );
}

function RowIcon({ name }: { name: "tag" | "pin" | "mail" }) {
  const p = {
    width: 13, height: 13, viewBox: "0 0 24 24", fill: "none" as const,
    stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  };
  if (name === "tag")
    return (
      <svg {...p}>
        <path d="M12 2H2v10l9.3 9.3a2 2 0 0 0 2.8 0l7.2-7.2a2 2 0 0 0 0-2.8L12 2Z" />
        <circle cx="6.5" cy="6.5" r="1" />
      </svg>
    );
  if (name === "pin")
    return (
      <svg {...p}>
        <path d="M12 22s7-7.5 7-13a7 7 0 0 0-14 0c0 5.5 7 13 7 13Z" />
        <circle cx="12" cy="9" r="2.5" />
      </svg>
    );
  return (
    <svg {...p}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m2 6 10 7 10-7" />
    </svg>
  );
}

function StatusPill({ isMatch }: { isMatch: boolean }) {
  return (
    <span
      className={
        "shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full " +
        (isMatch ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")
      }
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
        {isMatch ? <path d="M20 6 9 17l-5-5" /> : <path d="M18 6 6 18M6 6l12 12" />}
      </svg>
      {isMatch ? "MATCH" : "NO MATCH"}
    </span>
  );
}

export function TrialSkeleton({ index = 0 }: { index?: number }) {
  return (
    <div
      style={{ animationDelay: `${index * 90}ms` }}
      className="trace-border animate-fade-in-up shadow-card overflow-hidden"
    >
      <div className="flex">
        <div className="w-1.5 bg-slate-100" />
        <div className="flex-1 p-6">
          {/* Top row — pills on the left, status pill placeholder on the right */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="h-5 w-20 rounded-md skeleton-shimmer" />
              <div className="h-5 w-14 rounded-md skeleton-shimmer" />
            </div>
            <div className="h-7 w-24 rounded-full skeleton-shimmer shrink-0" />
          </div>

          {/* Title + id */}
          <div className="mt-4 h-4 w-4/5 rounded skeleton-shimmer" />
          <div className="mt-2 h-3 w-24 rounded skeleton-shimmer" />

          {/* Three info rows (Condition / Locations / Contact) */}
          <div className="mt-4 space-y-2">
            <div className="h-3 w-3/4 rounded skeleton-shimmer" />
            <div className="h-3 w-2/3 rounded skeleton-shimmer" />
            <div className="h-3 w-1/2 rounded skeleton-shimmer" />
          </div>

          {/* Buttons row */}
          <div className="mt-5 space-y-2">
            <div className="h-9 w-full rounded-lg skeleton-shimmer" />
            <div className="h-10 w-full rounded-lg skeleton-shimmer opacity-80" />
          </div>
        </div>
      </div>
    </div>
  );
}
