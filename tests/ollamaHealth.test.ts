import { afterEach, describe, expect, it, vi } from "vitest";
import { validateOllamaHealth } from "../src/analysis/ollamaHealth.js";

const mockFetch = (impl: typeof fetch) => {
  vi.stubGlobal("fetch", impl);
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("validateOllamaHealth", () => {
  it("passes when tags endpoint is reachable and model exists", async () => {
    mockFetch(
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          models: [{ name: "qwen3:8b" }],
        }),
      })) as unknown as typeof fetch,
    );

    await expect(
      validateOllamaHealth({
        baseUrl: "http://127.0.0.1:11434",
        model: "qwen3:8b",
        timeoutMs: 1_000,
      }),
    ).resolves.toBeUndefined();
  });

  it("fails with actionable error when configured model is missing", async () => {
    mockFetch(
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          models: [{ name: "llama3.2:3b" }],
        }),
      })) as unknown as typeof fetch,
    );

    await expect(
      validateOllamaHealth({
        baseUrl: "http://127.0.0.1:11434",
        model: "qwen3:8b",
        timeoutMs: 1_000,
      }),
    ).rejects.toThrow("Configured model 'qwen3:8b' was not found on Ollama.");
  });

  it("fails with actionable error when Ollama is unreachable", async () => {
    mockFetch(
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }) as unknown as typeof fetch,
    );

    await expect(
      validateOllamaHealth({
        baseUrl: "http://127.0.0.1:11434",
        model: "qwen3:8b",
        timeoutMs: 1_000,
      }),
    ).rejects.toThrow("Could not reach Ollama at http://127.0.0.1:11434.");
  });
});
