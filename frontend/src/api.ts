import type {
  Clinician,
  PatientHeadline,
  RoomMessage,
  RunHandle,
  RunMode,
  RunStatus,
} from "./types";

const BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000/api/v1";

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export function getClinicians(): Promise<Clinician[]> {
  return getJSON(`${BASE}/clinicians`);
}

export function getPatients(): Promise<PatientHeadline[]> {
  return getJSON(`${BASE}/patients`);
}

export async function findTrials(
  patientId: string,
  clinicianId: string,
  mode: RunMode
): Promise<RunHandle> {
  const res = await fetch(`${BASE}/trials/find?mode=${mode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ patientId, clinicianId }),
  });
  if (!res.ok) throw new Error(`find failed: ${res.status}`);
  return res.json() as Promise<RunHandle>;
}

export function getRunStatus(runId: string): Promise<RunStatus> {
  return getJSON(`${BASE}/run/${runId}/status`);
}

export function getRunMessages(
  runId: string,
  since: string
): Promise<{ run_id: string; messages: RoomMessage[] }> {
  const q = since ? `?since=${encodeURIComponent(since)}` : "";
  return getJSON(`${BASE}/run/${runId}/messages${q}`);
}
