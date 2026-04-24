import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const configSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_GUILD_ID: z.string().optional(),
  DATA_FILE: z.string().default("./data/store.json"),
  ANALYZER_PROVIDER: z.enum(["ollama", "heuristic"]).default("ollama"),
  OLLAMA_BASE_URL: z.string().default("http://127.0.0.1:11434"),
  OLLAMA_MODEL: z.string().default("qwen3:8b"),
  OLLAMA_TIMEOUT_MS: z.preprocess(
    (value) => (value === undefined ? 180_000 : Number(value)),
    z.number().int().positive(),
  ),
  ENABLE_MESSAGE_CONTENT_INTENT: z.preprocess(
    (value) => (value === undefined ? false : String(value).toLowerCase() === "true"),
    z.boolean(),
  ),
});

export type AppConfig = z.infer<typeof configSchema>;

export const parseConfig = (env: NodeJS.ProcessEnv): AppConfig => {
  return configSchema.parse(env);
};

export const readConfig = (): AppConfig => {
  return parseConfig(process.env);
};
