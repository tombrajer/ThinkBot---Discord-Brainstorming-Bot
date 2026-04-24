import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.js";

describe("config timeout", () => {
  it("defaults OLLAMA_TIMEOUT_MS to 180000", () => {
    const config = parseConfig({
      DISCORD_TOKEN: "x",
      DISCORD_CLIENT_ID: "y",
    });

    expect(config.OLLAMA_TIMEOUT_MS).toBe(180000);
  });

  it("uses OLLAMA_TIMEOUT_MS from env", () => {
    const config = parseConfig({
      DISCORD_TOKEN: "x",
      DISCORD_CLIENT_ID: "y",
      OLLAMA_TIMEOUT_MS: "240000",
    });

    expect(config.OLLAMA_TIMEOUT_MS).toBe(240000);
  });
});
