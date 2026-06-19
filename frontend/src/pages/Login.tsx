import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getClinicians } from "../api";
import { setClinician } from "../session";
import type { Clinician } from "../types";
import { Logo } from "../components/Brand";

/** Landing-page-only brand mark: the dark 3D cross-on-hand render. Kept local
 * to this page on purpose — the shared <Logo> (used elsewhere + favicon) is
 * unchanged. */
function LandingLogo({ size = 36 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center overflow-hidden rounded-xl ring-1 ring-white/20 shadow-sm"
      style={{ width: size, height: size }}
      aria-label="ClinicalTrials"
    >
      <img
        src="/landing-logo.png"
        alt=""
        className="h-full w-full object-cover"
        draggable={false}
      />
    </span>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const [clinicians, setClinicians] = useState<Clinician[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getClinicians()
      .then((c) => {
        setClinicians(c);
        if (c.length) setSelected(c[0].clinicianId);
      })
      .catch((e) => setError(String(e)));
  }, []);

  function signIn() {
    const c = clinicians.find((x) => x.clinicianId === selected);
    if (!c) return;
    setClinician(c.clinicianId, c.name);
    navigate("/patients");
  }

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden text-white">
      <AuroraBackdrop />

      {/* foreground shell */}
      <div className="relative z-10 flex min-h-[100dvh] flex-col">
        <TopNav />

        <main className="relative flex flex-1 items-center justify-center px-4 py-3 sm:px-6">
          {/* framing glass chips — decorative, never crowd the card, desktop only */}
          <FramingChips />

          {/* centered focal sign-in */}
          <div className="relative w-full max-w-[400px]">
            <div className="mb-4 flex justify-center animate-fade-in-up">
              <div
                className="halo-breathe pill-pan relative inline-flex max-w-full items-center gap-2.5 rounded-full px-4 py-2.5 ring-1 ring-white/25 backdrop-blur-md sm:gap-3 sm:px-5 sm:py-3"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, rgba(56,189,248,0.22), rgba(255,255,255,0.10) 50%, rgba(16,185,129,0.22))",
                }}
              >
                {/* Live indicator — emerald dot with a slow ping. */}
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75 animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" />
                </span>

                {/* Headline — soft sheen travels through the text. */}
                <span className="text-shine whitespace-nowrap text-[13px] font-semibold tracking-tight sm:text-[15px]">
                  Agentic clinical trial matching
                </span>

                {/* Four agent dots fire in sequence to dramatize the pipeline.
                    Hidden on very small screens to keep the pill from wrapping. */}
                <span className="hidden items-center gap-1 border-l border-white/20 pl-3 sm:flex">
                  {[
                    "bg-blue-300",
                    "bg-violet-300",
                    "bg-cyan-300",
                    "bg-emerald-300",
                  ].map((c, i) => (
                    <span
                      key={i}
                      className={"h-1.5 w-1.5 rounded-full " + c}
                      style={{
                        animation: `seq-pulse 1.6s var(--ease-in-out) ${i * 0.18}s infinite`,
                      }}
                    />
                  ))}
                </span>
              </div>
            </div>

            <SignInCard
              clinicians={clinicians}
              selected={selected}
              setSelected={setSelected}
              error={error}
              signIn={signIn}
            />
          </div>
        </main>

        <PipelineRail />
      </div>
    </div>
  );
}

/* ============================ sign-in card ============================ */
function SignInCard({
  clinicians,
  selected,
  setSelected,
  error,
  signIn,
}: {
  clinicians: Clinician[];
  selected: string;
  setSelected: (v: string) => void;
  error: string;
  signIn: () => void;
}) {
  return (
    <div className="relative animate-fade-in-up [animation-delay:60ms]">
      {/* soft accent halo behind the card */}
      <div
        className="pointer-events-none absolute -inset-px rounded-[26px] opacity-70 blur-xl"
        style={{
          background:
            "linear-gradient(135deg, rgba(56,189,248,0.35), rgba(16,185,129,0.25))",
        }}
      />
      <div className="relative overflow-hidden rounded-2xl bg-white/95 p-5 shadow-[0_30px_80px_-24px_rgba(2,12,40,0.7)] ring-1 ring-white/50 backdrop-blur-xl sm:rounded-3xl sm:p-6">
        {/* gradient accent edge at the top */}
        <span
          className="absolute inset-x-0 top-0 h-[3px]"
          style={{
            background:
              "linear-gradient(90deg, #38bdf8, #2563eb 45%, #10b981)",
          }}
        />

        <div className="flex items-center gap-2.5">
          <Logo size={34} />
          <span className="font-semibold tracking-tight text-slate-900">
            Clinical<span className="text-brand-600">Trials</span>
          </span>
        </div>

        <h1 className="mt-4 text-[22px] font-semibold tracking-tight text-slate-900">
          Welcome back
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">
          Sign in to your trial-matching workspace.
        </p>

        {error && (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            Could not reach the API. Is the backend running on :8000?
          </div>
        )}

        <label className="mb-1.5 mt-5 block text-[13px] font-medium text-slate-700">
          Continue as
        </label>
        <div className="relative">
          <select
            className="w-full appearance-none rounded-lg border border-slate-300 bg-white py-2.5 pl-3 pr-9 text-sm text-slate-800 outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {clinicians.map((c) => (
              <option key={c.clinicianId} value={c.clinicianId}>
                {c.name} — {c.role}, {c.site}
              </option>
            ))}
          </select>
          <svg
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Predefined clinician accounts.
        </p>

        <button
          onClick={signIn}
          disabled={!selected}
          className="btn-primary mt-5 w-full rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Enter workspace
        </button>

        <div className="mt-4 flex items-center gap-3 text-[11px] text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          <span>secured · synthetic data · no PHI</span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>
      </div>
    </div>
  );
}

/* ============================ top navigation ============================ */
function TopNav() {
  return (
    <header className="flex items-center justify-between px-4 py-4 sm:px-10 animate-fade-in-up">
      <div className="flex items-center gap-2.5">
        <LandingLogo size={36} />
        <span className="text-[17px] font-semibold tracking-tight">ClinicalTrials</span>
      </div>
      <div className="flex items-center gap-2.5">
        <span className="hidden items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[12px] font-medium text-white/75 ring-1 ring-white/15 backdrop-blur sm:inline-flex">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" />
          </svg>
          Real trials · ClinicalTrials.gov
        </span>
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-400/15 px-3 py-1 text-[12px] font-medium text-emerald-100 ring-1 ring-emerald-300/25 backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
          Live demo
        </span>
      </div>
    </header>
  );
}

/* ===================== framing glass info chips ===================== */
/* Absolutely positioned around the centered card so they enrich the page
   without adding vertical height. Hidden under lg to keep mobile clean. */
function FramingChips() {
  return (
    <div className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden>
      <GlassChip side="left" className="left-[7%] top-[26%] chip-float [animation-delay:0s]" delay="120ms">
        <div className="flex items-center gap-3">
          <ProviderBadges />
          <div>
            <div className="text-[18px] font-bold leading-none">4 agents</div>
            <div className="mt-1 text-[11px] text-white/65">3× Featherless · 1× AI/ML</div>
          </div>
        </div>
      </GlassChip>

      <GlassChip side="left" className="left-[7%] bottom-[22%] chip-float [animation-delay:1.5s]" delay="220ms">
        <div className="text-[18px] font-bold leading-none">100%</div>
        <div className="mt-1 text-[11px] text-white/65">deterministic verdicts</div>
      </GlassChip>

      <GlassChip side="right" className="right-[7%] top-[26%] chip-float [animation-delay:0.8s]" delay="180ms">
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          <span className="h-2 w-2 rounded-full bg-emerald-300" />
          Stage IV matching
        </div>
        <div className="mt-1 text-[11px] text-white/65">metastatic breast cancer</div>
      </GlassChip>

      <GlassChip side="right" className="right-[7%] bottom-[22%] chip-float [animation-delay:2.2s]" delay="280ms">
        <div className="text-[13px] font-semibold">Every run reproducible</div>
        <div className="mt-1 text-[11px] text-white/65">auditable rationale trail</div>
      </GlassChip>
    </div>
  );
}

function GlassChip({
  children,
  className = "",
  delay = "0ms",
  side = "left",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: string;
  side?: "left" | "right";
}) {
  return (
    <div className={"absolute " + className}>
      <div
        className="rise-in relative rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/15 backdrop-blur-md shadow-[0_18px_40px_-20px_rgba(0,0,0,0.5)]"
        style={{ animationDelay: delay }}
      >
        <ChipConnector side={side} />
        {children}
      </div>
    </div>
  );
}

/* A visible line that connects each floating chip to the central login card.
   The line runs long enough that its center end tucks under the card (so it
   reads as attached to the card), and a packet of light flows OUTWARD from the
   card to the chip. The pulsing pointer node sits at the chip edge. */
function ChipConnector({ side }: { side: "left" | "right" }) {
  const isLeft = side === "left";
  return (
    <span
      className={
        "pointer-events-none absolute top-1/2 hidden h-[2px] w-[clamp(120px,22vw,260px)] -translate-y-1/2 lg:block " +
        (isLeft ? "left-full" : "right-full")
      }
    >
      {/* the connecting line — brightest at the card (center) end */}
      <span
        className={
          "absolute inset-0 rounded-full " +
          (isLeft
            ? "bg-gradient-to-r from-sky-300/40 via-sky-300/60 to-sky-200/85"
            : "bg-gradient-to-l from-sky-300/40 via-sky-300/60 to-sky-200/85")
        }
      />
      {/* pulsing pointer node anchored at the chip edge */}
      <span
        className={
          "absolute top-1/2 flex h-3 w-3 -translate-y-1/2 items-center justify-center " +
          (isLeft ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2")
        }
      >
        <span className="absolute h-3 w-3 rounded-full bg-sky-300/55 animate-ping" />
        <span className="relative h-2 w-2 rounded-full bg-sky-200 shadow-[0_0_8px_2px_rgba(125,211,252,0.8)]" />
      </span>
      {/* packet of light flowing OUT from the card toward the chip */}
      <span
        className={
          "absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-white shadow-[0_0_8px_2px_rgba(255,255,255,0.85)] " +
          (isLeft ? "flow-left" : "flow-right")
        }
      />
    </span>
  );
}

/* The four agents shown as their model providers: three Featherless (intake,
   discoverer, parser) + one AI/ML API (analyzer), matching agent_config.yaml. */
function ProviderBadges() {
  return (
    <div className="flex -space-x-2">
      <ProviderMark kind="featherless" z={4} />
      <ProviderMark kind="featherless" z={3} />
      <ProviderMark kind="featherless" z={2} />
      <ProviderMark kind="aiml" z={1} />
    </div>
  );
}

function ProviderMark({
  kind,
  z = 0,
}: {
  kind: "featherless" | "aiml";
  z?: number;
}) {
  const isF = kind === "featherless";
  return (
    <span
      title={isF ? "Featherless · Qwen2.5-32B" : "AI/ML API · gpt-4o-mini"}
      style={{ zIndex: z }}
      className={
        "relative flex h-7 w-7 items-center justify-center rounded-lg shadow-sm ring-2 ring-[#152353] " +
        (isF
          ? "bg-gradient-to-br from-indigo-400 to-sky-500 text-white"
          : "bg-gradient-to-br from-emerald-400 to-teal-500 text-white")
      }
    >
      {isF ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z" />
          <path d="M16 8 2 22" />
          <path d="M17.5 15H9" />
        </svg>
      ) : (
        <span className="text-[9px] font-extrabold leading-none tracking-tight">AI</span>
      )}
    </span>
  );
}

/* ===================== bottom agent pipeline rail ===================== */
function PipelineRail() {
  const agents = [
    { label: "Intake", dot: "bg-blue-300" },
    { label: "Discovery", dot: "bg-violet-300" },
    { label: "Eligibility", dot: "bg-cyan-300" },
    { label: "Analysis", dot: "bg-emerald-300" },
  ];
  return (
    <footer className="relative z-10 px-4 pb-5 pt-1 animate-fade-in-up [animation-delay:120ms] sm:px-6">
      <div className="mx-auto max-w-[460px]">
        <div className="relative">
          {/* base track — spans exactly from the first node center to the last
              (12.5% inset matches the center of each grid-cols-4 cell), so the
              line never runs past the outer circles */}
          <div className="absolute left-[12.5%] right-[12.5%] top-[18px] h-[2px] rounded-full bg-white/15" />
          {/* traveling light packet along the rail */}
          <div className="absolute left-[12.5%] right-[12.5%] top-[18px] h-[2px]">
            <span className="packet absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_12px_3px_rgba(255,255,255,0.7)]" />
          </div>

          <div className="relative grid grid-cols-4">
            {agents.map((a) => (
              <div key={a.label} className="flex flex-col items-center gap-2">
                <span className="node-glow relative flex h-9 w-9 items-center justify-center rounded-full bg-white/12 ring-1 ring-white/25 backdrop-blur">
                  <span className={"h-2.5 w-2.5 rounded-full " + a.dot} />
                </span>
                <span className="text-center text-[11px] font-medium leading-tight text-white/85">
                  {a.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3.5 flex items-center justify-center gap-2 text-[11px] text-white/55">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          Four agents read, reason, and match · No PHI · synthetic patients
        </div>
      </div>
    </footer>
  );
}

/* ============================ backdrop layers ============================ */
function AuroraBackdrop() {
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage:
          "radial-gradient(120% 120% at 50% 0%, #1e3a8a 0%, #172d6e 38%, #0f2150 70%, #0a1736 100%)",
      }}
    >
      <span className="aurora-blob absolute -top-32 -right-24 h-[28rem] w-[28rem] rounded-full bg-sky-500/20 blur-[90px]" />
      <span className="aurora-blob absolute top-1/4 -left-32 h-[26rem] w-[26rem] rounded-full bg-emerald-500/14 blur-[90px] [animation-delay:3s]" />
      <span className="aurora-blob absolute -bottom-32 right-1/3 h-[24rem] w-[24rem] rounded-full bg-blue-500/16 blur-[90px] [animation-delay:6s]" />

      {/* grid, faded toward the edges with a radial mask */}
      <span
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          WebkitMaskImage:
            "radial-gradient(90% 80% at 50% 45%, black, transparent 100%)",
          maskImage:
            "radial-gradient(90% 80% at 50% 45%, black, transparent 100%)",
        }}
      />

      {/* center vignette to focus the card */}
      <span
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 48%, transparent 40%, rgba(6,14,38,0.55) 100%)",
        }}
      />
    </div>
  );
}
