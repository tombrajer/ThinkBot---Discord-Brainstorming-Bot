import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { BrainstormingEngine } from "../core/brainstormingEngine.js";
import { formatReport } from "../report/formatReport.js";

const scopeFor = (guildId: string | null, userId: string): string => guildId ?? `dm:${userId}`;

interface DiscordBotOptions {
  enableMessageContentIntent: boolean;
}

export const createDiscordBot = (
  engine: BrainstormingEngine,
  options: DiscordBotOptions,
): Client => {
  const enableMessageContentIntent = options.enableMessageContentIntent;
  const intents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
  ];
  if (enableMessageContentIntent) {
    intents.push(GatewayIntentBits.MessageContent);
  }

  const client = new Client({
    intents,
  });

  client.on(Events.ClientReady, () => {
    console.log(
      `Brainstorming bot ready. Message content intent: ${
        enableMessageContentIntent ? "enabled" : "disabled"
      }.`,
    );
  });

  client.on(Events.MessageCreate, async (message) => {
    if (!enableMessageContentIntent) {
      return;
    }
    if (message.author.bot) {
      return;
    }
    const scopeId = scopeFor(message.guildId, message.author.id);
    await engine.captureMessage(scopeId, message.channelId, message.author.id, message.content);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    const scopeId = scopeFor(interaction.guildId, interaction.user.id);

    try {
      if (interaction.commandName === "project-create") {
        const name = interaction.options.getString("name", true);
        const description = interaction.options.getString("description") ?? undefined;
        const project = await engine.createProject(scopeId, { name, description });
        await interaction.reply({
          content: `Project created: ${project.name} (${project.id})`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (interaction.commandName === "project-list") {
        const projects = await engine.listProjects(scopeId);
        const active = await engine.getActiveProject(scopeId);
        const content =
          projects.length === 0
            ? "No projects yet."
            : projects
                .map(
                  (project) =>
                    `- ${project.name} (${project.id})${
                      active?.id === project.id ? " [active]" : ""
                    }`,
                )
                .join("\n");
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
        return;
      }

      if (interaction.commandName === "project-select") {
        const projectId = interaction.options.getString("project_id", true);
        await engine.selectProject(scopeId, projectId);
        await interaction.reply({
          content: `Active project set to ${projectId}.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (interaction.commandName === "attach-repo") {
        const project = await engine.getActiveProject(scopeId);
        if (!project) {
          throw new Error("No active project selected.");
        }
        const url = interaction.options.getString("url", true);
        await engine.attachRepo(scopeId, project.id, url);
        await interaction.reply({
          content: `Attached repo to ${project.name}.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (interaction.commandName === "start-session") {
        const session = await engine.startSession(scopeId, interaction.channelId, interaction.user.id);
        await interaction.reply(
          `Session started for active project. Session ID: ${session.id}. Messages in this channel are now captured.`,
        );
        return;
      }

      if (interaction.commandName === "end-session") {
        await interaction.deferReply();
        const report = await engine.endSession(scopeId, interaction.channelId);
        await interaction.editReply(formatReport(report));
        return;
      }

      if (interaction.commandName === "project-memory") {
        const project = await engine.getActiveProject(scopeId);
        if (!project) {
          throw new Error("No active project selected.");
        }
        const memory = await engine.getProjectMemory(project.id);
        const content =
          memory.length === 0
            ? "No memory entries yet."
            : memory.slice(-10).map((item) => `- ${item.content}`).join("\n");
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
        return;
      }

      if (interaction.commandName === "forget-project") {
        const projectId = interaction.options.getString("project_id", true);
        await engine.deleteProject(scopeId, projectId);
        await interaction.reply({
          content: `Deleted project ${projectId}.`,
          flags: MessageFlags.Ephemeral,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: `Error: ${message}`, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: `Error: ${message}`, flags: MessageFlags.Ephemeral });
      }
    }
  });

  return client;
};
