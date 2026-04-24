import { afterEach, describe, expect, it, vi } from "vitest";
import { Analyzer, AnalysisInput, SessionReport } from "../src/domain/types.js";
import { OllamaAnalyzer } from "../src/analysis/ollamaAnalyzer.js";

const makeInput = (): AnalysisInput => ({
  project: {
    id: "project-1",
    scopeId: "scope-1",
    name: "Test Project",
    description: "Test description",
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
      content: "We should define one clear MVP flow.",
      timestamp: "2026-01-01T00:01:00.000Z",
    },
  ],
  relevantPastContext: [],
});

const makeFallbackAnalyzer = () => {
  const fallbackReport: Omit<SessionReport, "id" | "sessionId"> = {
    sessionGoal: "Fallback goal",
    mainIdeasRaised: ["Fallback idea"],
    patternsThemes: ["Fallback theme"],
    strongestIdeas: ["Fallback strongest"],
    weakPointsConcerns: ["Fallback concern"],
    missingQuestions: ["Fallback question"],
    suggestions: ["Fallback suggestion"],
    relevantPastContext: ["Fallback memory"],
    repoObservations: [],
  };

  const analyze = vi.fn(async () => fallbackReport);
  const analyzer: Analyzer = { analyze };
  return { analyzer, analyze, fallbackReport };
};

const mockFetch = (impl: typeof fetch) => {
  vi.stubGlobal("fetch", impl);
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("OllamaAnalyzer", () => {
  it("uses Ollama response when valid JSON is returned", async () => {
    const { analyzer: fallback, analyze: fallbackAnalyze } = makeFallbackAnalyzer();

    mockFetch(
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          message: {
            content: JSON.stringify({
              sessionGoal: "Use local model summary",
              mainIdeasRaised: ["Idea A"],
              patternsThemes: ["Theme A"],
              strongestIdeas: ["Strongest A"],
              weakPointsConcerns: ["Concern A"],
              missingQuestions: ["Question A"],
              suggestions: ["Suggestion A"],
              relevantPastContext: ["Memory A"],
              repoObservations: [],
            }),
          },
        }),
      })) as unknown as typeof fetch,
    );

    const analyzer = new OllamaAnalyzer({
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen3:8b",
      timeoutMs: 1_000,
      fallbackAnalyzer: fallback,
    });

    const result = await analyzer.analyze(makeInput());

    expect(result.sessionGoal).toBe("Use local model summary");
    expect(result.mainIdeasRaised).toEqual(["Idea A"]);
    expect(fallbackAnalyze).not.toHaveBeenCalled();
  });

  it("falls back when Ollama responds with non-200", async () => {
    const { analyzer: fallback, analyze: fallbackAnalyze, fallbackReport } = makeFallbackAnalyzer();

    mockFetch(
      vi.fn(async () => ({
        ok: false,
        status: 404,
        text: async () => '{"error":"model not found"}',
      })) as unknown as typeof fetch,
    );

    const analyzer = new OllamaAnalyzer({
      baseUrl: "http://127.0.0.1:11434",
      model: "missing-model",
      timeoutMs: 1_000,
      fallbackAnalyzer: fallback,
    });

    const result = await analyzer.analyze(makeInput());
    expect(result).toEqual(fallbackReport);
    expect(fallbackAnalyze).toHaveBeenCalledTimes(1);
  });

  it("falls back when Ollama returns invalid JSON content", async () => {
    const { analyzer: fallback, analyze: fallbackAnalyze, fallbackReport } = makeFallbackAnalyzer();

    mockFetch(
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          message: {
            content: "this is not json",
          },
        }),
      })) as unknown as typeof fetch,
    );

    const analyzer = new OllamaAnalyzer({
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen3:8b",
      timeoutMs: 1_000,
      fallbackAnalyzer: fallback,
    });

    const result = await analyzer.analyze(makeInput());
    expect(result).toEqual(fallbackReport);
    expect(fallbackAnalyze).toHaveBeenCalledTimes(1);
  });
});
