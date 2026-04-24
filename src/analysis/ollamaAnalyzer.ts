import { z } from "zod";
import { AnalysisInput, Analyzer, SessionReport } from "../domain/types.js";
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

const ensureNonEmpty = (items: string[], fallback: string): string[] => {
  const cleaned = items.map((item) => item.trim()).filter(Boolean);
  return cleaned.length > 0 ? cleaned : [fallback];
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
      "Pick one MVP flow and define success metrics before implementation.",
    ),
    relevantPastContext: ["No prior project memory found yet."],
    repoObservations: [],
  };
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

const withFallbackNotice = (
  report: Omit<SessionReport, "id" | "sessionId">,
  reason: string,
): Omit<SessionReport, "id" | "sessionId"> => {
  const prefix = "[Fallback: Ollama failed]";
  const details = reason.trim() || "Unknown error";

  return {
    ...report,
    sessionGoal: `${prefix} ${report.sessionGoal}`.trim(),
    weakPointsConcerns: ensureNonEmpty(
      [`Ollama analysis failed. Reason: ${details}`, ...report.weakPointsConcerns],
      "Key risks were not clearly discussed in this session.",
    ),
    suggestions: ensureNonEmpty(
      [
        "Review Ollama logs and bot console output for the exact failure cause.",
        ...report.suggestions,
      ],
      "Pick one MVP flow and define success metrics before implementation.",
    ),
  };
};

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
        `[ollama] Falling back to heuristic analyzer after ${elapsedMs}ms: ${message}`,
      );
      const fallbackReport = await this.options.fallbackAnalyzer.analyze(input);
      return withFallbackNotice(fallbackReport, message);
    }
  }

  private async analyzeWithOllama(input: AnalysisInput): Promise<unknown> {
    const requestStartedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    const baseUrl = withNoTrailingSlash(this.options.baseUrl);
    let requestStatus = "ok";

    try {
      const userPrompt = this.buildPrompt(input);
      const requestBase = {
        model: this.options.model,
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
              num_predict: 450,
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
        return parsed;
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
