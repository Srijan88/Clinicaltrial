import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getPatients } from "../api";
import {
  appliedCount,
  favoritesCount,
  getClinicianId,
  getClinicianName,
  getMode,
  notificationsCount,
  onStatsChange,
  runHistoryCount,
  setMode,
} from "../session";
import type { PatientHeadline, RunMode } from "../types";
import PatientCard from "../components/PatientCard";
import CountUp from "../components/CountUp";
import DashboardLayout from "../components/DashboardLayout";

export default function Patients() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<PatientHeadline[]>([]);
  const [mode, setModeState] = useState<RunMode>(getMode());
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [quickId, setQuickId] = useState("");
  const clinicianName = getClinicianName();

  useEffect(() => {
    if (!getClinicianId()) {
      navigate("/login");
      return;
    }
    getPatients()
      .then((p) => {
        setPatients(p);
        setLoaded(true);
      })
      .catch((e) => setError(String(e)));
  }, [navigate]);

  function toggleMode(m: RunMode) {
    setMode(m);
    setModeState(m);
  }
  function quickSearch() {
    const id = quickId.trim().toUpperCase();
    if (!id) {
      // Empty — focus the input so the user knows to type something
      document.querySelector<HTMLInputElement>('input[placeholder*="Patient ID"]')?.focus();
      return;
    }
    const known = patients.find((p) => p.patientId.toUpperCase() === id);
    navigate(`/match/${known ? known.patientId : id}`);
  }

  const firstName =
    clinicianName.replace(/^Dr\.?\s*/i, "").split(" ").slice(-1)[0] || clinicianName;
  const greeting = useMemo(() => timeGreeting(), []);

  return (
    <DashboardLayout>
      {/* ---------- Hero ---------- */}
      <header className="animate-fade-in-up">
        <div className="flex items-center gap-2 text-[12px] font-medium text-slate-400">
          <span>{greeting.emojiless}</span>
          <span className="text-slate-300">·</span>
          <span>{todayLabel()}</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-slate-900">
            {greeting.hello},{" "}
            <span className="bg-gradient-to-r from-brand-600 to-analyzer bg-clip-text text-transparent">
              {firstName}
            </span>
          </h1>
          <EngineStatus ok={loaded} mode={mode} />
        </div>
        <p className="mt-0.5 text-[14px] text-slate-500">Your trial-matching workspace.</p>
      </header>

      {/* ---------- Metric strip ---------- */}
      <div className="mt-6">
        <MetricStrip />
      </div>

      {/* ---------- Command search ---------- */}
      <section className="mt-5">
        <CommandSearch
          value={quickId}
          onChange={setQuickId}
          onSubmit={quickSearch}
          mode={mode}
          onMode={toggleMode}
          patients={patients}
          onSelect={(id) => navigate(`/match/${id}`)}
        />
      </section>

      {/* ---------- Roster ---------- */}
      <section className="mt-8">
        <div className="flex items-end justify-between mb-4">
          <div>
            <h2 className="text-[16px] font-semibold tracking-tight text-slate-900">Patient roster</h2>
            <p className="text-[12.5px] text-slate-500 mt-0.5">
              Select a patient to run a live match against recruiting trials.
            </p>
          </div>
          <span className="text-[11px] font-medium text-slate-400 tabular-nums">
            {patients.length} {patients.length === 1 ? "patient" : "patients"}
          </span>
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-5">
          {patients.map((p, i) => (
            <PatientCard
              key={p.patientId}
              patient={p}
              index={i}
              onSelect={() => navigate(`/match/${p.patientId}`)}
            />
          ))}
        </div>
      </section>
    </DashboardLayout>
  );
}

/* ============================ metric strip ============================ */

function MetricStrip() {
  const navigate = useNavigate();
  const [s, setS] = useState(readStats);
  useEffect(() => onStatsChange(() => setS(readStats())), []);

  function goPreviousRuns() {
    navigate("/runs");
  }

  const metrics: {
    label: string;
    value: number;
    icon: MetricIcon;
    tint: string;
    onClick: () => void;
  }[] = [
    { label: "Previous runs", value: s.searches, icon: "search", tint: "text-brand-600 bg-brand-50", onClick: goPreviousRuns },
    { label: "Favorites", value: s.favorites, icon: "heart", tint: "text-rose-600 bg-rose-50", onClick: () => navigate("/favorites") },
    { label: "Applications", value: s.applied, icon: "send", tint: "text-analyzer bg-emerald-50", onClick: () => navigate("/applications") },
    { label: "Notifications", value: s.notif, icon: "bell", tint: "text-amber-600 bg-amber-50", onClick: () => navigate("/notifications") },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {metrics.map((m) => (
        <button
          key={m.label}
          onClick={m.onClick}
          className="group card-hover text-left bg-white border border-slate-200/80 rounded-xl shadow-card px-3.5 py-3"
        >
          <div className="flex items-center justify-between">
            <span className={"flex h-8 w-8 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110 " + m.tint}>
              <MetricGlyph name={m.icon} />
            </span>
            <span className="text-[24px] font-bold tracking-tight text-slate-900 leading-none tabular-nums">
              <CountUp value={m.value} />
            </span>
          </div>
          <div className="mt-2.5 flex items-center justify-between">
            <span className="text-[12px] font-medium text-slate-500">{m.label}</span>
            <svg
              className="text-slate-300 -translate-x-1 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 group-hover:text-brand-500 transition-all duration-200"
              width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </div>
        </button>
      ))}
    </div>
  );
}

function readStats() {
  return {
    searches: runHistoryCount(),
    favorites: favoritesCount(),
    applied: appliedCount(),
    notif: notificationsCount(),
  };
}

/* ============================ command search ============================ */

function CommandSearch({
  value,
  onChange,
  onSubmit,
  mode,
  onMode,
  patients,
  onSelect,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  mode: RunMode;
  onMode: (m: RunMode) => void;
  patients: PatientHeadline[];
  onSelect: (id: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = value.trim().toUpperCase();

  // Fuzzy match: filter by id, subtype, or diagnosis prefix
  const suggestions = useMemo<PatientHeadline[]>(() => {
    if (!trimmed) return [];
    return patients.filter(
      (p) =>
        p.patientId.toUpperCase().includes(trimmed) ||
        (p.subtype || "").toUpperCase().includes(trimmed) ||
        (p.diagnosis || "").toUpperCase().includes(trimmed)
    );
  }, [trimmed, patients]);

  const showDropdown = focused && suggestions.length > 0;

  // Keep highlight in bounds
  useEffect(() => setHighlightIdx(0), [suggestions.length]);

  function handleKey(e: React.KeyboardEvent) {
    if (!showDropdown) {
      if (e.key === "Enter") onSubmit();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      onSelect(suggestions[highlightIdx].patientId);
    } else if (e.key === "Escape") {
      onChange("");
      inputRef.current?.blur();
    }
  }

  return (
    <div className="relative">
      {/* Input bar */}
      <div
        className={
          "bg-white border rounded-2xl shadow-card p-2 pl-4 flex flex-col sm:flex-row sm:items-center gap-3 transition-[border-color,box-shadow] duration-200 " +
          (focused ? "border-brand-300 ring-4 ring-brand-100 rounded-b-none rounded-t-2xl" : "border-slate-200/80") +
          (showDropdown ? " rounded-b-none border-b-transparent" : "")
        }
      >
        {/* search icon */}
        <span className="hidden sm:flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-slate-400 shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </span>

        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          onKeyDown={handleKey}
          placeholder="Find trials by Patient ID…"
          autoComplete="off"
          spellCheck={false}
          className="flex-1 bg-transparent outline-none text-[15px] text-slate-800 placeholder:text-slate-400 py-2"
        />

        {trimmed === "" && (
          <kbd className="hidden sm:inline-flex items-center text-[11px] font-medium text-slate-400 bg-slate-100 border border-slate-200 rounded-md px-1.5 py-0.5">
            ↑↓ to navigate
          </kbd>
        )}

        <Segmented mode={mode} onMode={onMode} />

        <button
          onClick={onSubmit}
          className="btn-primary inline-flex items-center justify-center gap-2 text-white text-sm font-semibold rounded-xl px-5 py-2.5 shrink-0"
        >
          Search
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute left-0 right-0 z-50 bg-white border border-brand-300 border-t-0 ring-4 ring-brand-100 rounded-b-2xl shadow-lift overflow-hidden animate-fade-in">
          {/* Hint strip */}
          <div className="px-4 py-2 bg-white border-b border-slate-100 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              {suggestions.length} patient{suggestions.length !== 1 ? "s" : ""} found — click to go straight to matching
            </span>
            <span className="text-[10px] text-slate-300">esc to close</span>
          </div>

          <div className="bg-white divide-y divide-slate-50">
            {suggestions.map((p, i) => (
              <button
                key={p.patientId}
                onMouseDown={() => onSelect(p.patientId)}
                onMouseEnter={() => setHighlightIdx(i)}
                className={
                  "w-full bg-white flex items-center gap-4 px-4 py-3.5 text-left transition-colors " +
                  (i === highlightIdx ? "bg-brand-50" : "hover:bg-slate-50")
                }
              >
                {/* mini avatar */}
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white text-[12px] font-bold shadow-sm shrink-0">
                  {p.patientId.replace(/\D/g, "") || p.patientId.slice(0, 2).toUpperCase()}
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-[14px] text-slate-900">{p.patientId}</span>
                    <span className="text-[10px] font-semibold tracking-wide uppercase px-1.5 py-0.5 rounded-md bg-slate-900 text-white">
                      Stage {p.stage}
                    </span>
                    <span className="text-[11px] font-semibold text-brand-700 bg-brand-50 border border-brand-100 rounded-full px-2 py-0.5">
                      {p.subtype}
                    </span>
                  </div>
                  <div className="text-[12px] text-slate-500 truncate mt-0.5">{p.diagnosis}</div>
                </div>

                {/* quick stats */}
                <div className="flex items-center gap-2 shrink-0 text-[11px]">
                  <ECOGMini value={p.ecog} />
                  {p.brainMets && (
                    <span className="font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-1.5 py-0.5">
                      B+
                    </span>
                  )}
                </div>

                {/* arrow */}
                <span
                  className={
                    "shrink-0 flex h-7 w-7 items-center justify-center rounded-full transition-colors " +
                    (i === highlightIdx ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-400")
                  }
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </span>
              </button>
            ))}
          </div>

          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100">
            <span className="text-[11px] text-slate-400">
              Selecting a patient goes directly to the trial matching view.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function ECOGMini({ value }: { value: number }) {
  const colour = value <= 1 ? "bg-emerald-500" : value === 2 ? "bg-amber-500" : "bg-rose-500";
  return (
    <span className="flex items-center gap-0.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={"h-2 w-1 rounded-sm " + (i <= value ? colour : "bg-slate-200")} />
      ))}
    </span>
  );
}

function Segmented({ mode, onMode }: { mode: RunMode; onMode: (m: RunMode) => void }) {
  return (
    <div
      className="inline-flex p-1 bg-slate-100 rounded-xl text-[13px] shrink-0"
      title={mode === "live" ? "Live: real agents (1–3 min)" : "Demo: cached replay (~30s)"}
    >
      {(["live", "demo"] as RunMode[]).map((m) => (
        <button
          key={m}
          onClick={() => onMode(m)}
          className={
            "px-3 py-1.5 rounded-lg capitalize font-medium transition-colors duration-200 " +
            (mode === m ? "bg-white text-brand-700 shadow-sm" : "text-slate-500 hover:text-slate-700")
          }
        >
          {m}
        </button>
      ))}
    </div>
  );
}

/* ============================ engine status ============================ */

function EngineStatus({ ok, mode }: { ok: boolean; mode: RunMode }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 text-[12px] font-semibold rounded-full px-2.5 py-0.5 border " +
        (ok
          ? "text-emerald-700 bg-emerald-50 border-emerald-200"
          : "text-slate-500 bg-slate-50 border-slate-200")
      }
    >
      <span className="relative flex h-2 w-2">
        {ok && <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70 animate-ping" />}
        <span className={"relative inline-flex h-2 w-2 rounded-full " + (ok ? "bg-emerald-500" : "bg-slate-400")} />
      </span>
      {ok ? `Engine ready · ${mode}` : "Connecting…"}
    </span>
  );
}

/* ============================== helpers =============================== */

function timeGreeting(): { hello: string; emojiless: string } {
  const h = new Date().getHours();
  if (h < 12) return { hello: "Good morning", emojiless: "Morning" };
  if (h < 17) return { hello: "Good afternoon", emojiless: "Afternoon" };
  return { hello: "Good evening", emojiless: "Evening" };
}
function todayLabel(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

type MetricIcon = "search" | "heart" | "send" | "bell";

function MetricGlyph({ name }: { name: MetricIcon }) {
  const p = {
    width: 18, height: 18, viewBox: "0 0 24 24", fill: "none" as const,
    stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "search":
      return (
        <svg {...p}>
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      );
    case "heart":
      return (
        <svg {...p}>
          <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
        </svg>
      );
    case "send":
      return (
        <svg {...p}>
          <path d="m22 2-7 20-4-9-9-4Z" />
          <path d="M22 2 11 13" />
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
