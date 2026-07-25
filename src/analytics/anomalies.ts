import type { SessionRecord, ToolCallRecord } from "../types/domain.js";
import { buildDailyRollups } from "./heatmap.js";
import { groupBy, mean, ratio, stddev } from "../utils/numbers.js";
import { dayKey } from "../utils/dates.js";

/** Not derived from any yurukusa package. Every existing screen reports raw
 * numbers and leaves spotting the unusual day/session to you; this flags it
 * directly using z-scores over daily rollups plus per-session outlier
 * checks, rather than requiring you to eyeball a heatmap or table. */
export interface Anomaly {
  date: string;
  kind: "hours-spike" | "error-spike" | "unusual-hour" | "marathon-session";
  severity: "notable" | "high";
  description: string;
}

const Z_NOTABLE = 2;
const Z_HIGH = 3;

export function computeAnomalies(sessions: SessionRecord[], toolCalls: ToolCallRecord[]): Anomaly[] {
  const anomalies: Anomaly[] = [];
  if (sessions.length < 5) return anomalies; // not enough history for a meaningful baseline

  const rollups = buildDailyRollups(sessions, [], 365);
  const hoursSeries = rollups.map((r) => r.hours).filter((h) => h > 0);
  const hoursMean = mean(hoursSeries);
  const hoursStd = stddev(hoursSeries);

  if (hoursStd > 0) {
    for (const row of rollups) {
      if (row.hours <= 0) continue;
      const z = (row.hours - hoursMean) / hoursStd;
      if (z >= Z_NOTABLE) {
        anomalies.push({
          date: row.date,
          kind: "hours-spike",
          severity: z >= Z_HIGH ? "high" : "notable",
          description: `${row.hours.toFixed(1)}h logged — ${z.toFixed(1)}σ above your typical day (avg ${hoursMean.toFixed(1)}h).`,
        });
      }
    }
  }

  const byDay = groupBy(toolCalls, (c) => dayKey(c.ts));
  const dailyErrorRates: Array<{ date: string; rate: number; calls: number }> = [];
  for (const [date, calls] of byDay.entries()) {
    if (calls.length < 5) continue;
    const errors = calls.filter((c) => c.status === "error").length;
    dailyErrorRates.push({ date, rate: ratio(errors, calls.length), calls: calls.length });
  }
  const rateMean = mean(dailyErrorRates.map((d) => d.rate));
  const rateStd = stddev(dailyErrorRates.map((d) => d.rate));
  if (rateStd > 0) {
    for (const row of dailyErrorRates) {
      const z = (row.rate - rateMean) / rateStd;
      if (z >= Z_NOTABLE && row.rate > 0.05) {
        anomalies.push({
          date: row.date,
          kind: "error-spike",
          severity: z >= Z_HIGH ? "high" : "notable",
          description: `${(row.rate * 100).toFixed(0)}% error rate across ${row.calls} tool calls — well above your ${(rateMean * 100).toFixed(0)}% average.`,
        });
      }
    }
  }

  const durationsMin = sessions.map((s) => s.durationMs / 60_000);
  const durMean = mean(durationsMin);
  const durStd = stddev(durationsMin);
  if (durStd > 0) {
    for (const s of sessions) {
      const minutes = s.durationMs / 60_000;
      const z = (minutes - durMean) / durStd;
      if (z >= Z_HIGH && minutes > 120) {
        anomalies.push({
          date: dayKey(s.startedAt),
          kind: "marathon-session",
          severity: z >= Z_HIGH + 1 ? "high" : "notable",
          description: `A ${(minutes / 60).toFixed(1)}h session on ${s.project} — far longer than your ${(durMean / 60).toFixed(1)}h average.`,
        });
      }
    }
  }

  return anomalies.sort((a, b) => (a.date < b.date ? 1 : -1));
}
