import { describe, expect, it } from "vitest";

const runLive = process.env.RUN_OLLAMA_LIVE === "true";
const testOrSkip = runLive ? it : it.skip;

describe("Ollama live connectivity", () => {
  testOrSkip("connects to local Ollama and runs the configured model", async () => {
    const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
    const model = process.env.OLLAMA_MODEL ?? "qwen3:8b";

    const tagsResponse = await fetch(`${baseUrl}/api/tags`);
    expect(tagsResponse.ok).toBe(true);
    const tagsPayload = (await tagsResponse.json()) as {
      models?: Array<{ name?: string }>;
    };

    const installed = (tagsPayload.models ?? []).some((entry) => entry.name === model);
    expect(installed).toBe(true);

    const chatResponse = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        messages: [
          { role: "system", content: "Return strict JSON with key ok only." },
          { role: "user", content: 'Return {"ok": true}.' },
        ],
      }),
    });

    expect(chatResponse.ok).toBe(true);
    const chatPayload = (await chatResponse.json()) as {
      message?: { content?: string };
    };
    const content = chatPayload.message?.content ?? "";
    expect(content.length).toBeGreaterThan(0);

    const parsed = JSON.parse(content) as { ok?: boolean };
    expect(parsed.ok).toBe(true);
  }, 300_000);
});
