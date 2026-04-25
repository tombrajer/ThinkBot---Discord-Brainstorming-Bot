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
        )
        .addBooleanOption((opt) =>
          opt
            .setName("guided-setup")
            .setDescription("Open the guided setup questions")
            .setRequired(true),
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
      subcommand.setName("memory").setDescription("Show recent project memory"),
    ),
  new SlashCommandBuilder()
    .setName("session")
    .setDescription("Session commands")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("summarize")
        .setDescription("Summarize recent discussion for the active project"),
    ),
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
