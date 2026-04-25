import {
  ChatInputCommandInteraction,
  Client,
  Events,
  GatewayIntentBits,
  InteractionReplyOptions,
  MessageFlags,
} from "discord.js";
import { BrainstormingEngine } from "../core/brainstormingEngine.js";
import { ProjectSetupFlow } from "./projectSetupFlow.js";
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

const formatActiveProject = (projectName?: string): string =>
  projectName ? `Active project: ${projectName}` : "Active project: none";

const replyWithChunks = async (
  interaction: ChatInputCommandInteraction,
  content: string,
  ephemeral = true,
) => {
  const contentChunks = chunkMessage(content);
  const firstReply: InteractionReplyOptions = ephemeral
    ? { content: contentChunks[0], flags: MessageFlags.Ephemeral }
    : { content: contentChunks[0] };

  if (interaction.replied || interaction.deferred) {
    await interaction.followUp(firstReply);
  } else {
    await interaction.reply(firstReply);
  }

  for (let index = 1; index < contentChunks.length; index += 1) {
    await interaction.followUp(
      ephemeral
        ? { content: contentChunks[index], flags: MessageFlags.Ephemeral }
        : { content: contentChunks[index] },
    );
  }
};

const buildProjectBrainContent = (
  project: { name: string; description?: string; linkedRepoUrl?: string },
  memory: { content: string }[],
): string => {
  const recentMemory = memory.slice(-5).map((item) => `- ${item.content}`);

  return [
    `Project: ${project.name}`,
    `Description: ${project.description ?? "Not set."}`,
    `Repo: ${project.linkedRepoUrl ?? "Not attached."}`,
    "",
    "Recent memory:",
    ...(recentMemory.length > 0 ? recentMemory : ["- No memory entries yet."]),
  ].join("\n");
};

const summarizeActiveDiscussion = async (
  interaction: ChatInputCommandInteraction,
  engine: BrainstormingEngine,
  scopeId: string,
) => {
  const project = await engine.getActiveProject(scopeId);
  if (!project) {
    throw new Error("No active project selected.");
  }

  const startMs = Date.now();
  console.info(
    `[discord] summarize start scope=${scopeId} channel=${interaction.channelId} user=${interaction.user.id}`,
  );
  await interaction.deferReply();

  const report = await engine.summarizeSession(scopeId, interaction.channelId, interaction.user.id);
  const formatted = formatReport(report);
  const contentChunks = chunkMessage(formatted);

  await interaction.editReply(`Summary ready for ${project.name}. Sending report...`);
  for (let index = 0; index < contentChunks.length; index += 1) {
    await interaction.followUp(contentChunks[index]);
  }
  console.info(`[discord] summarize completed in ${Date.now() - startMs}ms`);
};

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
  const projectSetupFlow = new ProjectSetupFlow(engine);

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
        const groupedProjectSelect =
          interaction.commandName === "project" &&
          interaction.options.getSubcommand(false) === "select";
        const forgetProject = interaction.commandName === "forget-project";

        if (!groupedProjectSelect && !forgetProject) {
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

    const scopeId = scopeFor(interaction.guildId, interaction.user.id);

    try {
      if (!interaction.isChatInputCommand()) {
        if (interaction.isModalSubmit()) {
          const handled = await projectSetupFlow.handleModalSubmit(interaction, scopeId);
          if (handled) {
            return;
          }
        }

        if (interaction.isButton()) {
          const handled = await projectSetupFlow.handleButton(interaction, scopeId);
          if (handled) {
            return;
          }
        }

        return;
      }

      const projectSubcommand =
        interaction.commandName === "project" ? interaction.options.getSubcommand() : undefined;
      const sessionSubcommand =
        interaction.commandName === "session" ? interaction.options.getSubcommand() : undefined;

      if (
        interaction.commandName === "project" && projectSubcommand === "create"
      ) {
        const name = interaction.options.getString("name", true);
        const guidedSetup = interaction.options.getBoolean("guided-setup", true);

        if (guidedSetup) {
          await projectSetupFlow.showBasicsModal(interaction, scopeId, name);
          return;
        }

        const project = await engine.createProject(scopeId, { name });
        const activeProject = await engine.getActiveProject(scopeId);
        await interaction.reply({
          content: `Project created: ${project.name}. ${formatActiveProject(activeProject?.name)}`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (interaction.commandName === "project" && projectSubcommand === "list") {
        const projects = await engine.listProjects(scopeId);
        const active = await engine.getActiveProject(scopeId);
        const content =
          projects.length === 0
            ? "No projects yet."
            : [
                formatActiveProject(active?.name),
                "",
                ...projects.map(
                  (project) =>
                    `- ${project.name}${active?.id === project.id ? " [active]" : ""}`,
                ),
              ].join("\n");
        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
        return;
      }

      if (interaction.commandName === "project" && projectSubcommand === "select") {
        const selector = interaction.options.getString("project", true);
        const project = await engine.selectProject(scopeId, selector);
        await interaction.reply({
          content: `Selected ${project.name}. ${formatActiveProject(project.name)}`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (interaction.commandName === "project" && projectSubcommand === "exit") {
        const activeProject = await engine.getActiveProject(scopeId);
        await engine.exitProject(scopeId);
        await interaction.reply({
          content: activeProject
            ? `Exited ${activeProject.name}. ${formatActiveProject()}`
            : `No active project to exit. ${formatActiveProject()}`,
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

      if (interaction.commandName === "project" && projectSubcommand === "brain") {
        const project = await engine.getActiveProject(scopeId);
        if (!project) {
          throw new Error("No active project selected.");
        }
        const memory = await engine.getProjectMemory(project.id);
        await replyWithChunks(
          interaction,
          [formatActiveProject(project.name), "", buildProjectBrainContent(project, memory)].join("\n"),
        );
        return;
      }

      if (interaction.commandName === "session" && sessionSubcommand === "summarize") {
        await summarizeActiveDiscussion(interaction, engine, scopeId);
        return;
      }

      if (interaction.commandName === "project" && projectSubcommand === "memory") {
        const project = await engine.getActiveProject(scopeId);
        if (!project) {
          throw new Error("No active project selected.");
        }
        const memory = await engine.getProjectMemory(project.id);
        const content =
          memory.length === 0
            ? `${formatActiveProject(project.name)}\n\nNo memory entries yet.`
            : [
                formatActiveProject(project.name),
                "",
                ...memory.slice(-10).map((item) => `- ${item.content}`),
              ].join("\n");
        await replyWithChunks(interaction, content);
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
      const interactionName =
        "commandName" in interaction ? interaction.commandName : interaction.customId;
      console.error(
        `[discord] Interaction handler exception command=${interactionName} scope=${scopeId} channel=${interaction.channelId}: ${message}`,
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
          `[discord] Failed to send interaction error response command=${interactionName}: ${sendMessage}`,
        );
      }
    }
  });

  return client;
};
