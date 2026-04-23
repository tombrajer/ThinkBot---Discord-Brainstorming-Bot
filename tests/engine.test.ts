import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrainstormingEngine } from "../src/core/brainstormingEngine.js";
import { JsonStore } from "../src/storage/jsonStore.js";
import { HeuristicAnalyzer } from "../src/analysis/heuristicAnalyzer.js";

describe("BrainstormingEngine", () => {
  let tempDir: string;
  let storePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "brainstorming-bot-"));
    storePath = join(tempDir, "store.json");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates and selects projects per scope", async () => {
    const engine = new BrainstormingEngine(
      new JsonStore(storePath),
      new HeuristicAnalyzer(),
    );

    const project = await engine.createProject("guild-1", {
      name: "Idea A",
      description: "New app concept",
    });

    const projects = await engine.listProjects("guild-1");
    expect(projects).toHaveLength(1);
    expect(projects[0]?.name).toBe("Idea A");

    await engine.selectProject("guild-1", project.id);
    const active = await engine.getActiveProject("guild-1");
    expect(active?.id).toBe(project.id);
  });

  it("runs session lifecycle and stores report + memory", async () => {
    const engine = new BrainstormingEngine(
      new JsonStore(storePath),
      new HeuristicAnalyzer(),
    );

    const project = await engine.createProject("guild-1", {
      name: "Planner",
      description: "Team planning bot",
    });
    await engine.selectProject("guild-1", project.id);

    const started = await engine.startSession("guild-1", "channel-1", "user-1");
    expect(started.status).toBe("active");

    await engine.captureMessage("guild-1", "channel-1", "user-1", "We need weekly summaries.");
    await engine.captureMessage("guild-1", "channel-1", "user-2", "Make feedback concise and critical.");
    await engine.captureMessage("guild-1", "channel-1", "user-1", "Need memory across sessions.");

    const report = await engine.endSession("guild-1", "channel-1");

    expect(report.sessionGoal.length).toBeGreaterThan(0);
    expect(report.mainIdeasRaised.length).toBeGreaterThan(0);
    expect(report.missingQuestions.length).toBeGreaterThan(0);

    const memory = await engine.getProjectMemory(project.id);
    expect(memory.length).toBeGreaterThan(0);
  });

  it("rejects a second active session for the same project + channel", async () => {
    const engine = new BrainstormingEngine(
      new JsonStore(storePath),
      new HeuristicAnalyzer(),
    );

    const project = await engine.createProject("guild-1", {
      name: "Project X",
      description: "desc",
    });
    await engine.selectProject("guild-1", project.id);

    await engine.startSession("guild-1", "channel-1", "user-1");

    await expect(
      engine.startSession("guild-1", "channel-1", "user-2"),
    ).rejects.toThrow("An active session already exists");
  });
});
