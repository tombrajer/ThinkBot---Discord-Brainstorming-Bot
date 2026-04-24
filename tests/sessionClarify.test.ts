import { describe, expect, it, vi } from "vitest";
import { runSessionClarify } from "../src/discord/sessionClarify.js";
import { ClarifyInput, Clarifier, Session } from "../src/domain/types.js";

const makeClarifyInput = (): ClarifyInput => ({
  project: {
    id: "p1",
    scopeId: "s1",
    name: "Test",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  session: {
    id: "sess-1",
    scopeId: "s1",
    projectId: "p1",
    channelId: "c1",
    startedBy: "u1",
    startedAt: "2026-01-01T00:00:00.000Z",
    status: "active",
    repoUsedFlag: false,
  },
  messages: [],
  relevantPastContext: [],
  focus: undefined,
});

const makeEngineMock = () => {
  const session: Session = {
    id: "sess-1",
    scopeId: "s1",
    projectId: "p1",
    channelId: "c1",
    startedBy: "u1",
    startedAt: "2026-01-01T00:00:00.000Z",
    status: "active",
    repoUsedFlag: false,
  };

  const getActiveSession = vi.fn(async () => session as Session | undefined);

  return {
    getActiveSession,
    buildClarifyInput: vi.fn(async () => makeClarifyInput()),
    getSessionClarifyCooldownRemainingMs: vi.fn(async () => 0),
    markSessionClarifyRun: vi.fn(async () => undefined),
  };
};

describe("runSessionClarify", () => {
  it("returns questions for active session", async () => {
    const engine = makeEngineMock();
    const clarifier: Clarifier = {
      generate: vi.fn(async () => ({
        questions: ["What is your primary user?", "How will you measure success?"],
      })),
    };

    const result = await runSessionClarify({
      engine,
      clarifier,
      scopeId: "s1",
      channelId: "c1",
      focus: "onboarding",
      cooldownMs: 60_000,
    });

    expect(result.kind).toBe("questions");
    if (result.kind !== "questions") {
      throw new Error("Expected questions result");
    }
    expect(result.questions).toHaveLength(2);
    expect(engine.buildClarifyInput).toHaveBeenCalledWith("s1", "c1", "onboarding");
    expect(engine.markSessionClarifyRun).toHaveBeenCalledTimes(1);
  });

  it("returns error when no active session exists", async () => {
    const engine = makeEngineMock();
    engine.getActiveSession.mockImplementation(async () => undefined);
    const clarifier: Clarifier = {
      generate: vi.fn(async () => ({ questions: ["x"] })),
    };

    const result = await runSessionClarify({
      engine,
      clarifier,
      scopeId: "s1",
      channelId: "c1",
      cooldownMs: 60_000,
    });

    expect(result.kind).toBe("error");
    if (result.kind !== "error") {
      throw new Error("Expected error result");
    }
    expect(result.message).toBe("No session active.");
    expect(engine.buildClarifyInput).not.toHaveBeenCalled();
  });

  it("returns cooldown response when command is run too soon", async () => {
    const engine = makeEngineMock();
    engine.getSessionClarifyCooldownRemainingMs.mockResolvedValue(45_000);
    const clarifier: Clarifier = {
      generate: vi.fn(async () => ({ questions: ["x"] })),
    };

    const result = await runSessionClarify({
      engine,
      clarifier,
      scopeId: "s1",
      channelId: "c1",
      cooldownMs: 60_000,
    });

    expect(result.kind).toBe("cooldown");
    if (result.kind !== "cooldown") {
      throw new Error("Expected cooldown result");
    }
    expect(result.retryAfterSeconds).toBe(45);
    expect(engine.buildClarifyInput).not.toHaveBeenCalled();
  });
});
