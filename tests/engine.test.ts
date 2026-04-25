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

    const projectB = await engine.createProject("guild-1", {
      name: "Idea B",
      description: "Another concept",
    });
    const selectedByName = await engine.selectProject("guild-1", "idea b");
    expect(selectedByName.id).toBe(projectB.id);
    const activeByName = await engine.getActiveProject("guild-1");
    expect(activeByName?.id).toBe(projectB.id);
  });

  it("rejects duplicate project names in the same scope", async () => {
    const engine = new BrainstormingEngine(
      new JsonStore(storePath),
      new HeuristicAnalyzer(),
    );

    await engine.createProject("guild-1", {
      name: "ThinkBot",
      description: "first",
    });

    await expect(
      engine.createProject("guild-1", {
        name: " thinkbot ",
        description: "duplicate with case/whitespace changes",
      }),
    ).rejects.toThrow("A project with that name already exists in this scope.");

    await expect(
      engine.createProject("guild-2", {
        name: "ThinkBot",
        description: "allowed in other scope",
      }),
    ).resolves.toBeTruthy();
  });

  it("stores structured project brain fields with source metadata", async () => {
    const engine = new BrainstormingEngine(
      new JsonStore(storePath),
      new HeuristicAnalyzer(),
    );

    const project = await engine.createProject("guild-1", {
      name: "ThinkBot",
      description: "Discord brainstorming bot",
      brain: {
        mainGoal: {
          value: "Make brainstorming always available",
          source: "user",
        },
        targetUsers: {
          value: ["solo builders"],
          source: "ai-suggested",
        },
      },
    });

    expect(project.brain?.mainGoal?.value).toBe("Make brainstorming always available");
    expect(project.brain?.targetUsers?.source).toBe("ai-suggested");
  });

  it("builds a reviewed project draft and saves skipped fields as ai-suggested", async () => {
    const engine = new BrainstormingEngine(
      new JsonStore(storePath),
      new HeuristicAnalyzer(),
    );

    const draft = await engine.prepareProjectBrainDraft("guild-1", {
      name: "ThinkBot",
      linkedRepoUrl: "",
      description: "Discord brainstorming bot",
      mainGoal: "",
      targetUsers: [],
      problemsSolved: ["Messy brainstorming capture"],
      ideas: [],
      constraints: [],
      techStack: ["TypeScript", "Discord.js"],
      decisions: [],
      notes: "",
    });

    expect(draft.suggestions.mainGoal).toBeTruthy();
    expect(draft.review.mainGoal?.source).toBe("ai-suggested");
    expect(draft.review.techStack?.source).toBe("ai-suggested");
    expect(draft.review.techStack?.value.length).toBeGreaterThan(0);

    const project = await engine.createProjectFromDraft("guild-1", draft, true);

    expect(project.brain?.mainGoal?.source).toBe("ai-suggested");
    expect(project.brain?.description?.source).toBe("ai-suggested");
    expect(project.description).toContain("ThinkBot");
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

  it("creates an implicit session when an active project receives a message", async () => {
    const engine = new BrainstormingEngine(
      new JsonStore(storePath),
      new HeuristicAnalyzer(),
    );

    const project = await engine.createProject("guild-1", {
      name: "Implicit Flow",
      description: "desc",
    });
    await engine.selectProject("guild-1", project.id);

    const captured = await engine.captureMessage(
      "guild-1",
      "channel-1",
      "user-1",
      "The bot should work without start-session.",
    );

    expect(captured).toBeTruthy();

    const session = await engine.getActiveSession("guild-1", "channel-1");
    expect(session?.status).toBe("active");
    expect(session?.projectId).toBe(project.id);
  });

  it("summarizes the current discussion without leaving the project inactive", async () => {
    const engine = new BrainstormingEngine(
      new JsonStore(storePath),
      new HeuristicAnalyzer(),
    );

    const project = await engine.createProject("guild-1", {
      name: "Summaries",
      description: "desc",
    });
    await engine.selectProject("guild-1", project.id);

    await engine.captureMessage("guild-1", "channel-1", "user-1", "Keep summaries concise.");
    const originalSession = await engine.getActiveSession("guild-1", "channel-1");

    const report = await engine.summarizeSession("guild-1", "channel-1", "user-1");

    expect(report.sessionGoal.length).toBeGreaterThan(0);

    const rolledSession = await engine.getActiveSession("guild-1", "channel-1");
    expect(rolledSession?.status).toBe("active");
    expect(rolledSession?.id).not.toBe(originalSession?.id);

    const memory = await engine.getProjectMemory(project.id);
    expect(memory.length).toBeGreaterThan(0);
  });

  it("clears the active project when exiting project mode", async () => {
    const engine = new BrainstormingEngine(
      new JsonStore(storePath),
      new HeuristicAnalyzer(),
    );

    await engine.createProject("guild-1", {
      name: "Exit Test",
      description: "desc",
    });

    await engine.exitProject("guild-1");

    const active = await engine.getActiveProject("guild-1");
    expect(active).toBeUndefined();
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

  it("deletes project by name and clears scoped data", async () => {
    const engine = new BrainstormingEngine(
      new JsonStore(storePath),
      new HeuristicAnalyzer(),
    );

    const project = await engine.createProject("guild-1", {
      name: "Delete Me",
      description: "desc",
    });
    await engine.selectProject("guild-1", project.id);
    await engine.startSession("guild-1", "channel-1", "user-1");
    await engine.captureMessage("guild-1", "channel-1", "user-1", "hello");
    await engine.endSession("guild-1", "channel-1");

    await engine.deleteProject("guild-1", "delete me");
    await expect(engine.resolveProject("guild-1", project.id)).rejects.toThrow(
      "Project not found in this scope.",
    );
  });

  it("deletes all projects for a scope", async () => {
    const engine = new BrainstormingEngine(
      new JsonStore(storePath),
      new HeuristicAnalyzer(),
    );

    await engine.createProject("guild-1", {
      name: "A",
      description: "a",
    });
    await engine.createProject("guild-1", {
      name: "B",
      description: "b",
    });
    await engine.createProject("guild-2", {
      name: "Other Scope",
      description: "c",
    });

    const deletedCount = await engine.deleteAllProjects("guild-1");
    expect(deletedCount).toBe(2);

    const guild1Projects = await engine.listProjects("guild-1");
    const guild2Projects = await engine.listProjects("guild-2");
    expect(guild1Projects).toHaveLength(0);
    expect(guild2Projects).toHaveLength(1);
  });

});
