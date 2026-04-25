import { describe, expect, it } from "vitest";
import { commandBuilders } from "../src/discord/commands.js";

describe("commandBuilders", () => {
  it("registers grouped Phase 1 commands", () => {
    const commandNames = commandBuilders.map((builder) => builder.name);

    expect(commandNames).toContain("project");
    expect(commandNames).toContain("brainstorm");
    expect(commandNames).toContain("attach-repo");
  });

  it("does not register removed legacy commands", () => {
    const commandNames = commandBuilders.map((builder) => builder.name);

    expect(commandNames).not.toContain("project-create");
    expect(commandNames).not.toContain("project-list");
    expect(commandNames).not.toContain("project-active");
    expect(commandNames).not.toContain("project-select");
    expect(commandNames).not.toContain("project-memory");
    expect(commandNames).not.toContain("start-session");
    expect(commandNames).not.toContain("end-session");
  });

  it("includes the expected project subcommands", () => {
    const projectCommand = commandBuilders.find((builder) => builder.name === "project");

    const projectSubcommands =
      projectCommand?.options?.map((option) => option.name).sort() ?? [];

    expect(projectSubcommands).toEqual([
      "brain",
      "create",
      "edit",
      "exit",
      "list",
      "memory",
      "refine",
      "select",
      "summary",
    ]);
  });

  it("registers grouped project create with only the project name field", () => {
    const projectCommand = commandBuilders.find((builder) => builder.name === "project");
    const createSubcommand = projectCommand?.options?.find((option) => option.name === "create") as
      | { options?: Array<{ name?: string }> }
      | undefined;

    expect(createSubcommand?.options?.map((option) => option.name) ?? []).toEqual(["name"]);
  });
});
