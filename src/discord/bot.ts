import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { BrainstormingEngine } from "../core/brainstormingEngine.js";
import { Clarifier } from "../domain/types.js";
import { formatReport } from "../report/formatReport.js";
import { runSessionClarify } from "./sessionClarify.js";

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
  clarifier: Clarifier;
  clarifyCooldownMs: number;
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
    if (interaction.isAutocomplete()) {
      const scopeId = scopeFor(interaction.guildId, interaction.user.id);
      try {
        if (!["project-select", "forget-project"].includes(interaction.commandName)) {
          await interaction.respond([]);
          return;
        }

        const focused = interaction.options.getFocused(true);
        if (focused.name !== "project") {
          await interaction.respond([]);
          return;
        }

        const query = String(focused.value ?? "").trim().toLowerCase();
        const projects = await engine.listProjects(scopeId);
        const filtered = projects
          .filter((project) => {
            if (!query) {
              return true;
            }
            return (
              project.name.toLowerCase().includes(query) ||
              project.id.toLowerCase().includes(query)
            );
          })
          .slice(0, 25)
          .map((project) => ({
            name: project.name.slice(0, 100),
            value: project.name,
          }));

        await interaction.respond(filtered);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown autocomplete error";
        console.error(
          `[discord] Autocomplete exception command=${interaction.commandName} scope=${scopeId}: ${message}`,
        );
        try {
          await interaction.respond([]);
        } catch {
          // no-op: interaction may already be expired
        }
      }
      return;
    }

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
          content: `Project created: ${project.name}`,
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
                    `- ${project.name}${active?.id === project.id ? " [active]" : ""}`,
                )
                .join("\n");
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
        return;
      }

      if (interaction.commandName === "project-select") {
        const selector = interaction.options.getString("project", true);
        const project = await engine.selectProject(scopeId, selector);
        await interaction.reply({
          content: `Active project set to ${project.name}.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (interaction.commandName === "project-active") {
        const project = await engine.getActiveProject(scopeId);
        const content = project
          ? `Active project: ${project.name}`
          : "No active project selected.";
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
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
        await engine.startSession(scopeId, interaction.channelId, interaction.user.id);
        await interaction.reply(
          "Session started for active project. Messages in this channel are now captured.",
        );
        return;
      }

      if (interaction.commandName === "session-clarify") {
        const focus = interaction.options.getString("focus") ?? undefined;
        console.info(
          `[clarify] /session-clarify start scope=${scopeId} channel=${interaction.channelId} user=${interaction.user.id} focus=${focus ?? "(none)"}`,
        );
        await interaction.deferReply();

        const result = await runSessionClarify({
          engine,
          clarifier: options.clarifier,
          scopeId,
          channelId: interaction.channelId,
          focus,
          cooldownMs: options.clarifyCooldownMs,
        });

        if (result.kind === "cooldown") {
          console.info(
            `[clarify] /session-clarify cooldown hit retryAfterSeconds=${result.retryAfterSeconds}`,
          );
          await interaction.editReply(
            `Please wait ${result.retryAfterSeconds}s before running /session-clarify again.`,
          );
          return;
        }

        if (result.kind === "error") {
          console.error(`[clarify] /session-clarify error: ${result.message}`);
          await interaction.editReply(result.message);
          return;
        }

        if (result.kind === "none") {
          console.info("[clarify] /session-clarify no questions needed");
          await interaction.editReply("No clarifying questions needed right now.");
          return;
        }

        const content = [
          "Clarifying questions:",
          ...result.questions.map((question, index) => `${index + 1}. ${question}`),
        ].join("\n");
        console.info(`[clarify] /session-clarify posted questionCount=${result.questions.length}`);
        await interaction.editReply(content);
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
        const selector = interaction.options.getString("project", true);
        const resolved = await engine.resolveProject(scopeId, selector);
        await engine.deleteProject(scopeId, selector);
        await interaction.reply({
          content: `Deleted project ${resolved.name}.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (interaction.commandName === "forget-all-projects") {
        const confirm = interaction.options.getBoolean("confirm", true);
        if (!confirm) {
          await interaction.reply({
            content: "Set `confirm` to true to delete all projects.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        const deletedCount = await engine.deleteAllProjects(scopeId);
        await interaction.reply({
          content: `Deleted ${deletedCount} project(s) in this scope.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(
        `[discord] Interaction handler exception command=${interaction.commandName} scope=${scopeId} channel=${interaction.channelId}: ${message}`,
      );
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: `Error: ${message}`, flags: MessageFlags.Ephemeral });
        } else {
          await interaction.reply({ content: `Error: ${message}`, flags: MessageFlags.Ephemeral });
        }
      } catch (sendError) {
        const sendMessage = sendError instanceof Error ? sendError.message : String(sendError);
        console.error(
          `[discord] Failed to send interaction error response command=${interaction.commandName}: ${sendMessage}`,
        );
      }
    }
  });

  return client;
};
