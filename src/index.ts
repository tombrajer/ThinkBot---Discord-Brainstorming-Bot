import { resolve } from "node:path";
import { readConfig } from "./config.js";
import { BrainstormingEngine } from "./core/brainstormingEngine.js";
import { createDiscordBot } from "./discord/bot.js";
import { HeuristicAnalyzer } from "./analysis/heuristicAnalyzer.js";
import { JsonStore } from "./storage/jsonStore.js";

const start = async () => {
  const config = readConfig();
  const store = new JsonStore(resolve(config.DATA_FILE));
  const analyzer = new HeuristicAnalyzer();
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
