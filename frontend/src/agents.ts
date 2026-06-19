/** Single source of truth for how agents are labelled in the UI. Showing the
 * word "Agent" after the role makes it obvious to a clinician that an
 * autonomous worker is acting (and, while it's the active stage, loading). */

export type AgentRole =
  | "intake"
  | "discoverer"
  | "parser"
  | "analyzer"
  | "orchestrator"
  | "participant";

const DISPLAY: Record<string, string> = {
  intake: "Intake Agent",
  discoverer: "Discovery Agent",
  parser: "Eligibility Agent",
  analyzer: "Analysis Agent",
  orchestrator: "Orchestrator",
  participant: "Participant",
};

/** Human label for a role, e.g. "intake" -> "Intake Agent". */
export function agentLabel(role: string): string {
  return DISPLAY[role] || `${cap(role)} Agent`;
}

/** Short label without the suffix, for compact chips. */
export function agentShort(role: string): string {
  return cap(role);
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
