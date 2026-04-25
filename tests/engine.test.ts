import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrainstormingEngine } from "../src/core/brainstormingEngine.js";
import { JsonStore } from "../src/storage/jsonStore.js";
import { HeuristicAnalyzer } from "../src/analysis/heuristicAnalyzer.js";
import { Analyzer } from "../src/domain/types.js";

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

  it("builds a reviewed project draft and rewrites user-filled setup fields without marking them suggested", async () => {
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
    expect(draft.review.description?.source).toBe("user");
    expect(draft.review.description?.value).toContain("ThinkBot");
    expect(draft.review.techStack?.source).toBe("user");
    expect(draft.review.techStack?.value.length).toBeGreaterThan(0);

    const project = await engine.createProjectFromDraft("guild-1", draft, true);

    expect(project.brain?.mainGoal?.source).toBe("ai-suggested");
    expect(project.brain?.description?.source).toBe("user");
    expect(project.description).toContain("ThinkBot");
  });

  it("updates one project brain field as user-provided data", async () => {
    const engine = new BrainstormingEngine(
      new JsonStore(storePath),
      new HeuristicAnalyzer(),
    );

    const project = await engine.createProject("guild-1", {
      name: "ThinkBot",
      linkedRepoUrl: "https://github.com/example/thinkbot",
      brain: {
        mainGoal: { value: "Keep brainstorming structured", source: "ai-suggested" },
      },
    });

    const updated = await engine.updateProjectBrainField("guild-1", project.id, "mainGoal", [
      "Make project planning actionable",
    ]);

    expect(updated.brain?.mainGoal?.value).toBe("Make project planning actionable");
    expect(updated.brain?.mainGoal?.source).toBe("user");
    expect(updated.linkedRepoUrl).toBe("https://github.com/example/thinkbot");
  });

  it("prepares refinement suggestions without overwriting strong user fields", async () => {
    const analyzer: Analyzer = {
      analyze: vi.fn(async () => {
        throw new Error("not used");
      }),
      summarizeProject: vi.fn(async () => ({
        currentDirection: "summary direction",
        importantThemes: ["theme"],
        recentChanges: ["change"],
        openIssues: ["issue"],
        currentNextFocus: ["focus"],
        relevantPastContext: ["memory"],
        repoObservations: [],
      })),
      brainstormProject: vi.fn(async () => ({
        coreIdeas: ["idea"],
        variationsTwists: ["twist"],
        gapsRisks: ["risk"],
        nextSteps: ["step"],
        assumptions: [],
        repoObservations: [],
      })),
      suggestProjectBrain: vi.fn(async () => ({
        description: "AI description",
        mainGoal: "AI goal",
        targetUsers: ["AI users"],
        problemsSolved: ["AI problem"],
        ideas: ["AI idea"],
        constraints: ["AI constraint"],
        techStack: ["AI stack"],
        decisions: ["AI decision"],
        notes: "AI notes",
      })),
    };
    const engine = new BrainstormingEngine(new JsonStore(storePath), analyzer);

    const project = await engine.createProject("guild-1", {
      name: "ThinkBot",
      brain: {
        description: { value: "User description with enough detail to stay strong", source: "user" },
        mainGoal: { value: "User goal with enough detail to remain strong", source: "user" },
        ideas: { value: ["User idea"], source: "user" },
      },
    });

    const draft = await engine.prepareProjectRefinement("guild-1", project.id);

    expect(draft.review.description?.value).toBe("User description with enough detail to stay strong");
    expect(draft.review.description?.source).toBe("user");
    expect(draft.review.mainGoal?.value).toBe("User goal with enough detail to remain strong");
    expect(draft.review.mainGoal?.source).toBe("user");
    expect(draft.review.techStack?.value).toEqual(["AI stack"]);
    expect(draft.review.techStack?.source).toBe("ai-suggested");
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

  it("builds a project summary without ending the active session", async () => {
    const engine = new BrainstormingEngine(
      new JsonStore(storePath),
      new HeuristicAnalyzer(),
    );

    const project = await engine.createProject("guild-1", {
      name: "Project Summary",
      description: "desc",
      linkedRepoUrl: "https://github.com/example/project-summary",
    });
    await engine.selectProject("guild-1", project.id);

    await engine.captureMessage("guild-1", "channel-1", "user-1", "We shifted toward a tighter MVP.");
    const originalSession = await engine.getActiveSession("guild-1", "channel-1");

    const report = await engine.summarizeProject("guild-1", "channel-1", "user-1");

    expect(report.currentDirection.length).toBeGreaterThan(0);
    expect(report.recentChanges.length).toBeGreaterThan(0);

    const activeSession = await engine.getActiveSession("guild-1", "channel-1");
    expect(activeSession?.id).toBe(originalSession?.id);
    expect(activeSession?.status).toBe("active");

    const memory = await engine.getProjectMemory(project.id);
    expect(memory.some((item) => item.memoryType === "project_summary")).toBe(true);
  });

  it("brainstorms from the active project without requiring explicit input", async () => {
    const engine = new BrainstormingEngine(
      new JsonStore(storePath),
      new HeuristicAnalyzer(),
    );

    const project = await engine.createProject("guild-1", {
      name: "Brainstorm Test",
      description: "Discord idea assistant",
      brain: {
        mainGoal: { value: "Generate better ideas from project context", source: "user" },
      },
    });
    await engine.selectProject("guild-1", project.id);
    await engine.captureMessage("guild-1", "channel-1", "user-1", "Need a clearer MVP flow.");

    const report = await engine.brainstormProject("guild-1", "channel-1", "user-1");

    expect(report.coreIdeas.length).toBeGreaterThan(0);
    expect(report.variationsTwists.length).toBeGreaterThan(0);
    expect(report.nextSteps.length).toBeGreaterThan(0);
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
