import { z } from "zod";
import {
  AnalysisInput,
  Analyzer,
  BrainstormReport,
  ProjectContextInput,
  ProjectBrainSuggestionInput,
  ProjectBrainSuggestionOutput,
  ProjectSummaryReport,
  SessionReport,
} from "../domain/types.js";
import { parseModelJson } from "./modelJsonParser.js";

const coerceToString = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const first = value
      .map((item) => coerceToString(item).trim())
      .find((item) => item.length > 0);
    return first ?? "";
  }
  return "";
};

const coerceToStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => coerceToString(item).trim())
      .filter(Boolean);
  }

  const single = coerceToString(value).trim();
  return single ? [single] : [];
};

const reportSchema = z.object({
  sessionGoal: z.preprocess((value) => coerceToString(value), z.string()),
  mainIdeasRaised: z.preprocess((value) => coerceToStringArray(value), z.array(z.string())).default([]),
  patternsThemes: z.preprocess((value) => coerceToStringArray(value), z.array(z.string())).default([]),
  strongestIdeas: z.preprocess((value) => coerceToStringArray(value), z.array(z.string())).default([]),
  weakPointsConcerns: z.preprocess((value) => coerceToStringArray(value), z.array(z.string())).default([]),
  missingQuestions: z.preprocess((value) => coerceToStringArray(value), z.array(z.string())).default([]),
  suggestions: z.preprocess((value) => coerceToStringArray(value), z.array(z.string())).default([]),
  relevantPastContext: z.preprocess((value) => coerceToStringArray(value), z.array(z.string())).default([]),
  repoObservations: z.preprocess((value) => coerceToStringArray(value), z.array(z.string())).default([]),
});

const projectBrainSuggestionSchema = z.object({
  description: z.preprocess((value) => coerceToString(value), z.string()).default(""),
  mainGoal: z.preprocess((value) => coerceToString(value), z.string()).default(""),
  targetUsers: z.preprocess((value) => coerceToStringArray(value), z.array(z.string())).default([]),
  problemsSolved: z.preprocess((value) => coerceToStringArray(value), z.array(z.string())).default([]),
  ideas: z.preprocess((value) => coerceToStringArray(value), z.array(z.string())).default([]),
  constraints: z.preprocess((value) => coerceToStringArray(value), z.array(z.string())).default([]),
  techStack: z.preprocess((value) => coerceToStringArray(value), z.array(z.string())).default([]),
  decisions: z.preprocess((value) => coerceToStringArray(value), z.array(z.string())).default([]),
  notes: z.preprocess((value) => coerceToString(value), z.string()).default(""),
});

const projectSummarySchema = z.object({
  currentDirection: z.preprocess((value) => coerceToString(value), z.string()),
  importantThemes: z.preprocess((value) => coerceToStringArray(value), z.array(z.string())).default([]),
  recentChanges: z.preprocess((value) => coerceToStringArray(value), z.array(z.string())).default([]),
  openIssues: z.preprocess((value) => coerceToStringArray(value), z.array(z.string())).default([]),
  currentNextFocus: z.preprocess((value) => coerceToStringArray(value), z.array(z.string())).default([]),
  relevantPastContext: z.preprocess((value) => coerceToStringArray(value), z.array(z.string())).default([]),
  repoObservations: z.preprocess((value) => coerceToStringArray(value), z.array(z.string())).default([]),
});

const brainstormSchema = z.object({
  coreIdeas: z.preprocess((value) => coerceToStringArray(value), z.array(z.string())).default([]),
  variationsTwists: z.preprocess((value) => coerceToStringArray(value), z.array(z.string())).default([]),
  gapsRisks: z.preprocess((value) => coerceToStringArray(value), z.array(z.string())).default([]),
  nextSteps: z.preprocess((value) => coerceToStringArray(value), z.array(z.string())).default([]),
  assumptions: z.preprocess((value) => coerceToStringArray(value), z.array(z.string())).default([]),
  repoObservations: z.preprocess((value) => coerceToStringArray(value), z.array(z.string())).default([]),
});

const ensureNonEmpty = (items: string[], fallback: string): string[] => {
  const cleaned = items.map((item) => item.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : [fallback];
};

const toTitleCase = (value: string): string =>
  value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const pickTopic = (candidates: string[], fallback: string): string => {
  const topic = candidates
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate.length > 2);
  return topic ? toTitleCase(topic.slice(0, 72)) : fallback;
};

const isStructuredSuggestion = (value: string): boolean =>
  /Idea:/i.test(value) &&
  /Features:/i.test(value) &&
  /Implementation:/i.test(value) &&
  /Creative twist:/i.test(value);

const toDetailedSuggestion = (seed: string, topic: string): string => {
  const cleanedSeed = seed.replace(/\s+/g, " ").trim();
  const idea = cleanedSeed.length > 12
    ? cleanedSeed.replace(/^idea:\s*/i, "").slice(0, 150)
    : `Build a focused "${topic}" loop`;
  return [
    `Idea: ${idea}.`,
    `Features: clear user trigger, guided step-by-step flow, and a visible output artifact users can refine.`,
    `Implementation: add one command path, persist per-project state, and wire concise status updates so each action has a measurable result.`,
    `Creative twist: include a randomized challenge mode that reframes the same idea from a different user persona each run.`,
  ].join(" ");
};

const ensureDetailedSuggestions = (
  suggestions: string[],
  contextTopics: string[],
): string[] => {
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const suggestion of suggestions) {
    const cleaned = suggestion.replace(/\s+/g, " ").trim();
    if (!cleaned) {
      continue;
    }
    const key = cleaned.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(cleaned);
  }

  const topicPool = contextTopics.filter(Boolean);
  const detailed = deduped.map((suggestion, index) => {
    if (isStructuredSuggestion(suggestion) && suggestion.length >= 120) {
      return suggestion;
    }
    const topic = pickTopic([topicPool[index] ?? "", topicPool[0] ?? ""], "Core User Problem");
    return toDetailedSuggestion(suggestion, topic);
  });

  if (detailed.length >= 4) {
    return detailed.slice(0, 6);
  }

  const fillerTopics = [
    pickTopic([topicPool[0] ?? ""], "User Onboarding"),
    pickTopic([topicPool[1] ?? ""], "Idea Prioritization"),
    pickTopic([topicPool[2] ?? ""], "Experiment Tracking"),
    pickTopic([topicPool[3] ?? ""], "Feedback Loop"),
  ];
  const filler = fillerTopics.map((topic) => toDetailedSuggestion("", topic));
  for (const suggestion of filler) {
    if (detailed.length >= 4) {
      break;
    }
    if (!detailed.includes(suggestion)) {
      detailed.push(suggestion);
    }
  }

  return detailed.slice(0, 6);
};

const toNormalizedLines = (content: string): string[] =>
  content
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*\d.)]+\s*/, "").trim())
    .filter(Boolean);

const buildReportFromPlainText = (content: string): Omit<SessionReport, "id" | "sessionId"> => {
  const lines = toNormalizedLines(content);
  const first = lines[0] ?? "No clear goal captured.";
  const suggestions = lines
    .filter((line) => /\b(suggest|recommend|next|should|action|todo)\b/i.test(line))
    .slice(0, 4);

  return {
    sessionGoal: first,
    mainIdeasRaised: ensureNonEmpty(lines.slice(0, 5), "No clear ideas were captured."),
    patternsThemes: ensureNonEmpty(lines.slice(0, 3), "No clear themes identified."),
    strongestIdeas: ensureNonEmpty(
      [lines[0] ?? ""],
      "Identify one concrete idea worth validating next.",
    ),
    weakPointsConcerns: ["Model response was non-JSON; concerns were inferred from plain text."],
    missingQuestions: ["What is the narrowest user problem this project must solve first?"],
    suggestions: ensureNonEmpty(
      suggestions,
      "Idea: ship one narrow feature lane. Features: clear user trigger + visible result + memory hook. Implementation: isolate command, persistence, and report formatting. Creative twist: add one surprising but low-cost variant for testing.",
    ),
    relevantPastContext: ["No prior project memory found yet."],
    repoObservations: [],
  };
};

const buildReportFromArray = (items: unknown[]): Omit<SessionReport, "id" | "sessionId"> => {
  const lines = items
    .map((item) => coerceToString(item).trim())
    .filter(Boolean);
  return buildReportFromPlainText(lines.join("\n"));
};

const normalizeReport = (
  report: z.infer<typeof reportSchema>,
): Omit<SessionReport, "id" | "sessionId"> => {
  const contextTopics = [
    ...report.mainIdeasRaised,
    ...report.patternsThemes,
    ...report.strongestIdeas,
    report.sessionGoal,
  ];
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
    suggestions: ensureDetailedSuggestions(
      ensureNonEmpty(
        report.suggestions,
        "Idea: ship one narrow feature lane. Features: clear user trigger + visible result + memory hook. Implementation: isolate command, persistence, and report formatting. Creative twist: add one surprising but low-cost variant for testing.",
      ),
      contextTopics,
    ),
    relevantPastContext: ensureNonEmpty(
      report.relevantPastContext,
      "No prior project memory found yet.",
    ),
    repoObservations: report.repoObservations.map((item) => item.trim()).filter(Boolean),
  };
};

const buildFailureReport = (reason: string): Omit<SessionReport, "id" | "sessionId"> => {
  const details = reason.trim() || "Unknown error";
  const shortReason = details.replace(/\s+/g, " ").slice(0, 220);
  const failureMessage = `Failed to generate analysis via Ollama: ${shortReason}`;

  return {
    sessionGoal: failureMessage,
    mainIdeasRaised: [failureMessage],
    patternsThemes: ["Analysis unavailable due to model/provider error."],
    strongestIdeas: ["No model output was returned."],
    weakPointsConcerns: [failureMessage],
    missingQuestions: ["Please retry /end-session after fixing Ollama connectivity/model output."],
    suggestions: ["Check Ollama logs and bot console logs, then retry /end-session."],
    relevantPastContext: ["No fallback analysis generated."],
    repoObservations: [],
  };
};

const normalizeProjectBrainSuggestions = (
  suggestions: z.infer<typeof projectBrainSuggestionSchema>,
): ProjectBrainSuggestionOutput => ({
  description: suggestions.description.trim(),
  mainGoal: suggestions.mainGoal.trim(),
  targetUsers: suggestions.targetUsers.map((item) => item.trim()).filter(Boolean),
  problemsSolved: suggestions.problemsSolved.map((item) => item.trim()).filter(Boolean),
  ideas: suggestions.ideas.map((item) => item.trim()).filter(Boolean),
  constraints: suggestions.constraints.map((item) => item.trim()).filter(Boolean),
  techStack: suggestions.techStack.map((item) => item.trim()).filter(Boolean),
  decisions: suggestions.decisions.map((item) => item.trim()).filter(Boolean),
  notes: suggestions.notes.trim(),
});

const normalizeProjectSummary = (
  report: z.infer<typeof projectSummarySchema>,
): ProjectSummaryReport => ({
  currentDirection: report.currentDirection.trim() || "No clear current direction captured.",
  importantThemes: ensureNonEmpty(report.importantThemes, "No clear themes identified."),
  recentChanges: ensureNonEmpty(report.recentChanges, "No recent changes were captured."),
  openIssues: ensureNonEmpty(report.openIssues, "No open issues were called out."),
  currentNextFocus: ensureNonEmpty(
    report.currentNextFocus,
    "Define the next concrete project move before expanding scope.",
  ),
  relevantPastContext: ensureNonEmpty(
    report.relevantPastContext,
    "No prior project memory found yet.",
  ),
  repoObservations: report.repoObservations.map((item) => item.trim()).filter(Boolean),
});

const normalizeBrainstorm = (
  report: z.infer<typeof brainstormSchema>,
): BrainstormReport => ({
  coreIdeas: ensureNonEmpty(report.coreIdeas, "Define one narrow feature worth validating."),
  variationsTwists: ensureNonEmpty(
    report.variationsTwists,
    "Try a smaller first-version variation before committing to a broader build.",
  ),
  gapsRisks: ensureNonEmpty(
    report.gapsRisks,
    "The idea still needs a sharper boundary to avoid expanding too quickly.",
  ),
  nextSteps: ensureNonEmpty(
    report.nextSteps,
    "Pick the smallest buildable slice and define how to judge success.",
  ),
  assumptions: report.assumptions.map((item) => item.trim()).filter(Boolean),
  repoObservations: report.repoObservations.map((item) => item.trim()).filter(Boolean),
});

interface OllamaAnalyzerOptions {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  fallbackAnalyzer: Analyzer;
}

const extractModelContent = (payload: unknown): string => {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const root = payload as Record<string, unknown>;

  const rootResponse = root.response;
  if (typeof rootResponse === "string" && rootResponse.trim()) {
    return rootResponse;
  }

  const outputText = root.output_text;
  if (typeof outputText === "string" && outputText.trim()) {
    return outputText;
  }

  const message = root.message;
  if (!message || typeof message !== "object") {
    return "";
  }

  const msg = message as Record<string, unknown>;
  const directFields = ["content", "response", "text"];
  for (const field of directFields) {
    const value = msg[field];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  const contentParts = msg.content;
  if (Array.isArray(contentParts)) {
    const joined = contentParts
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part === "object") {
          const text = (part as Record<string, unknown>).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .join("\n")
      .trim();
    if (joined) {
      return joined;
    }
  }

  return "";
};

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
        `[ollama] Returning short failure report after ${elapsedMs}ms: ${message}`,
      );
      return buildFailureReport(message);
    }
  }

  async summarizeProject(input: ProjectContextInput): Promise<ProjectSummaryReport> {
    const startedAt = Date.now();
    try {
      const content = await this.requestOllamaJsonContent(
        this.buildProjectSummaryPrompt(input),
        [
          "You summarize the current state of a project for a Discord bot.",
          "Return exactly one JSON object and no markdown.",
          "Be concise, practical, and project-specific.",
          "Do not drift into generic ideation.",
        ].join(" "),
      );
      const parsed = parseModelJson(content);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Project summary response was not an object.");
      }
      return normalizeProjectSummary(projectSummarySchema.parse(parsed));
    } catch (error) {
      const message =
        error instanceof Error ? `${error.name}: ${error.message}` : "Unknown analyzer error";
      console.warn(
        `[ollama] Falling back to heuristic project summary after ${Date.now() - startedAt}ms: ${message}`,
      );
      return this.options.fallbackAnalyzer.summarizeProject(input);
    }
  }

  async brainstormProject(input: ProjectContextInput): Promise<BrainstormReport> {
    const startedAt = Date.now();
    try {
      const content = await this.requestOllamaJsonContent(
        this.buildBrainstormPrompt(input),
        [
          "You are an AI brainstorming partner inside a Discord bot.",
          "Return exactly one JSON object and no markdown.",
          "Help the user think better, not just more.",
          "Be practical, concise, grounded, and specific.",
          "Avoid generic filler and avoid follow-up questions unless absolutely necessary.",
        ].join(" "),
      );
      const parsed = parseModelJson(content);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Brainstorm response was not an object.");
      }
      return normalizeBrainstorm(brainstormSchema.parse(parsed));
    } catch (error) {
      const message =
        error instanceof Error ? `${error.name}: ${error.message}` : "Unknown analyzer error";
      console.warn(
        `[ollama] Falling back to heuristic brainstorm after ${Date.now() - startedAt}ms: ${message}`,
      );
      return this.options.fallbackAnalyzer.brainstormProject(input);
    }
  }

  async suggestProjectBrain(
    input: ProjectBrainSuggestionInput,
  ): Promise<ProjectBrainSuggestionOutput> {
    const startedAt = Date.now();
    try {
      const content = await this.requestOllamaJsonContent(
        this.buildProjectBrainPrompt(input),
        [
          "You improve project setup drafts for a Discord brainstorming bot.",
          "Return exactly one JSON object and no markdown.",
          "For fields the user already filled, rewrite them more clearly while preserving meaning.",
          "For missing or weak fields, provide short practical fill-ins.",
          "Use short, practical suggestions.",
          "Never invent hard facts such as confirmed deadlines, repositories, or exact tech stacks.",
          "Do not add 'suggestion:' labels or commentary inside field values.",
        ].join(" "),
      );
      const parsed = parseModelJson(content);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("Project brain suggestion response was not an object.");
      }
      return normalizeProjectBrainSuggestions(
        projectBrainSuggestionSchema.parse(parsed),
      );
    } catch (error) {
      const message =
        error instanceof Error ? `${error.name}: ${error.message}` : "Unknown analyzer error";
      console.warn(
        `[ollama] Falling back to heuristic project suggestions after ${Date.now() - startedAt}ms: ${message}`,
      );
      return this.options.fallbackAnalyzer.suggestProjectBrain(input);
    }
  }

  private async analyzeWithOllama(input: AnalysisInput): Promise<unknown> {
    const content = await this.requestOllamaJsonContent(
      this.buildPrompt(input),
      [
        "You summarize brainstorming sessions for a Discord bot.",
        "Respond with exactly one JSON object and no markdown.",
        "Do not include code fences, labels, or commentary outside JSON.",
        "Be practical, specific, and idea-generative.",
        "Suggestions must contain concrete implementation directions and novel feature ideas, not generic advice.",
      ].join(" "),
    );

    const rawPreview = content.replace(/\s+/g, " ").slice(0, 240);
    console.info(`[ollama] Raw response preview: ${rawPreview}`);

    try {
      const parsed = parseModelJson(content);
      let parsedPreview = "";
      try {
        parsedPreview = JSON.stringify(parsed).replace(/\s+/g, " ").slice(0, 240);
      } catch {
        parsedPreview = "(unable to serialize parsed preview)";
      }
      console.info(`[ollama] Parsed response preview: ${parsedPreview}`);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
      if (Array.isArray(parsed)) {
        console.warn(
          "[ollama] Parsed JSON root is an array; coercing array content into report shape.",
        );
        return buildReportFromArray(parsed);
      }
      console.warn(
        "[ollama] Parsed JSON root is not an object; coercing raw response into report shape.",
      );
      return buildReportFromPlainText(content);
    } catch (parseError) {
      const message = parseError instanceof Error ? parseError.message : "Unknown parse error";
      console.warn(
        `[ollama] JSON parse failed, using plain-text salvage path. reason=${message}`,
      );
      const salvaged = buildReportFromPlainText(content);
      const salvagedPreview = JSON.stringify(salvaged).replace(/\s+/g, " ").slice(0, 240);
      console.info(`[ollama] Salvaged response preview: ${salvagedPreview}`);
      return salvaged;
    }
  }

  private async requestOllamaJsonContent(userPrompt: string, systemPrompt: string): Promise<string> {
    const requestStartedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    const baseUrl = withNoTrailingSlash(this.options.baseUrl);
    let requestStatus = "ok";

    try {
      const requestBase = {
        model: this.options.model,
        stream: false,
        keep_alive: "30m",
        options: {
          temperature: 0.35,
          num_predict: 700,
        },
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: userPrompt,
          },
        ],
      };

      const requestChatOnce = async (
        requestBody: object,
      ): Promise<{ content: string; payload: unknown }> => {
        const response = await fetch(`${baseUrl}/api/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw formatHttpError(response.status, errorBody, this.options.model);
        }

        const payload = (await response.json()) as unknown;
        const content = extractModelContent(payload).trim();
        return { content, payload };
      };

      const requestGenerateOnce = async (): Promise<{ content: string; payload: unknown }> => {
        const response = await fetch(`${baseUrl}/api/generate`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            model: this.options.model,
            prompt: userPrompt,
            stream: false,
            keep_alive: "30m",
            options: {
              temperature: 0.2,
              num_predict: 700,
            },
            format: "json",
          }),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw formatHttpError(response.status, errorBody, this.options.model);
        }

        const payload = (await response.json()) as unknown;
        const root = payload && typeof payload === "object"
          ? (payload as Record<string, unknown>)
          : undefined;
        const responseText = typeof root?.response === "string" ? root.response.trim() : "";
        return { content: responseText, payload };
      };

      let { content, payload } = await requestChatOnce({ ...requestBase, format: "json" });

      if (!content) {
        console.warn(
          "[ollama] Received empty content from /api/chat with format=json; retrying once without format.",
        );
        ({ content, payload } = await requestChatOnce(requestBase));
      }

      if (!content) {
        console.warn(
          "[ollama] Received empty content from /api/chat retries; attempting /api/generate fallback.",
        );
        ({ content, payload } = await requestGenerateOnce());
      }

      if (!content) {
        const payloadKeys =
          payload && typeof payload === "object"
            ? Object.keys(payload as Record<string, unknown>).join(", ")
            : "(non-object payload)";
        throw new Error(`Ollama returned an empty response. Payload keys: ${payloadKeys || "(none)"}`);
      }

      return content;
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
      "- suggestions should contain 4-6 concrete idea proposals.",
      '- each suggestions item should follow this shape: "Idea: ... Features: ... Implementation: ... Creative twist: ...".',
      "- avoid generic filler like 'keep iterating' without concrete feature or implementation detail.",
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

  private buildProjectBrainPrompt(input: ProjectBrainSuggestionInput): string {
    return [
      "Return one JSON object with these keys:",
      "description, mainGoal, targetUsers, problemsSolved, ideas, constraints, techStack, decisions, notes",
      "Rules:",
      "- Use plain strings and arrays of strings only.",
      "- If the user already provided a field, rewrite it more clearly while preserving the same meaning.",
      "- Keep suggestions concise, practical, and safe to mark as suggestions.",
      "- Do not invent exact deadlines, repositories, metrics, or confirmed technologies.",
      "",
      `Project name: ${input.projectName}`,
      `Description: ${input.userInput.description || "missing"}`,
      `Main goal: ${input.userInput.mainGoal || "missing"}`,
      `Target users: ${input.userInput.targetUsers.join("; ") || "missing"}`,
      `Problems solved: ${input.userInput.problemsSolved.join("; ") || "missing"}`,
      `Ideas: ${input.userInput.ideas.join("; ") || "missing"}`,
      `Constraints: ${input.userInput.constraints.join("; ") || "missing"}`,
      `Tech stack: ${input.userInput.techStack.join("; ") || "missing"}`,
      `Decisions: ${input.userInput.decisions.join("; ") || "missing"}`,
      `Notes: ${input.userInput.notes || "missing"}`,
    ].join("\n");
  }

  private buildProjectSummaryPrompt(input: ProjectContextInput): string {
    const messageLines = input.messages
      .slice(-30)
      .map(
        (message, index) =>
          `${index + 1}. [${message.timestamp}] ${message.authorId}: ${message.content}`,
      )
      .join("\n");
    const memoryLines = input.relevantPastContext
      .slice(-8)
      .map((item, index) => `${index + 1}. ${item.content}`)
      .join("\n");

    return [
      "Return one JSON object with these keys:",
      "currentDirection, importantThemes, recentChanges, openIssues, currentNextFocus, relevantPastContext, repoObservations",
      "Rules:",
      "- Use plain strings and arrays of strings only.",
      "- Summarize the project state, not a brainstorming session.",
      "- Mention recent discussion when it materially changes the state of the project.",
      "- Keep each item concise and Discord-friendly.",
      "",
      `Project: ${input.project.name}`,
      `Description: ${input.project.description ?? "N/A"}`,
      `Linked repository: ${input.project.linkedRepoUrl ?? "N/A"}`,
      `Brain description: ${input.project.brain?.description?.value ?? "N/A"}`,
      `Brain goal: ${input.project.brain?.mainGoal?.value ?? "N/A"}`,
      `Brain ideas: ${input.project.brain?.ideas?.value?.join("; ") ?? "N/A"}`,
      `Brain constraints: ${input.project.brain?.constraints?.value?.join("; ") ?? "N/A"}`,
      `Brain tech stack: ${input.project.brain?.techStack?.value?.join("; ") ?? "N/A"}`,
      `Brain decisions: ${input.project.brain?.decisions?.value?.join("; ") ?? "N/A"}`,
      `Brain notes: ${input.project.brain?.notes?.value ?? "N/A"}`,
      "",
      "Recent discussion:",
      messageLines || "No recent discussion captured.",
      "",
      "Relevant past context:",
      memoryLines || "No prior project memory.",
    ].join("\n");
  }

  private buildBrainstormPrompt(input: ProjectContextInput): string {
    const messageLines = input.messages
      .slice(-30)
      .map(
        (message, index) =>
          `${index + 1}. [${message.timestamp}] ${message.authorId}: ${message.content}`,
      )
      .join("\n");
    const memoryLines = input.relevantPastContext
      .slice(-8)
      .map((item, index) => `${index + 1}. ${item.content}`)
      .join("\n");

    return [
      "Return one JSON object with these keys:",
      "coreIdeas, variationsTwists, gapsRisks, nextSteps, assumptions, repoObservations",
      "Rules:",
      "- Use plain strings and arrays of strings only.",
      "- Provide 3-7 coreIdeas, 2-4 variationsTwists, concise gapsRisks, and actionable nextSteps.",
      "- Do not ask follow-up questions unless absolutely necessary.",
      "- Avoid generic advice and avoid repeating the user's input verbatim.",
      "- Keep the response grounded and practical.",
      "",
      `Project: ${input.project.name}`,
      `Description: ${input.project.description ?? "N/A"}`,
      `Linked repository: ${input.project.linkedRepoUrl ?? "N/A"}`,
      `Brain goal: ${input.project.brain?.mainGoal?.value ?? "N/A"}`,
      `Brain ideas: ${input.project.brain?.ideas?.value?.join("; ") ?? "N/A"}`,
      `Brain constraints: ${input.project.brain?.constraints?.value?.join("; ") ?? "N/A"}`,
      `Brain tech stack: ${input.project.brain?.techStack?.value?.join("; ") ?? "N/A"}`,
      `Brain decisions: ${input.project.brain?.decisions?.value?.join("; ") ?? "N/A"}`,
      `Brain notes: ${input.project.brain?.notes?.value ?? "N/A"}`,
      `Current user input: ${input.currentInput?.trim() || "none provided"}`,
      "",
      "Recent discussion:",
      messageLines || "No recent discussion captured.",
      "",
      "Relevant past context:",
      memoryLines || "No prior project memory.",
    ].join("\n");
  }
}
