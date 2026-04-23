import { SlashCommandBuilder } from "discord.js";

export const commandBuilders = [
  new SlashCommandBuilder()
    .setName("project-create")
    .setDescription("Create a project")
    .addStringOption((opt) => opt.setName("name").setDescription("Project name").setRequired(true))
    .addStringOption((opt) =>
      opt.setName("description").setDescription("Short description").setRequired(false),
    ),
  new SlashCommandBuilder().setName("project-list").setDescription("List projects"),
  new SlashCommandBuilder()
    .setName("project-select")
    .setDescription("Select active project")
    .addStringOption((opt) =>
      opt.setName("project_id").setDescription("Project ID from /project-list").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("attach-repo")
    .setDescription("Attach repository URL to current project")
    .addStringOption((opt) => opt.setName("url").setDescription("Repository URL").setRequired(true)),
  new SlashCommandBuilder().setName("start-session").setDescription("Start brainstorm session"),
  new SlashCommandBuilder().setName("end-session").setDescription("End brainstorm session and analyze"),
  new SlashCommandBuilder().setName("project-memory").setDescription("Show project memory"),
  new SlashCommandBuilder()
    .setName("forget-project")
    .setDescription("Delete a project")
    .addStringOption((opt) =>
      opt.setName("project_id").setDescription("Project ID to delete").setRequired(true),
    ),
].map((builder) => builder.toJSON());
