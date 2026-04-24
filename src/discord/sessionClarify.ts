import { Clarifier, Session } from "../domain/types.js";

type ClarifyEngine = {
  getActiveSession(scopeId: string, channelId: string): Promise<Session | undefined>;
  buildClarifyInput(scopeId: string, channelId: string, focus?: string): Promise<Parameters<Clarifier["generate"]>[0]>;
  getSessionClarifyCooldownRemainingMs(
    sessionId: string,
    channelId: string,
    cooldownMs: number,
    nowMs?: number,
  ): Promise<number>;
  markSessionClarifyRun(sessionId: string, channelId: string, atMs?: number): Promise<void>;
};

export type SessionClarifyResult =
  | { kind: "questions"; questions: string[] }
  | { kind: "none" }
  | { kind: "cooldown"; retryAfterSeconds: number }
  | { kind: "error"; message: string };

interface RunSessionClarifyInput {
  engine: ClarifyEngine;
  clarifier: Clarifier;
  scopeId: string;
  channelId: string;
  focus?: string;
  cooldownMs: number;
  nowMs?: number;
}

export const runSessionClarify = async (
  input: RunSessionClarifyInput,
): Promise<SessionClarifyResult> => {
  const nowMs = input.nowMs ?? Date.now();
  const session = await input.engine.getActiveSession(input.scopeId, input.channelId);
  if (!session) {
    return { kind: "error", message: "No session active." };
  }

  const cooldownRemainingMs = await input.engine.getSessionClarifyCooldownRemainingMs(
    session.id,
    input.channelId,
    input.cooldownMs,
    nowMs,
  );
  if (cooldownRemainingMs > 0) {
    return { kind: "cooldown", retryAfterSeconds: Math.ceil(cooldownRemainingMs / 1_000) };
  }

  try {
    const clarifyInput = await input.engine.buildClarifyInput(
      input.scopeId,
      input.channelId,
      input.focus,
    );
    const result = await input.clarifier.generate(clarifyInput);
    await input.engine.markSessionClarifyRun(session.id, input.channelId, nowMs);

    if (result.questions.length === 0) {
      return { kind: "none" };
    }
    return { kind: "questions", questions: result.questions };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown clarification error.";
    return { kind: "error", message };
  }
};
