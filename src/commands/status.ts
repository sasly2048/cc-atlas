import type { Db } from "../db/database.js";
import type { ToolkitConfig } from "../core/config.js";
import { SessionRepository } from "../db/repositories.js";
import { computeCurrentStreak } from "../analytics/forecast.js";
import { computeBurnoutReport } from "../analytics/burnout.js";
import { dayKey } from "../utils/dates.js";
import { sum } from "../utils/numbers.js";

/** Not derived from any yurukusa package. A single compact line meant to be
 * shelled out to from somewhere else — a shell prompt (starship "custom"
 * module, a tmux status-right script), or a VS Code task/extension that
 * runs a command and shows its output in the status bar. `--json` gives a
 * stable machine-readable shape for that kind of integration; the plain
 * text form is meant to be pasted straight into a prompt config. */
export interface StatusSnapshot {
  streakDays: number;
  hoursToday: number;
  sessionsToday: number;
  burnoutRisk: "low" | "moderate" | "high" | "severe";
}

export function computeStatus(db: Db, config: ToolkitConfig, now = Date.now()): StatusSnapshot {
  const sessions = new SessionRepository(db).all();
  const today = dayKey(now);
  const todaySessions = sessions.filter((s) => dayKey(s.startedAt) === today);
  const burnout = computeBurnoutReport(sessions, config.burnout);

  return {
    streakDays: computeCurrentStreak(sessions, now),
    hoursToday: sum(todaySessions.map((s) => s.durationMs)) / 3_600_000,
    sessionsToday: todaySessions.length,
    burnoutRisk: burnout.riskLevel,
  };
}

const RISK_ICON: Record<StatusSnapshot["burnoutRisk"], string> = {
  low: "🟢",
  moderate: "🟡",
  high: "🟠",
  severe: "🔴",
};

export function renderStatusLine(status: StatusSnapshot): string {
  return `🔥 ${status.streakDays}d · ${status.hoursToday.toFixed(1)}h today · ${RISK_ICON[status.burnoutRisk]} ${status.burnoutRisk}`;
}
