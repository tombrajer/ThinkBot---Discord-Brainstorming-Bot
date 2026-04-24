import { z } from "zod";
import { AnalysisInput, Analyzer, SessionReport } from "../domain/types.js";
import { parseModelJson } from "./modelJsonParser.js";

const reportSchema = z.object({
  sessionGoal: z.string(),
  mainIdeasRaised: z.array(z.string()).default([]),
  patternsThemes: z.array(z.string()).default([]),
  strongestIdeas: z.array(z.string()).default([]),
  weakPointsConcerns: z.array(z.string()).default([]),
  missingQuestions: z.array(z.string()).default([]),
  suggestions: z.array(z.string()).default([]),
  relevantPastContext: z.array(z.string()).default([]),
  repoObservations: z.array(z.string()).default([]),
});

const ensureNonEmpty = (items: string[], fallback: string): string[] => {
  const cleaned = items.map((item) => item.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : [fallback];
};

const normalizeReport = (
  report: z.infer<typeof reportSchema>,
): Omit<SessionReport, "id" | "sessionId"> => {
  return {
    sessionGoal: report.sessionGoal.trim() || "No clear goal captured.",
    mainIdeasRaised: ensureNonEmpty(report.mainIdeasRaised, "No clear ideas were captured."),
    patternsThemes: ensureNonEmpty(report.patternsThemes, "No clear themes identified."),
    strongestIdeas: ensureNonEmpty(
      report.strongestIdeas,
      "Identify one concrete idea worth validating next.",
    ),
    weakPointsConcerns: ensureNonEmpty(
      report.weakPointsConcerns,
      "Key risks were not clearly discussed in this session.",
    ),
    missingQuestions: ensureNonEmpty(
      report.missingQuestions,
      "What is the narrowest user problem this project must solve first?",
    ),
    suggestions: ensureNonEmpty(
      report.suggestions,
      "Pick one MVP flow and define success metrics before implementation.",
    ),
    relevantPastContext: ensureNonEmpty(
      report.relevantPastContext,
      "No prior project memory found yet.",
    ),
    repoObservations: report.repoObservations.map((item) => item.trim()).filter(Boolean),
  };
};

interface OllamaAnalyzerOptions {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  fallbackAnalyzer: Analyzer;
}

const withNoTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

const formatRequestError = (error: unknown, baseUrl: string, timeoutMs: number): Error => {
  if (
    error instanceof Error &&
    (error.name === "AbortError" || error.message.toLowerCase().includes("aborted"))
  ) {
    return new Error(
      `Ollama timed out after ${timeoutMs}ms. Increase OLLAMA_TIMEOUT_MS or use a smaller model.`,
    );
  }

  if (error instanceof Error && error.message.includes("Failed to fetch")) {
    return new Error(
      [
        `Could not reach Ollama at ${baseUrl}.`,
        "Check OLLAMA_BASE_URL and confirm Ollama is running.",
        "If the app runs in Docker, use http://host.docker.internal:11434.",
      ].join(" "),
    );
  }

  return error instanceof Error ? error : new Error("Unknown Ollama analyzer error.");
};

const formatHttpError = (status: number, body: string, model: string): Error => {
  const loweredBody = body.toLowerCase();

  if (status === 404 && loweredBody.includes("model not found")) {
    return new Error(
      [
        `Ollama model '${model}' was not found.`,
        "Set OLLAMA_MODEL to an exact name from 'ollama list' or pull the model first.",
      ].join(" "),
    );
  }

  if (status === 404) {
    return new Error(
      "Ollama endpoint was not found. Check OLLAMA_BASE_URL and ensure it points to the Ollama API root.",
    );
  }

  if (status === 408 || status === 504 || loweredBody.includes("timed out")) {
    return new Error(
      "Ollama request timed out while the model may still be loading. Increase OLLAMA_TIMEOUT_MS.",
    );
  }

  return new Error(`Ollama request failed (${status}): ${body}`);
};

export class OllamaAnalyzer implements Analyzer {
  constructor(private readonly options: OllamaAnalyzerOptions) {}

  async analyze(input: AnalysisInput): Promise<Omit<SessionReport, "id" | "sessionId">> {
    const startedAt = Date.now();
    try {
      const report = await this.analyzeWithOllama(input);
      return normalizeReport(reportSchema.parse(report));
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      const message =
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : "Unknown analyzer error";
      console.warn(
        `[ollama] Falling back to heuristic analyzer after ${elapsedMs}ms: ${message}`,
      );
      return this.options.fallbackAnalyzer.analyze(input);
    }
  }

  private async analyzeWithOllama(input: AnalysisInput): Promise<unknown> {
    const requestStartedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    const baseUrl = withNoTrailingSlash(this.options.baseUrl);
    let requestStatus = "ok";

    try {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.options.model,
          format: "json",
          stream: false,
          keep_alive: "30m",
          options: {
            temperature: 0.2,
            num_predict: 450,
          },
          messages: [
            {
              role: "system",
              content: [
                "You summarize brainstorming sessions for a Discord bot.",
                "Respond with exactly one JSON object and no markdown.",
                "Do not include code fences, labels, or commentary outside JSON.",
                "Keep each list item short, practical, and specific.",
              ].join(" "),
            },
            {
              role: "user",
              content: this.buildPrompt(input),
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw formatHttpError(response.status, errorBody, this.options.model);
      }

      const payload = (await response.json()) as {
        message?: {
          content?: string;
        };
      };
      const content = payload.message?.content;
      if (!content?.trim()) {
        throw new Error("Ollama returned an empty response.");
      }

      return parseModelJson(content);
    } catch (error) {
      requestStatus = "error";
      throw formatRequestError(error, baseUrl, this.options.timeoutMs);
    } finally {
      clearTimeout(timer);
      const durationMs = Date.now() - requestStartedAt;
      console.info(
        `[ollama] Chat request status=${requestStatus} baseUrl=${baseUrl} model=${this.options.model} timeoutMs=${this.options.timeoutMs} durationMs=${durationMs}`,
      );
    }
  }

  private buildPrompt(input: AnalysisInput): string {
    const sessionMessages = input.messages
      .slice(-50)
      .map(
        (message, index) =>
          `${index + 1}. [${message.timestamp}] ${message.authorId}: ${message.content}`,
      )
      .join("\n");

    const memory = input.relevantPastContext
      .slice(-6)
      .map((item, index) => `${index + 1}. ${item.content}`)
      .join("\n");

    return [
      "Return one JSON object with these keys:",
      "sessionGoal, mainIdeasRaised, patternsThemes, strongestIdeas, weakPointsConcerns, missingQuestions, suggestions, relevantPastContext, repoObservations",
      "Rules:",
      "- Use plain strings only; no markdown formatting.",
      "- Each list key must be an array of concise strings.",
      "- repoObservations should be an empty array unless repo details were explicitly discussed.",
      "- Keep suggestions actionable and realistic.",
      "",
      `Project: ${input.project.name}`,
      `Project description: ${input.project.description ?? "N/A"}`,
      `Linked repository: ${input.project.linkedRepoUrl ?? "N/A"}`,
      `Session started at: ${input.session.startedAt}`,
      "",
      "Session messages:",
      sessionMessages || "No messages captured.",
      "",
      "Relevant past context:",
      memory || "No prior memory.",
    ].join("\n");
  }
}
