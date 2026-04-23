import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv();

const configSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_GUILD_ID: z.string().optional(),
  DATA_FILE: z.string().default("./data/store.json"),
  ENABLE_MESSAGE_CONTENT_INTENT: z.preprocess(
    (value) => (value === undefined ? false : String(value).toLowerCase() === "true"),
    z.boolean(),
  ),
});

export type AppConfig = z.infer<typeof configSchema>;

export const readConfig = (): AppConfig => {
  return configSchema.parse(process.env);
};
