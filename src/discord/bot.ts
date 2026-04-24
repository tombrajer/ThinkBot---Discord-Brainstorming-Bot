import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { BrainstormingEngine } from "../core/brainstormingEngine.js";
import { formatReport } from "../report/formatReport.js";

const scopeFor = (guildId: string | null, userId: string): string => guildId ?? `dm:${userId}`;
const MAX_DISCORD_CONTENT_LENGTH = 2_000;

const chunkMessage = (content: string, maxLength = MAX_DISCORD_CONTENT_LENGTH): string[] => {
  const trimmed = content.trim();
  if (!trimmed) {
    return ["(empty report)"];
  }
  if (trimmed.length <= maxLength) {
    return [trimmed];
  }

  const chunks: string[] = [];
  let current = "";

  const pushCurrent = () => {
    if (current.trim()) {
      chunks.push(current.trim());
      current = "";
    }
  };

  const appendLine = (line: string) => {
    const next = current ? `${current}\n${line}` : line;
    if (next.length <= maxLength) {
      current = next;
      return;
    }

    if (line.length <= maxLength) {
      pushCurrent();
      current = line;
      return;
    }

    pushCurrent();
    for (let i = 0; i < line.length; i += maxLength) {
      chunks.push(line.slice(i, i + maxLength));
    }
  };

  for (const line of trimmed.split(/\r?\n/)) {
    appendLine(line);
  }
  pushCurrent();

  return chunks.length > 0 ? chunks : [trimmed.slice(0, maxLength)];
};

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
        const startMs = Date.now();
        console.info(
          `[discord] /end-session start scope=${scopeId} channel=${interaction.channelId} user=${interaction.user.id}`,
        );
        await interaction.deferReply();
        console.info("[discord] /end-session deferred interaction successfully");

        const report = await engine.endSession(scopeId, interaction.channelId);
        const formatted = formatReport(report);
        const contentChunks = chunkMessage(formatted);

        console.info(
          `[discord] /end-session prepared ${contentChunks.length} chunk(s), firstChunkLength=${contentChunks[0]?.length ?? 0}`,
        );

        try {
          await interaction.editReply("Analysis complete. Sending report...");
          console.info("[discord] /end-session editReply status message sent");
        } catch (sendError) {
          const msg = sendError instanceof Error ? sendError.message : String(sendError);
          console.error(`[discord] /end-session editReply failed: ${msg}`);
          throw sendError;
        }

        for (let index = 0; index < contentChunks.length; index += 1) {
          const chunk = contentChunks[index];
          try {
            await interaction.followUp(chunk);
            console.info(
              `[discord] /end-session followUp sent chunk=${index + 1}/${contentChunks.length} length=${chunk.length}`,
            );
          } catch (sendError) {
            const msg = sendError instanceof Error ? sendError.message : String(sendError);
            console.error(
              `[discord] /end-session followUp failed chunk=${index + 1}/${contentChunks.length}: ${msg}`,
            );
            throw sendError;
          }
        }
        console.info(`[discord] /end-session completed in ${Date.now() - startMs}ms`);
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
        const contentChunks = chunkMessage(content);
        await interaction.reply({ content: contentChunks[0], flags: MessageFlags.Ephemeral });
        for (let index = 1; index < contentChunks.length; index += 1) {
          await interaction.followUp({ content: contentChunks[index], flags: MessageFlags.Ephemeral });
        }
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
      console.error(
        `[discord] Interaction handler exception command=${interaction.commandName} scope=${scopeId} channel=${interaction.channelId}: ${message}`,
      );
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: `Error: ${message}`, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: `Error: ${message}`, flags: MessageFlags.Ephemeral });
      }
    }
  });

  return client;
};
