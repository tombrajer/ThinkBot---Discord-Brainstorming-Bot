import { resolve } from "node:path";
import { readConfig } from "./config.js";
import { BrainstormingEngine } from "./core/brainstormingEngine.js";
import { createDiscordBot } from "./discord/bot.js";
import { HeuristicAnalyzer } from "./analysis/heuristicAnalyzer.js";
import { OllamaAnalyzer } from "./analysis/ollamaAnalyzer.js";
import { JsonStore } from "./storage/jsonStore.js";

const start = async () => {
  const config = readConfig();
  const store = new JsonStore(resolve(config.DATA_FILE));
  const heuristicAnalyzer = new HeuristicAnalyzer();
  const analyzer =
    config.ANALYZER_PROVIDER === "heuristic"
      ? heuristicAnalyzer
      : new OllamaAnalyzer({
          baseUrl: config.OLLAMA_BASE_URL,
          model: config.OLLAMA_MODEL,
          timeoutMs: config.OLLAMA_TIMEOUT_MS,
          fallbackAnalyzer: heuristicAnalyzer,
        });
  const engine = new BrainstormingEngine(store, analyzer);

  const bot = createDiscordBot(engine, {
    enableMessageContentIntent: config.ENABLE_MESSAGE_CONTENT_INTENT,
  });
  await bot.login(config.DISCORD_TOKEN);
};

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
