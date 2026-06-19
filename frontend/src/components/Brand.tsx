/** ClinicalTrials brand mark — uses the product photograph from
 * /public/brand-logo.jpg, framed in a soft rounded tile so it fits next to
 * other UI chrome cleanly. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center overflow-hidden rounded-[9px] bg-white ring-1 ring-slate-200 shadow-sm"
      style={{ width: size, height: size }}
      aria-label="ClinicalTrials"
    >
      <img
        src="/brand-logo.jpg"
        alt=""
        className="h-full w-full object-cover"
        draggable={false}
      />
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
