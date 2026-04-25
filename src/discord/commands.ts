import { SlashCommandBuilder } from "discord.js";

export const commandBuilders = [
  // Project setup and context
  new SlashCommandBuilder()
    .setName("project-create")
    .setDescription("Create a project")
    .addStringOption((opt) => opt.setName("name").setDescription("Project name").setRequired(true))
    .addStringOption((opt) =>
      opt.setName("description").setDescription("Short description").setRequired(false),
    ),
  new SlashCommandBuilder().setName("project-list").setDescription("List projects"),
  new SlashCommandBuilder().setName("project-active").setDescription("Show active project"),
  new SlashCommandBuilder()
    .setName("project-select")
    .setDescription("Select active project")
    .addStringOption((opt) =>
      opt
        .setName("project")
        .setDescription("Exact project name from /project-list")
        .setAutocomplete(true)
        .setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("attach-repo")
    .setDescription("Attach repository URL to current project")
    .addStringOption((opt) => opt.setName("url").setDescription("Repository URL").setRequired(true)),
  new SlashCommandBuilder().setName("project-memory").setDescription("Show project memory"),

  // Session flow
  new SlashCommandBuilder().setName("start-session").setDescription("Start brainstorm session"),
  new SlashCommandBuilder().setName("end-session").setDescription("End brainstorm session and analyze"),

  // Destructive actions
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
