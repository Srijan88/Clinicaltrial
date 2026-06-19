import type { PatientHeadline } from "../types";

/** Patient picker card — a compact clinical snapshot, not just a name. The
 * clinician should be able to read the chart at a glance: identity, subtype,
 * ECOG, receptor profile, labs, therapy history, and any critical flags
 * (brain mets, on CDK4/6 inhibitor). Densely packed but with clear visual
 * hierarchy so the disease subtype + ECOG read first. */

export default function PatientCard({
  patient,
  index = 0,
  onSelect,
}: {
  patient: PatientHeadline;
  index?: number;
  onSelect: () => void;
}) {
  const labs = patient.labs;
  const priorCount = patient.priorTherapies?.length ?? 0;
  const lastTherapy = priorCount
    ? patient.priorTherapies![patient.priorTherapies!.length - 1]
    : null;

  return (
    <button
      onClick={onSelect}
      style={{ animationDelay: `${index * 70}ms` }}
      className="group card-hover text-left animate-fade-in-up bg-white border border-slate-200/80 rounded-2xl shadow-card hover:border-brand-200 flex flex-col overflow-hidden"
    >
      {/* Header strip — id, demographics, subtype */}
      <div className="px-6 pt-5 pb-4 border-b border-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar id={patient.patientId} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[17px] font-semibold tracking-tight text-slate-900">
                  {patient.patientId}
                </span>
                <StagePill stage={patient.stage} />
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                <Icon name="user" />
                <span className="capitalize">{patient.sex}</span>
                <span className="text-slate-300">·</span>
                <span>{patient.age} yrs</span>
                {patient.location && (
                  <>
                    <span className="text-slate-300">·</span>
                    <Icon name="pin" />
                    <span className="truncate">{patient.location}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3.5">
          <div className="text-[13px] text-slate-700 leading-snug">
            {patient.diagnosis}
          </div>
          <div className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand-700 bg-brand-50 border border-brand-100 rounded-full px-2 py-0.5">
            <Icon name="dna" />
            {patient.subtype}
          </div>
        </div>
      </div>

      {/* Receptor profile — 4 chips with semantic coloring */}
      <div className="px-6 py-4 border-b border-slate-100">
        <SectionLabel icon="flask">Receptor profile</SectionLabel>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          <ReceptorChip k="ER" v={patient.er_status} />
          <ReceptorChip k="PR" v={patient.pr_status} />
          <ReceptorChip k="HER2" v={patient.her2_status} />
          <ReceptorChip k="AR" v={patient.ar_status} />
        </div>
      </div>

      {/* ECOG + labs — vital-sign style */}
      <div className="px-6 py-4 border-b border-slate-100 grid grid-cols-2 gap-4">
        <div>
          <SectionLabel icon="activity">ECOG</SectionLabel>
          <ECOGScale value={patient.ecog} />
        </div>
        {labs && (
          <div>
            <SectionLabel icon="droplet">Labs</SectionLabel>
            <div className="mt-2 space-y-0.5">
              <LabRow k="ANC" v={labs.anc} unit="K/μL" lo={1.5} />
              <LabRow k="Hgb" v={labs.hgb} unit="g/dL" lo={12.0} />
              <LabRow k="Plt" v={labs.platelets} unit="K/μL" lo={100} />
            </div>
          </div>
        )}
      </div>

      {/* Flags + prior therapies */}
      <div className="px-6 py-4 flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {patient.brainMets && (
            <Flag icon="brain" tone="rose">
              Brain mets
            </Flag>
          )}
          {patient.on_cdk46_inhibitor && (
            <Flag icon="pill" tone="brand">
              CDK4/6
            </Flag>
          )}
          {patient.durable_disease_control && (
            <Flag icon="check" tone="emerald">
              Stable
            </Flag>
          )}
          {!patient.brainMets &&
            !patient.on_cdk46_inhibitor &&
            !patient.durable_disease_control && (
              <span className="text-[11px] text-slate-400">No flags</span>
            )}
        </div>
        <div className="text-right text-[11px] text-slate-500 leading-tight shrink-0">
          <div className="font-semibold text-slate-700">
            {priorCount} prior {priorCount === 1 ? "line" : "lines"}
          </div>
          {lastTherapy && (
            <div className="capitalize truncate max-w-[110px]">
              {lastTherapy.drug}
            </div>
          )}
        </div>
      </div>

      {/* CTA */}
      <div className="px-6 py-3.5 bg-slate-50/60 border-t border-slate-100 flex items-center justify-between text-sm font-semibold text-brand-600">
        <span>Find trials</span>
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-50 group-hover:bg-brand-600 group-hover:text-white transition-colors duration-200">
          <svg
            className="transition-transform duration-200 group-hover:translate-x-0.5"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </div>
    </button>
  );
}

/* ---------- subcomponents ---------- */

function Avatar({ id }: { id: string }) {
  return (
    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white text-[13px] font-bold shadow-sm">
      {id.replace(/[^A-Z0-9]/gi, "").slice(0, 4)}
    </span>
  );
}

function StagePill({ stage }: { stage: string }) {
  return (
    <span className="text-[10px] font-semibold tracking-wide uppercase px-1.5 py-0.5 rounded-md bg-slate-900 text-white">
      Stage {stage}
    </span>
  );
}

function SectionLabel({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon: IconName;
}) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
      <Icon name={icon} size={11} />
      {children}
    </div>
  );
}

function ReceptorChip({ k, v }: { k: string; v: string }) {
  // HER2 has three states (positive/low/zero); we treat "zero" as negative-toned,
  // "low" as a distinct ambiguous-amber, "positive" as confirmed-emerald.
  const tone = receptorTone(v);
  const styles =
    tone === "pos"
      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
      : tone === "neg"
      ? "bg-slate-50 border-slate-200 text-slate-500"
      : "bg-amber-50 border-amber-200 text-amber-700";
  const dot =
    tone === "pos"
      ? "bg-emerald-500"
      : tone === "neg"
      ? "bg-slate-400"
      : "bg-amber-500";
  return (
    <span
      className={
        "inline-flex flex-col items-center justify-center rounded-lg border px-1.5 py-1.5 " +
        styles
      }
    >
      <span className="flex items-center gap-1 text-[10px] font-bold tracking-wide">
        <span className={"h-1.5 w-1.5 rounded-full " + dot} />
        {k}
      </span>
      <span className="text-[10.5px] font-medium capitalize leading-tight mt-0.5">
        {v}
      </span>
    </span>
  );
}

function receptorTone(v: string): "pos" | "neg" | "amb" {
  const s = (v || "").toLowerCase();
  if (s === "positive") return "pos";
  if (s === "negative" || s === "zero") return "neg";
  return "amb"; // "low", unknown, etc.
}

function ECOGScale({ value }: { value: number }) {
  return (
    <div className="mt-2">
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
          {value}
        </span>
        <span className="text-[11px] text-slate-400">/ 4</span>
      </div>
      <div className="mt-1.5 flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => {
          const filled = i <= value;
          const isCurrent = i === value;
          return (
            <span
              key={i}
              className={
                "h-1.5 flex-1 rounded-full transition-colors " +
                (filled
                  ? value <= 1
                    ? "bg-emerald-500"
                    : value === 2
                    ? "bg-amber-500"
                    : "bg-rose-500"
                  : "bg-slate-100") +
                (isCurrent ? " ring-2 ring-offset-1 ring-slate-200" : "")
              }
            />
          );
        })}
      </div>
    </div>
  );
}

function LabRow({
  k,
  v,
  unit,
  lo,
}: {
  k: string;
  v: number;
  unit: string;
  lo: number;
}) {
  const low = v < lo;
  return (
    <div className="flex items-baseline justify-between text-[11.5px] tabular-nums">
      <span className="text-slate-500">{k}</span>
      <span className="flex items-baseline gap-1">
        <span className={low ? "font-semibold text-amber-600" : "font-semibold text-slate-700"}>
          {v}
        </span>
        <span className="text-slate-400 text-[10px]">{unit}</span>
        {low && <span className="text-amber-500">↓</span>}
      </span>
    </div>
  );
}

type FlagTone = "rose" | "brand" | "emerald" | "amber";

function Flag({
  children,
  icon,
  tone,
}: {
  children: React.ReactNode;
  icon: IconName;
  tone: FlagTone;
}) {
  const styles: Record<FlagTone, string> = {
    rose: "bg-rose-50 text-rose-700 border-rose-200",
    brand: "bg-brand-50 text-brand-700 border-brand-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
  };
  return (
    <span
      className={
        "inline-flex items-center gap-1 text-[11px] font-semibold rounded-md border px-1.5 py-0.5 " +
        styles[tone]
      }
    >
      <Icon name={icon} size={11} />
      {children}
    </span>
  );
}

/* ---------- inline icon set (no external library) ---------- */

type IconName =
  | "user"
  | "pin"
  | "dna"
  | "flask"
  | "activity"
  | "droplet"
  | "brain"
  | "pill"
  | "check";

function Icon({ name, size = 12 }: { name: IconName; size?: number }) {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "user":
      return (
        <svg {...props}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      );
    case "pin":
      return (
        <svg {...props}>
          <path d="M12 22s7-7.5 7-13a7 7 0 0 0-14 0c0 5.5 7 13 7 13Z" />
          <circle cx="12" cy="9" r="2.5" />
        </svg>
      );
    case "dna":
      // Stylized helix
      return (
        <svg {...props}>
          <path d="M4 4c4 4 12 4 16 0M4 20c4-4 12-4 16 0M7 4v16M17 4v16" />
        </svg>
      );
    case "flask":
      return (
        <svg {...props}>
          <path d="M9 3h6M10 3v6L4 19a2 2 0 0 0 1.7 3h12.6A2 2 0 0 0 20 19l-6-10V3" />
          <path d="M6.5 14h11" />
        </svg>
      );
    case "activity":
      return (
        <svg {...props}>
          <path d="M3 12h4l3-9 4 18 3-9h4" />
        </svg>
      );
    case "droplet":
      return (
        <svg {...props}>
          <path d="M12 3s6 7 6 11a6 6 0 1 1-12 0c0-4 6-11 6-11Z" />
        </svg>
      );
    case "brain":
      return (
        <svg {...props}>
          <path d="M9.5 2A3.5 3.5 0 0 0 6 5.5v0A3.5 3.5 0 0 0 3 9c0 1.5.7 2.5 1.5 3.2A3 3 0 0 0 6 18a3 3 0 0 0 3 3c1 0 2-.5 2.5-1.5V2.5A.5.5 0 0 0 9.5 2Z" />
          <path d="M14.5 2A3.5 3.5 0 0 1 18 5.5v0A3.5 3.5 0 0 1 21 9c0 1.5-.7 2.5-1.5 3.2A3 3 0 0 1 18 18a3 3 0 0 1-3 3c-1 0-2-.5-2.5-1.5V2.5a.5.5 0 0 1 .5-.5h1.5Z" />
        </svg>
      );
    case "pill":
      return (
        <svg {...props}>
          <rect x="2" y="9" width="20" height="6" rx="3" transform="rotate(-45 12 12)" />
          <path d="M8.5 8.5l7 7" />
        </svg>
      );
    case "check":
      return (
        <svg {...props}>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      );
  }
}
