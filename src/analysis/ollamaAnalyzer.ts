import { z } from "zod";
import { AnalysisInput, Analyzer, SessionReport } from "../domain/types.js";

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

const extractJsonObject = (content: string): unknown => {
  const direct = content.trim();
  if (direct.startsWith("{") && direct.endsWith("}")) {
    return JSON.parse(direct);
  }

  const fenced = content.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return JSON.parse(fenced[1].trim());
  }

  const objectMatch = content.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) {
    return JSON.parse(objectMatch[0]);
  }

  throw new Error("No JSON object found in Ollama response.");
};

interface OllamaAnalyzerOptions {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  fallbackAnalyzer: Analyzer;
}

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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const response = await fetch(`${this.options.baseUrl}/api/chat`, {
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
            num_predict: 900,
          },
          messages: [
            {
              role: "system",
              content: [
                "You are a Discord brainstorming analysis bot.",
                "Return output as strict JSON only.",
                "Do not include markdown.",
                "Keep analysis concise, practical, and critical when needed.",
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
        throw new Error(`Ollama request failed (${response.status}): ${errorBody}`);
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

      return extractJsonObject(content);
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "AbortError" || error.message.toLowerCase().includes("aborted"))
      ) {
        throw new Error(
          `Ollama timed out after ${this.options.timeoutMs}ms. Increase OLLAMA_TIMEOUT_MS or use a smaller model.`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private buildPrompt(input: AnalysisInput): string {
    const sessionMessages = input.messages
      .slice(-80)
      .map(
        (message, index) =>
          `${index + 1}. [${message.timestamp}] ${message.authorId}: ${message.content}`,
      )
      .join("\n");

    const memory = input.relevantPastContext
      .slice(-8)
      .map((item, index) => `${index + 1}. ${item.content}`)
      .join("\n");

    return [
      "Analyze this brainstorming session and return JSON with these keys:",
      "sessionGoal, mainIdeasRaised, patternsThemes, strongestIdeas, weakPointsConcerns, missingQuestions, suggestions, relevantPastContext, repoObservations",
      "Rules:",
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
