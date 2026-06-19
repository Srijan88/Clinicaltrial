import type { MatchResult, RunMode, TrialResult } from "./types";

const CLINICIAN_ID = "trialsync.clinicianId";
const CLINICIAN_NAME = "trialsync.clinicianName";
const MODE = "trialsync.mode";
const FAVORITES = "trialsync.favorites.v2";
const APPLIED = "trialsync.applied.v2";
const SAVED = "trialsync.savedSearches.v1";
const RUN_HISTORY = "trialsync.runHistory.v1";
const NOTIFS = "trialsync.notifications.v1";
const NOTIFS_SEEDED = "trialsync.notifications.seeded";
const SEARCHES = "trialsync.searchCount";

const STATS_EVENT = "trialsync:stats-changed";

/* --------------------------- identity / mode --------------------------- */

export function setClinician(id: string, name: string): void {
  localStorage.setItem(CLINICIAN_ID, id);
  localStorage.setItem(CLINICIAN_NAME, name);
}
export function getClinicianId(): string {
  return localStorage.getItem(CLINICIAN_ID) || "";
}
export function getClinicianName(): string {
  return localStorage.getItem(CLINICIAN_NAME) || "";
}
export function getMode(): RunMode {
  return (localStorage.getItem(MODE) as RunMode) || "live";
}
export function setMode(mode: RunMode): void {
  localStorage.setItem(MODE, mode);
}

/* ------------------------------ data models ----------------------------- */

export interface SavedTrial {
  nctId: string;
  title: string;
  phase: string | null;
  conditions: string[];
  detailsUrl: string;
  lane: "match" | "no_match";
  patientId: string;
  ts: number;
}

export interface AppliedTrial extends SavedTrial {
  status: "submitted";
}

export interface SavedSearch {
  patientId: string;
  mode: RunMode;
  matchCount: number;
  total: number;
  ts: number;
}

export interface RunRecord {
  patientId: string;
  mode: RunMode;
  matchCount: number;
  total: number;
  ts: number;
  result?: MatchResult;
}

export type NotifKind = "application" | "favorite" | "match" | "system";

export interface Notification {
  id: string;
  kind: NotifKind;
  title: string;
  body: string;
  ts: number;
  read: boolean;
}

/* ------------------------------- plumbing ------------------------------- */

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event(STATS_EVENT));
}
export function onStatsChange(handler: () => void): () => void {
  window.addEventListener(STATS_EVENT, handler);
  return () => window.removeEventListener(STATS_EVENT, handler);
}

function trialToSaved(t: TrialResult, patientId: string): SavedTrial {
  return {
    nctId: t.nctId,
    title: t.title,
    phase: t.phase,
    conditions: t.conditions,
    detailsUrl: t.detailsUrl,
    lane: t.lane,
    patientId,
    ts: Date.now(),
  };
}

/* ------------------------------ favorites ------------------------------- */

export function getFavorites(): SavedTrial[] {
  return read<SavedTrial[]>(FAVORITES, []).sort((a, b) => b.ts - a.ts);
}
export function isFavorite(nctId: string): boolean {
  return read<SavedTrial[]>(FAVORITES, []).some((f) => f.nctId === nctId);
}
export function toggleFavorite(trial: TrialResult, patientId: string): boolean {
  const list = read<SavedTrial[]>(FAVORITES, []);
  const exists = list.some((f) => f.nctId === trial.nctId);
  const next = exists
    ? list.filter((f) => f.nctId !== trial.nctId)
    : [...list, trialToSaved(trial, patientId)];
  write(FAVORITES, next);
  if (!exists) {
    addNotification("favorite", "Saved to favorites", `${trial.nctId} — ${trial.title}`);
  }
  return !exists;
}
export function removeFavorite(nctId: string): void {
  write(FAVORITES, read<SavedTrial[]>(FAVORITES, []).filter((f) => f.nctId !== nctId));
}
export function favoritesCount(): number {
  return read<SavedTrial[]>(FAVORITES, []).length;
}

/* ------------------------------ applied -------------------------------- */

export function getApplied(): AppliedTrial[] {
  return read<AppliedTrial[]>(APPLIED, []).sort((a, b) => b.ts - a.ts);
}
export function isApplied(nctId: string): boolean {
  return read<AppliedTrial[]>(APPLIED, []).some((a) => a.nctId === nctId);
}
export function markApplied(trial: TrialResult, patientId: string): void {
  const list = read<AppliedTrial[]>(APPLIED, []);
  if (list.some((a) => a.nctId === trial.nctId)) return;
  const rec: AppliedTrial = { ...trialToSaved(trial, patientId), status: "submitted" };
  write(APPLIED, [...list, rec]);
  addNotification(
    "application",
    "Application submitted",
    `${trial.nctId} — ${trial.title} (simulated)`
  );
}
export function withdrawApplication(nctId: string): void {
  write(APPLIED, read<AppliedTrial[]>(APPLIED, []).filter((a) => a.nctId !== nctId));
}
export function appliedCount(): number {
  return read<AppliedTrial[]>(APPLIED, []).length;
}

/* --------------------------- saved searches ---------------------------- */

export function getSavedSearches(): SavedSearch[] {
  return read<SavedSearch[]>(SAVED, []).sort((a, b) => b.ts - a.ts);
}
export function isSearchSaved(patientId: string): boolean {
  return read<SavedSearch[]>(SAVED, []).some((s) => s.patientId === patientId);
}
export function saveSearch(s: Omit<SavedSearch, "ts">): boolean {
  const list = read<SavedSearch[]>(SAVED, []);
  const exists = list.some((x) => x.patientId === s.patientId);
  const next = exists
    ? list.map((x) => (x.patientId === s.patientId ? { ...s, ts: Date.now() } : x))
    : [...list, { ...s, ts: Date.now() }];
  write(SAVED, next);
  if (!exists) {
    addNotification("system", "Search saved", `Patient ${s.patientId} added to saved searches`);
  }
  return !exists;
}
export function removeSavedSearch(patientId: string): void {
  write(SAVED, read<SavedSearch[]>(SAVED, []).filter((s) => s.patientId !== patientId));
}
export function savedSearchesCount(): number {
  return read<SavedSearch[]>(SAVED, []).length;
}

/* ----------------------------- run history ----------------------------- */
// Auto-recorded on every completed match (no manual action needed). This is
// what powers the dashboard "Previous runs" — distinct from manually-saved
// searches.

export function getRunHistory(): RunRecord[] {
  return read<RunRecord[]>(RUN_HISTORY, []).sort((a, b) => b.ts - a.ts);
}
export function getRun(patientId: string): RunRecord | undefined {
  return read<RunRecord[]>(RUN_HISTORY, []).find((r) => r.patientId === patientId);
}
export function recordRun(r: Omit<RunRecord, "ts">): void {
  const list = read<RunRecord[]>(RUN_HISTORY, []);
  // Keep one entry per patient (most recent), newest first, cap at 12.
  const others = list.filter((x) => x.patientId !== r.patientId);
  write(RUN_HISTORY, [{ ...r, ts: Date.now() }, ...others].slice(0, 12));
}
export function removeRun(patientId: string): void {
  write(RUN_HISTORY, read<RunRecord[]>(RUN_HISTORY, []).filter((x) => x.patientId !== patientId));
}
export function clearRunHistory(): void {
  write(RUN_HISTORY, []);
}
export function runHistoryCount(): number {
  return read<RunRecord[]>(RUN_HISTORY, []).length;
}

/* ----------------------------- search count ---------------------------- */

export function getSearchCount(): number {
  return Number(localStorage.getItem(SEARCHES) || "0");
}
export function incrementSearchCount(): void {
  localStorage.setItem(SEARCHES, String(getSearchCount() + 1));
  window.dispatchEvent(new Event(STATS_EVENT));
}

/* ----------------------------- notifications --------------------------- */

function seedNotifications(): void {
  if (localStorage.getItem(NOTIFS_SEEDED)) return;
  const now = Date.now();
  const seed: Notification[] = [
    {
      id: "n_welcome",
      kind: "system",
      title: "Welcome to ClinicalTrials",
      body: "Run a match to see live agent reasoning and ranked trials.",
      ts: now - 1000 * 60 * 60,
      read: false,
    },
    {
      id: "n_demo",
      kind: "system",
      title: "Demo mode available",
      body: "Switch to Demo for a fast cached replay if live agents are busy.",
      ts: now - 1000 * 60 * 90,
      read: false,
    },
  ];
  localStorage.setItem(NOTIFS, JSON.stringify(seed));
  localStorage.setItem(NOTIFS_SEEDED, "1");
}

export function getNotifications(): Notification[] {
  seedNotifications();
  return read<Notification[]>(NOTIFS, []).sort((a, b) => b.ts - a.ts);
}
export function addNotification(kind: NotifKind, title: string, body: string): void {
  seedNotifications();
  const list = read<Notification[]>(NOTIFS, []);
  const rec: Notification = {
    id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    kind,
    title,
    body,
    ts: Date.now(),
    read: false,
  };
  write(NOTIFS, [rec, ...list].slice(0, 50));
}
export function markAllNotificationsRead(): void {
  write(NOTIFS, getNotifications().map((n) => ({ ...n, read: true })));
}
export function markNotificationRead(id: string): void {
  write(NOTIFS, getNotifications().map((n) => (n.id === id ? { ...n, read: true } : n)));
}
export function clearNotifications(): void {
  write(NOTIFS, []);
}
export function notificationsCount(): number {
  return getNotifications().filter((n) => !n.read).length;
}
