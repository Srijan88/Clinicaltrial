export interface Clinician {
  clinicianId: string;
  name: string;
  site: string;
  role: string;
}

export interface PriorTherapy {
  drug: string;
  line: number;
  endDate: string | null;
}

export interface Labs {
  anc: number;
  hgb: number;
  platelets: number;
}

export interface PatientHeadline {
  patientId: string;
  age: number;
  sex: string;
  diagnosis: string;
  stage: string;
  subtype: string;
  ecog: number;
  hr_status: string;
  er_status: string;
  pr_status: string;
  her2_status: string;
  ar_status: string;
  labs?: Labs;
  priorTherapies?: PriorTherapy[];
  on_cdk46_inhibitor?: boolean;
  durable_disease_control?: boolean;
  brainMets?: boolean;
  location?: string;
}

export interface CriterionResult {
  index: number;
  text: string;
  type: "inclusion" | "exclusion";
  lever: string;
  verdict: "pass" | "fail";
  detail: string;
  rationale: string;
}

export interface TrialLocation {
  facility: string;
  city: string;
  state: string;
  country: string;
  display: string;
  status: string;
}

export interface TrialContact {
  name: string;
  phone: string;
  email: string;
}

export interface TrialResult {
  nctId: string;
  title: string;
  phase: string | null;
  conditions: string[];
  detailsUrl: string;
  lane: "match" | "no_match";
  explanation: string;
  criteria: CriterionResult[];
  locations?: TrialLocation[];
  contacts?: TrialContact[];
}

export interface MatchResult {
  patientId: string;
  subtype: string;
  hr_status: string;
  her2_status: string;
  ecog: number;
  trials: TrialResult[];
}

export type RunState =
  | "starting"
  | "intake"
  | "discoverer"
  | "parser"
  | "analyzer"
  | "done"
  | "error";

export interface RunHandle {
  run_id: string;
  room_id: string;
  started_at: string;
}

export interface RunStatus {
  run_id: string;
  state: RunState;
  patientId: string;
  clinicianId: string;
  mode: string;
  started_at: string;
  error: string | null;
  result: MatchResult | null;
}

export interface RoomMessage {
  id: string;
  author_handle: string;
  author_role: string;
  text: string;
  posted_at: string;
  tool_calls?: unknown;
}

export type RunMode = "live" | "demo";
