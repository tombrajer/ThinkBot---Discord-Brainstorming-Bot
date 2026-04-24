import { z } from "zod";
import { Clarifier, ClarifyInput } from "../domain/types.js";
import { parseModelJson } from "./modelJsonParser.js";

interface OllamaClarifierOptions {
  baseUrl: string;
  model: string;
  timeoutMs: number;
}

const clarifyResponseSchema = z.object({
  questions: z.array(z.string()),
});

const withNoTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

const normalizeQuestions = (questions: string[]): string[] => {
  const unique = new Set<string>();
  const output: string[] = [];

  for (const question of questions) {
    const normalized = question.trim();
    if (!normalized) {
      continue;
    }
    const lowered = normalized.toLowerCase();
    if (unique.has(lowered)) {
      continue;
    }
    unique.add(lowered);
    output.push(normalized);
    if (output.length >= 5) {
      break;
    }
  }
  return output;
};

const salvageQuestionsFromPlainText = (content: string): string[] => {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);

  const candidateQuestions = lines
    .filter((line) => line.includes("?"))
    .map((line) => {
      const question = line.match(/([^?]+\?)/)?.[1] ?? line;
      return question.trim();
    });

  if (candidateQuestions.length > 0) {
    return normalizeQuestions(candidateQuestions);
  }

  const sentenceQuestions =
    content
      .replace(/\s+/g, " ")
      .match(/[^?.!]*\?/g)
      ?.map((question) => question.trim()) ?? [];
  return normalizeQuestions(sentenceQuestions);
};

const formatFailure = (error: unknown): Error => {
  const reason = error instanceof Error ? error.message : String(error);
  const shortReason = reason.replace(/\s+/g, " ").trim().slice(0, 220);
  return new Error(`Failed to generate clarifying questions: ${shortReason}`);
};

export class OllamaClarifier implements Clarifier {
  constructor(private readonly options: OllamaClarifierOptions) {}

  async generate(input: ClarifyInput): Promise<{ questions: string[] }> {
    const startedAt = Date.now();
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
          num_predict: 260,
        },
        messages: [
          {
            role: "system",
            content: [
              "Generate clarifying questions for an active brainstorming session.",
              'Return exactly one JSON object with key "questions".',
              '"questions" must be an array of concise strings.',
              "Return 0 to 5 questions based on ambiguity in the context.",
              "If context is already clear, return an empty array.",
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
          throw new Error(`Ollama request failed (${response.status}): ${await response.text()}`);
        }

        const payload = (await response.json()) as Record<string, unknown>;
        const message = payload.message as Record<string, unknown> | undefined;
        const content =
          (typeof payload.response === "string" ? payload.response : undefined) ??
          (typeof message?.content === "string" ? message.content : undefined) ??
          "";
        return { content: content.trim(), payload };
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
              num_predict: 320,
            },
            format: "json",
          }),
        });

        if (!response.ok) {
          throw new Error(`Ollama request failed (${response.status}): ${await response.text()}`);
        }

        const payload = (await response.json()) as Record<string, unknown>;
        const content = typeof payload.response === "string" ? payload.response.trim() : "";
        return { content, payload };
      };

      let { content: rawContent, payload } = await requestChatOnce({ ...requestBase, format: "json" });

      if (!rawContent) {
        console.warn(
          "[clarify] Received empty content from /api/chat with format=json; retrying once without format.",
        );
        ({ content: rawContent, payload } = await requestChatOnce(requestBase));
      }

      if (!rawContent) {
        console.warn(
          "[clarify] Received empty content from /api/chat retries; attempting /api/generate fallback.",
        );
        ({ content: rawContent, payload } = await requestGenerateOnce());
      }

      if (!rawContent) {
        const payloadKeys =
          payload && typeof payload === "object"
            ? Object.keys(payload as Record<string, unknown>).join(", ")
            : "(non-object payload)";
        throw new Error(
          `Ollama returned an empty clarification payload. Payload keys: ${payloadKeys || "(none)"}`,
        );
      }

      console.info(`[clarify] Raw response preview: ${rawContent.replace(/\s+/g, " ").slice(0, 220)}`);

      let questions: string[];
      try {
        const parsed = parseModelJson(rawContent);
        const parsedPreview = JSON.stringify(parsed).replace(/\s+/g, " ").slice(0, 220);
        console.info(`[clarify] Parsed response preview: ${parsedPreview}`);
        const normalizedPayload = Array.isArray(parsed) ? { questions: parsed } : parsed;
        const validated = clarifyResponseSchema.parse(normalizedPayload);
        questions = normalizeQuestions(validated.questions);
      } catch (parseError) {
        const message = parseError instanceof Error ? parseError.message : "Unknown parse error";
        console.warn(
          `[clarify] JSON parse failed, attempting plain-text question salvage. reason=${message}`,
        );
        questions = salvageQuestionsFromPlainText(rawContent);
        if (questions.length === 0) {
          console.warn(
            "[clarify] Plain-text salvage found no question lines; treating as zero-question response.",
          );
          questions = [];
        }
        console.info(`[clarify] Salvaged questions from plain text count=${questions.length}`);
      }

      console.info(`[clarify] Parsed question count=${questions.length}`);
      return { questions };
    } catch (error) {
      requestStatus = "error";
      throw formatFailure(error);
    } finally {
      clearTimeout(timer);
      const durationMs = Date.now() - startedAt;
      console.info(
        `[clarify] Request status=${requestStatus} baseUrl=${baseUrl} model=${this.options.model} timeoutMs=${this.options.timeoutMs} durationMs=${durationMs}`,
      );
    }
  }

  private buildPrompt(input: ClarifyInput): string {
    const sessionMessages = input.messages
      .slice(-50)
      .map((message, index) => `${index + 1}. ${message.authorId}: ${message.content}`)
      .join("\n");

    const memory = input.relevantPastContext
      .slice(-6)
      .map((item, index) => `${index + 1}. ${item.content}`)
      .join("\n");

    return [
      `Project: ${input.project.name}`,
      `Project description: ${input.project.description ?? "N/A"}`,
      `Focus hint: ${input.focus ?? "None provided"}`,
      "",
      "Session messages:",
      sessionMessages || "No captured messages.",
      "",
      "Relevant past context:",
      memory || "No prior context.",
    ].join("\n");
  }
}
