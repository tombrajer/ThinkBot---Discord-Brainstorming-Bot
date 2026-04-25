import { SlashCommandBuilder } from "discord.js";

export const commandBuilders = [
  new SlashCommandBuilder()
    .setName("project")
    .setDescription("Project commands")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Create a project")
        .addStringOption((opt) =>
          opt.setName("name").setDescription("Project name").setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("list").setDescription("List projects"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("select")
        .setDescription("Select active project")
        .addStringOption((opt) =>
          opt
            .setName("project")
            .setDescription("Exact project name from /project list")
            .setAutocomplete(true)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("exit").setDescription("Exit the active project"),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("brain").setDescription("Show the current project context"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("edit")
        .setDescription("Edit one project brain field")
        .addStringOption((opt) =>
          opt
            .setName("field")
            .setDescription("Field to edit")
            .setRequired(true)
            .addChoices(
              { name: "Description", value: "description" },
              { name: "Goal", value: "mainGoal" },
              { name: "Ideas", value: "ideas" },
              { name: "Constraints", value: "constraints" },
              { name: "Tech Stack", value: "techStack" },
              { name: "Decisions", value: "decisions" },
              { name: "Notes", value: "notes" },
              { name: "GitHub Repo", value: "linkedRepoUrl" },
            ),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("refine").setDescription("Suggest improvements for weak or missing project fields"),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("memory").setDescription("Show recent project memory"),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("summary").setDescription("Summarize the current project state"),
    ),
  new SlashCommandBuilder()
    .setName("brainstorm")
    .setDescription("Brainstorm from the active project, repo, and recent discussion"),
  new SlashCommandBuilder()
    .setName("attach-repo")
    .setDescription("Attach repository URL to current project")
    .addStringOption((opt) => opt.setName("url").setDescription("Repository URL").setRequired(true)),

  new SlashCommandBuilder()
    .setName("forget-project")
    .setDescription("Delete a project")
    .addStringOption((opt) =>
      opt
        .setName("project")
        .setDescription("Exact project name to delete")
        .setAutocomplete(true)
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("forget-all-projects")
    .setDescription("Delete all projects in this server/DM scope")
    .addBooleanOption((opt) =>
      opt
        .setName("confirm")
        .setDescription("Set to true to confirm deletion")
        .setRequired(true),
    ),
].map((builder) => builder.toJSON());
