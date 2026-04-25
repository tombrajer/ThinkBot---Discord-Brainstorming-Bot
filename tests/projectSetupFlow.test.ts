import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrainstormingEngine } from "../src/core/brainstormingEngine.js";
import { JsonStore } from "../src/storage/jsonStore.js";
import { ProjectSetupFlow } from "../src/discord/projectSetupFlow.js";
import { Analyzer } from "../src/domain/types.js";

describe("ProjectSetupFlow", () => {
  let tempDir: string;
  let storePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "project-setup-flow-"));
    storePath = join(tempDir, "store.json");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("shows the basics modal without setting empty optional text values", async () => {
    const engine = new BrainstormingEngine(
      new JsonStore(storePath),
      {
        analyze: vi.fn(),
        suggestProjectBrain: vi.fn(async () => ({
          description: "",
          mainGoal: "",
          targetUsers: [],
          problemsSolved: [],
          ideas: [],
          constraints: [],
          techStack: [],
          decisions: [],
          notes: "",
        })),
      } as Analyzer,
    );
    const flow = new ProjectSetupFlow(engine);
    const showModal = vi.fn(async () => undefined);

    await expect(
      flow.showBasicsModal(
        {
          user: { id: "user-1" },
          showModal,
        } as never,
        "scope-1",
        "ThinkBot",
      ),
    ).resolves.toBeUndefined();

    expect(showModal).toHaveBeenCalledTimes(1);
    const modal = (showModal.mock.calls as Array<[ { toJSON: () => { components: Array<{ components?: Array<Record<string, unknown>> }> } } ] | []>)[0]?.[0];
    const json = modal?.toJSON();
    const inputs =
      json?.components.flatMap((row: { components?: Array<Record<string, unknown>> }) => row.components ?? []) ??
      [];
    const byId = (customId: string) =>
      inputs.find((input: Record<string, unknown>) => input.custom_id === customId);

    expect(byId("name")?.required).toBe(true);
    expect(byId("description")?.required).toBe(true);
    expect(byId("mainGoal")?.required).toBe(true);
    expect(byId("linkedRepoUrl")?.required).toBe(false);
    expect(byId("description")?.placeholder).toBe("Leave blank for AI suggestion.");
    expect(byId("linkedRepoUrl")?.placeholder).toBe("Optional. Leave blank if none.");
  });

  it("marks only tech stack as required in details and shows AI-suggestion placeholders", async () => {
    const engine = new BrainstormingEngine(
      new JsonStore(storePath),
      {
        analyze: vi.fn(),
        suggestProjectBrain: vi.fn(async () => ({
          description: "",
          mainGoal: "",
          targetUsers: [],
          problemsSolved: [],
          ideas: [],
          constraints: [],
          techStack: [],
          decisions: [],
          notes: "",
        })),
      } as Analyzer,
    );
    const flow = new ProjectSetupFlow(engine);

    await flow.handleModalSubmit(
      {
        customId: "project-setup:basics",
        user: { id: "user-1" },
        fields: {
          getTextInputValue: (key: string) =>
            (
              {
                name: "ThinkBot",
                linkedRepoUrl: "",
                description: "Discord brainstorming bot",
                mainGoal: "Help organize ideas",
              } as Record<string, string>
            )[key] ?? "",
        },
        reply: vi.fn(async () => undefined),
      } as never,
      "scope-1",
    );

    const showModal = vi.fn(async () => undefined);
    await expect(
      flow.handleButton(
        {
          customId: "project-setup:continue",
          user: { id: "user-1" },
          showModal,
        } as never,
        "scope-1",
      ),
    ).resolves.toBe(true);

    const modal = (showModal.mock.calls as Array<[ { toJSON: () => { components: Array<{ components?: Array<Record<string, unknown>> }> } } ] | []>)[0]?.[0];
    const json = modal?.toJSON();
    const inputs =
      json?.components.flatMap((row: { components?: Array<Record<string, unknown>> }) => row.components ?? []) ??
      [];
    const byId = (customId: string) =>
      inputs.find((input: Record<string, unknown>) => input.custom_id === customId);

    expect(byId("ideas")?.required).toBe(false);
    expect(byId("constraints")?.required).toBe(false);
    expect(byId("techStack")?.required).toBe(true);
    expect(byId("decisions")?.required).toBe(false);
    expect(byId("notes")?.required).toBe(false);
    expect(byId("ideas")?.placeholder).toBe("Leave blank for AI suggestion.");
    expect(byId("techStack")?.placeholder).toBe("Required. Describe the product/platform; AI suggests the stack.");
  });

  it("caps the review reply content when suggested fields are very long", async () => {
    const oversized = "x".repeat(900);
    const engine = new BrainstormingEngine(
      new JsonStore(storePath),
      {
        analyze: vi.fn(),
        suggestProjectBrain: vi.fn(async () => ({
          description: oversized,
          mainGoal: oversized,
          targetUsers: [oversized],
          problemsSolved: [oversized],
          ideas: [oversized],
          constraints: [oversized],
          techStack: [oversized],
          decisions: [oversized],
          notes: oversized,
        })),
      } as Analyzer,
    );
    const flow = new ProjectSetupFlow(engine);

    await flow.handleModalSubmit(
      {
        customId: "project-setup:basics",
        user: { id: "user-1" },
        fields: {
          getTextInputValue: (key: string) =>
            (
              {
                name: "ThinkBot",
                linkedRepoUrl: "",
                description: "",
                mainGoal: "",
              } as Record<string, string>
            )[key] ?? "",
        },
        reply: vi.fn(async () => undefined),
      } as never,
      "scope-1",
    );

    const deferReply = vi.fn(async () => undefined);
    const editReply = vi.fn(async (_payload: { content: string }) => undefined);
    await expect(
      flow.handleModalSubmit(
        {
          customId: "project-setup:details",
          user: { id: "user-1" },
          fields: {
            getTextInputValue: () => "",
          },
          deferReply,
          editReply,
        } as never,
        "scope-1",
      ),
    ).resolves.toBe(true);

    expect(deferReply).toHaveBeenCalledTimes(1);
    expect(editReply).toHaveBeenCalledTimes(1);
    const response = (editReply.mock.calls as Array<[{ content: string }] | []>)[0]?.[0];
    expect(response?.content.length).toBeLessThanOrEqual(2000);
  });
});
