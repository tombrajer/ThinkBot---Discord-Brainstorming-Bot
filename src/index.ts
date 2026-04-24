import { resolve } from "node:path";
import { readConfig } from "./config.js";
import { BrainstormingEngine } from "./core/brainstormingEngine.js";
import { createDiscordBot } from "./discord/bot.js";
import { HeuristicAnalyzer } from "./analysis/heuristicAnalyzer.js";
import { OllamaClarifier } from "./analysis/ollamaClarifier.js";
import { OllamaAnalyzer } from "./analysis/ollamaAnalyzer.js";
import { validateOllamaHealth } from "./analysis/ollamaHealth.js";
import { Analyzer } from "./domain/types.js";
import { JsonStore } from "./storage/jsonStore.js";

const start = async () => {
  const config = readConfig();
  const store = new JsonStore(resolve(config.DATA_FILE));
  const heuristicAnalyzer = new HeuristicAnalyzer();
  let analyzer: Analyzer = heuristicAnalyzer;

  if (config.ANALYZER_PROVIDER === "ollama") {
    console.info(
      `[ollama] Configuration baseUrl=${config.OLLAMA_BASE_URL} model=${config.OLLAMA_MODEL} timeoutMs=${config.OLLAMA_TIMEOUT_MS}`,
    );
    analyzer = new OllamaAnalyzer({
      baseUrl: config.OLLAMA_BASE_URL,
      model: config.OLLAMA_MODEL,
      timeoutMs: config.OLLAMA_TIMEOUT_MS,
      fallbackAnalyzer: heuristicAnalyzer,
    });
    try {
      await validateOllamaHealth({
        baseUrl: config.OLLAMA_BASE_URL,
        model: config.OLLAMA_MODEL,
        timeoutMs: config.OLLAMA_TIMEOUT_MS,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Ollama error.";
      console.warn(
        `[ollama] Startup health check failed. Continuing with Ollama analyzer and per-request fallback. ${message}`,
      );
    }
  }

  const engine = new BrainstormingEngine(store, analyzer);
  const clarifier = new OllamaClarifier({
    baseUrl: config.OLLAMA_BASE_URL,
    model: config.OLLAMA_MODEL,
    timeoutMs: config.OLLAMA_TIMEOUT_MS,
  });

  const createBot = (enableMessageContentIntent: boolean) =>
    createDiscordBot(engine, {
      enableMessageContentIntent,
      clarifier,
      clarifyCooldownMs: 60_000,
    });

  let bot = createBot(config.ENABLE_MESSAGE_CONTENT_INTENT);
  try {
    await bot.login(config.DISCORD_TOKEN);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const canRetryWithoutIntent =
      config.ENABLE_MESSAGE_CONTENT_INTENT && message.includes("Used disallowed intents");

    if (!canRetryWithoutIntent) {
      throw error;
    }

    console.warn(
      [
        "[discord] Message Content Intent is disallowed for this application.",
        "Retrying without message content intent.",
        "Session capture from regular channel messages will be disabled.",
        "Enable Message Content Intent in the Discord Developer Portal to restore full capture.",
      ].join(" "),
    );

    bot.destroy();
    bot = createBot(false);
    await bot.login(config.DISCORD_TOKEN);
  }
};

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
