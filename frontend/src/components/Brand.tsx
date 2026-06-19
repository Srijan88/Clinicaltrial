/** ClinicalTrials brand mark — a clinical pulse line in a rounded tile. Single
 * brand logomark (not an icon set), kept deliberately minimal. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-[9px] bg-gradient-to-br from-brand-500 to-brand-700 shadow-sm"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg
        width={size * 0.62}
        height={size * 0.62}
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 12h4l2.5-7 4 14 2.5-7H22" />
      </svg>
    </span>
  );
}

export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <Logo size={size} />
      <span className="font-semibold tracking-tight text-slate-900">
        Clinical<span className="text-brand-600">Trials</span>
      </span>
    </div>
  );
}
