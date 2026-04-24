import { afterEach, describe, expect, it, vi } from "vitest";
import { OllamaClarifier } from "../src/analysis/ollamaClarifier.js";
import { ClarifyInput } from "../src/domain/types.js";

const makeInput = (): ClarifyInput => ({
  project: {
    id: "project-1",
    scopeId: "scope-1",
    name: "Test Project",
    description: "Project description",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  session: {
    id: "session-1",
    scopeId: "scope-1",
    projectId: "project-1",
    channelId: "channel-1",
    startedBy: "user-1",
    startedAt: "2026-01-01T00:00:00.000Z",
    status: "active",
    repoUsedFlag: false,
  },
  messages: [
    {
      id: "m1",
      sessionId: "session-1",
      authorId: "user-1",
      content: "I want to improve onboarding.",
      timestamp: "2026-01-01T00:01:00.000Z",
    },
  ],
  relevantPastContext: [],
  focus: "onboarding",
});

const mockFetch = (impl: typeof fetch) => {
  vi.stubGlobal("fetch", impl);
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("OllamaClarifier", () => {
  it("normalizes and caps clarifying questions", async () => {
    mockFetch(
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          message: {
            content: JSON.stringify({
              questions: [
                "What is the core user problem?",
                "What is the core user problem? ",
                "",
                "How do we measure success?",
                "Which part is MVP?",
                "What are constraints?",
                "Any dependencies?",
              ],
            }),
          },
        }),
      })) as unknown as typeof fetch,
    );

    const clarifier = new OllamaClarifier({
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen3:8b",
      timeoutMs: 1_000,
    });

    const result = await clarifier.generate(makeInput());
    expect(result.questions).toEqual([
      "What is the core user problem?",
      "How do we measure success?",
      "Which part is MVP?",
      "What are constraints?",
      "Any dependencies?",
    ]);
  });

  it("supports zero-question response", async () => {
    mockFetch(
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          message: {
            content: JSON.stringify({
              questions: [],
            }),
          },
        }),
      })) as unknown as typeof fetch,
    );

    const clarifier = new OllamaClarifier({
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen3:8b",
      timeoutMs: 1_000,
    });

    const result = await clarifier.generate(makeInput());
    expect(result.questions).toEqual([]);
  });

  it("treats malformed JSON payload without question text as zero-question response", async () => {
    mockFetch(
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          message: {
            content: '{"bad":"shape"}',
          },
        }),
      })) as unknown as typeof fetch,
    );

    const clarifier = new OllamaClarifier({
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen3:8b",
      timeoutMs: 1_000,
    });

    const result = await clarifier.generate(makeInput());
    expect(result.questions).toEqual([]);
  });

  it("retries once without format when first chat response is empty", async () => {
    const fetchMock = vi.fn(async (_url, options) => {
      const body = JSON.parse((options as { body: string }).body);
      if (body.format === "json") {
        return {
          ok: true,
          json: async () => ({
            message: {
              content: "",
            },
          }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          message: {
            content: JSON.stringify({
              questions: ["What user outcome matters most here?"],
            }),
          },
        }),
      };
    });
    mockFetch(fetchMock as unknown as typeof fetch);

    const clarifier = new OllamaClarifier({
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen3:8b",
      timeoutMs: 1_000,
    });

    const result = await clarifier.generate(makeInput());
    expect(result.questions).toEqual(["What user outcome matters most here?"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to /api/generate when /api/chat returns empty content", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/api/chat")) {
        return {
          ok: true,
          json: async () => ({
            message: {
              content: "",
            },
          }),
        };
      }

      return {
        ok: true,
        json: async () => ({
          response: JSON.stringify({
            questions: ["What should we prototype first?"],
          }),
        }),
      };
    });
    mockFetch(fetchMock as unknown as typeof fetch);

    const clarifier = new OllamaClarifier({
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen3:8b",
      timeoutMs: 1_000,
    });

    const result = await clarifier.generate(makeInput());
    expect(result.questions).toEqual(["What should we prototype first?"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("salvages questions from non-JSON plain text output", async () => {
    mockFetch(
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          message: {
            content: [
              "Here are a few clarifying questions:",
              "1. Who is the first target user?",
              "2. What success metric should we optimize first?",
              "3. What is out of scope for v1?",
            ].join("\n"),
          },
        }),
      })) as unknown as typeof fetch,
    );

    const clarifier = new OllamaClarifier({
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen3:8b",
      timeoutMs: 1_000,
    });

    const result = await clarifier.generate(makeInput());
    expect(result.questions).toEqual([
      "Who is the first target user?",
      "What success metric should we optimize first?",
      "What is out of scope for v1?",
    ]);
  });

  it("treats non-JSON plain text without questions as zero-question response", async () => {
    mockFetch(
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          message: {
            content: "Context looks clear and aligned with the current goal.",
          },
        }),
      })) as unknown as typeof fetch,
    );

    const clarifier = new OllamaClarifier({
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen3:8b",
      timeoutMs: 1_000,
    });

    const result = await clarifier.generate(makeInput());
    expect(result.questions).toEqual([]);
  });
});
