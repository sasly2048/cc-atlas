import type { AppContext } from "../core/bootstrap.js";
import { saveConfig } from "../core/config.js";
import { renderBanner } from "../ui/banner.js";
import { selectMenu, input, confirm, Separator } from "../ui/prompts.js";
import { runSync } from "./sync.js";
import {
  showDashboard,
  showSessionStats,
  showToolUsage,
  showStreaks,
  showBurnout,
  showGitActivity,
  showHeatmap,
  showCost,
  showContent,
  showContext,
  showCollaboration,
  showPersonality,
  showModelUsage,
} from "./views/analytics-views.js";
import { runReportsMenu, generateBadge, checkStreakAlert, runModelSelector, runDoctor, runSettingsMenu } from "./views/utility-views.js";
import {
  showProjectComparison,
  showSessionReplay,
  showTeamActivity,
  showAnomalies,
  showGoals,
  runGoalsSettings,
  runAsk,
  runExport,
} from "./views/more-views.js";
import { runLiveMonitor } from "./views/live.js";
import { loadPlugins, type LoadedPlugin } from "../plugins/loader.js";

type MenuAction =
  | "dashboard"
  | "sync"
  | "sessions"
  | "tools"
  | "streaks"
  | "burnout"
  | "git"
  | "heatmap"
  | "cost"
  | "content"
  | "context"
  | "collaboration"
  | "personality"
  | "models"
  | "model-selector"
  | "compare"
  | "replay"
  | "team"
  | "anomalies"
  | "goals"
  | "ask"
  | "reports"
  | "export"
  | "badge"
  | "alert"
  | "live"
  | "doctor"
  | "settings"
  | "plugins"
  | "exit";

export async function runInteractiveMenu(ctx: AppContext, version: string): Promise<void> {
  console.log(renderBanner(version));

  const plugins: LoadedPlugin[] = await loadPlugins(ctx.config.plugins.enabled);

  let running = true;
  while (running) {
    const action = await selectMenu<MenuAction | string>("What would you like to do?", [
      { name: "📊 Dashboard", value: "dashboard" },
      { name: "🔄 Sync data (ingest transcripts + git)", value: "sync" },
      new Separator("── Analytics ──"),
      { name: "⏱️  Session Stats", value: "sessions" },
      { name: "🛠️  Tool Usage", value: "tools" },
      { name: "🔥 Streaks & Reliability", value: "streaks" },
      { name: "🧠 Burnout & Wellness", value: "burnout" },
      { name: "🐙 Git Activity", value: "git" },
      { name: "🗓️  Heatmap", value: "heatmap" },
      { name: "💰 Cost & Cache Savings", value: "cost" },
      { name: "📝 Content Analysis", value: "content" },
      { name: "🧩 Context & Thinking", value: "context" },
      { name: "🤝 Human/AI Collaboration", value: "collaboration" },
      { name: "🎭 Personality, Score & Achievements", value: "personality" },
      { name: "🤖 Model Usage", value: "models" },
      { name: "🧭 Model Selector (pick a model for a task)", value: "model-selector" },
      new Separator("── Deeper cuts ──"),
      { name: "🆚 Compare two projects", value: "compare" },
      { name: "🎬 Session replay (compressed timeline)", value: "replay" },
      { name: "👥 Team activity (multi-user)", value: "team" },
      { name: "🚨 Anomalies (unusual days/sessions)", value: "anomalies" },
      { name: "🎯 Goals & progress", value: "goals" },
      { name: "💬 Ask a question about your usage", value: "ask" },
      new Separator("── Output ──"),
      { name: "📄 Reports (Markdown/HTML/standup/receipt/compare)", value: "reports" },
      { name: "📤 Export (Prometheus/JSON)", value: "export" },
      { name: "🏷️  Generate README badge", value: "badge" },
      { name: "⏰ Streak risk alert", value: "alert" },
      { name: "📡 Live session monitor", value: "live" },
      new Separator("── System ──"),
      { name: "🩺 Doctor (health check)", value: "doctor" },
      { name: "⚙️  Settings", value: "settings" },
      ...(plugins.length > 0
        ? [new Separator("── Plugins ──"), ...plugins.map((p) => ({ name: p.menuLabel, value: `plugin:${p.id}` }))]
        : []),
      new Separator(),
      { name: "🚪 Exit", value: "exit" },
    ]);

    console.log("");

    if (action === "exit") {
      running = false;
      continue;
    }

    if (typeof action === "string" && action.startsWith("plugin:")) {
      const id = action.slice("plugin:".length);
      const plugin = plugins.find((p) => p.id === id);
      if (plugin) await plugin.run({ db: ctx.db, config: ctx.config });
    } else {
      await dispatch(action as MenuAction, ctx);
    }

    if (running) {
      await input("\nPress Enter to return to the menu");
      console.clear();
      console.log(renderBanner(version));
    }
  }
}

async function dispatch(action: MenuAction, ctx: AppContext): Promise<void> {
  switch (action) {
    case "dashboard":
      showDashboard(ctx.db, ctx.config);
      return;
    case "sync":
      await runSync(ctx.db, ctx.config);
      return;
    case "sessions":
      showSessionStats(ctx.db);
      return;
    case "tools":
      showToolUsage(ctx.db);
      return;
    case "streaks":
      showStreaks(ctx.db);
      return;
    case "burnout":
      showBurnout(ctx.db, ctx.config);
      return;
    case "git":
      showGitActivity(ctx.db);
      return;
    case "heatmap":
      showHeatmap(ctx.db);
      return;
    case "cost":
      showCost(ctx.db);
      return;
    case "content":
      showContent(ctx.db);
      return;
    case "context":
      showContext(ctx.db);
      return;
    case "collaboration":
      showCollaboration(ctx.db);
      return;
    case "personality":
      showPersonality(ctx.db, ctx.config);
      return;
    case "models":
      showModelUsage(ctx.db);
      return;
    case "model-selector":
      await runModelSelector();
      return;
    case "compare":
      await showProjectComparison(ctx.db);
      return;
    case "replay":
      await showSessionReplay(ctx.db);
      return;
    case "team":
      showTeamActivity(ctx.db, ctx.config);
      return;
    case "anomalies":
      showAnomalies(ctx.db);
      return;
    case "goals": {
      showGoals(ctx.db, ctx.config);
      const edit = await confirm("\nSet or update goals?", false);
      if (edit) {
        const next = await runGoalsSettings(ctx.config);
        saveConfig(next);
        Object.assign(ctx.config, next);
      }
      return;
    }
    case "ask":
      await runAsk(ctx.db, ctx.config);
      return;
    case "reports":
      await runReportsMenu(ctx.db, ctx.config);
      return;
    case "export":
      await runExport(ctx.db, ctx.config);
      return;
    case "badge":
      generateBadge(ctx.db, ctx.config);
      return;
    case "alert":
      checkStreakAlert(ctx.db, ctx.config);
      return;
    case "live":
      await runLiveMonitor(ctx.config);
      return;
    case "doctor":
      runDoctor(ctx.config);
      return;
    case "settings": {
      const next = await runSettingsMenu(ctx.config);
      saveConfig(next);
      Object.assign(ctx.config, next);
      return;
    }
    default:
      return;
  }
}
