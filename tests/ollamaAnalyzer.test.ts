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
    const { analyzer: fallback, analyze: fallbackAnalyze } = makeFallbackAnalyzer();

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
    expect(result.sessionGoal.startsWith("[Fallback: Ollama failed]")).toBe(true);
    expect(result.weakPointsConcerns[0].startsWith("Ollama analysis failed. Reason:")).toBe(true);
    expect(result.suggestions[0]).toBe(
      "Review Ollama logs and bot console output for the exact failure cause.",
    );
    expect(fallbackAnalyze).toHaveBeenCalledTimes(1);
  });

  it("salvages output when Ollama returns invalid JSON content", async () => {
    const { analyzer: fallback, analyze: fallbackAnalyze } = makeFallbackAnalyzer();

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
    expect(result.sessionGoal).toBe("this is not json");
    expect(result.mainIdeasRaised[0]).toBe("this is not json");
    expect(fallbackAnalyze).not.toHaveBeenCalled();
  });

  it("uses root response field when message.content is not present", async () => {
    const { analyzer: fallback, analyze: fallbackAnalyze } = makeFallbackAnalyzer();

    mockFetch(
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          response: JSON.stringify({
            sessionGoal: "Use root response",
            mainIdeasRaised: ["Idea A"],
            patternsThemes: ["Theme A"],
            strongestIdeas: ["Strongest A"],
            weakPointsConcerns: ["Concern A"],
            missingQuestions: ["Question A"],
            suggestions: ["Suggestion A"],
            relevantPastContext: ["Memory A"],
            repoObservations: [],
          }),
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

    expect(result.sessionGoal).toBe("Use root response");
    expect(fallbackAnalyze).not.toHaveBeenCalled();
  });

  it("retries once without format when first response content is empty", async () => {
    const { analyzer: fallback, analyze: fallbackAnalyze } = makeFallbackAnalyzer();

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
              sessionGoal: "Retry succeeded",
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
      };
    });

    mockFetch(fetchMock as unknown as typeof fetch);

    const analyzer = new OllamaAnalyzer({
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen3:8b",
      timeoutMs: 1_000,
      fallbackAnalyzer: fallback,
    });

    const result = await analyzer.analyze(makeInput());

    expect(result.sessionGoal).toBe("Retry succeeded");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fallbackAnalyze).not.toHaveBeenCalled();
  });

  it("coerces sessionGoal array and scalar list fields without fallback", async () => {
    const { analyzer: fallback, analyze: fallbackAnalyze } = makeFallbackAnalyzer();

    mockFetch(
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          message: {
            content: JSON.stringify({
              sessionGoal: ["Primary goal", "Secondary goal"],
              mainIdeasRaised: "Single idea",
              patternsThemes: ["Theme A"],
              strongestIdeas: "Strongest A",
              weakPointsConcerns: "Concern A",
              missingQuestions: "Question A",
              suggestions: "Suggestion A",
              relevantPastContext: "Memory A",
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

    expect(result.sessionGoal).toBe("Primary goal");
    expect(result.mainIdeasRaised).toEqual(["Single idea"]);
    expect(result.strongestIdeas).toEqual(["Strongest A"]);
    expect(fallbackAnalyze).not.toHaveBeenCalled();
  });

  it("salvages plain-text model output instead of falling back", async () => {
    const { analyzer: fallback, analyze: fallbackAnalyze } = makeFallbackAnalyzer();

    mockFetch(
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          message: {
            content: [
              "Session goal: define MVP onboarding.",
              "Main idea: keep signup under 30 seconds.",
              "Next step: suggest one measurable success metric.",
            ].join("\n"),
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

    expect(result.sessionGoal).toBe("Session goal: define MVP onboarding.");
    expect(result.mainIdeasRaised[0]).toBe("Session goal: define MVP onboarding.");
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(fallbackAnalyze).not.toHaveBeenCalled();
  });
});
