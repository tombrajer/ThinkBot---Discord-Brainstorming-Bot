import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  MessageFlags,
  ModalActionRowComponentBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { BrainstormingEngine } from "../core/brainstormingEngine.js";
import { Project, ProjectBrain, ProjectBrainDraftValues } from "../domain/types.js";

const MAX_DISCORD_CONTENT_LENGTH = 2_000;
const MAX_FIELD_PREVIEW_LENGTH = 220;
const BASICS_MODAL_ID = "project-setup:basics";
const DETAILS_MODAL_ID = "project-setup:details";
const CONTINUE_BUTTON_ID = "project-setup:continue";
const SAVE_WITH_SUGGESTIONS_BUTTON_ID = "project-setup:save-with-suggestions";
const SAVE_WITHOUT_SUGGESTIONS_BUTTON_ID = "project-setup:save-without-suggestions";
const EDIT_BUTTON_ID = "project-setup:edit";
const CANCEL_BUTTON_ID = "project-setup:cancel";

interface ProjectSetupState {
  values: ProjectBrainDraftValues;
}

const defaultValues = (): ProjectBrainDraftValues => ({
  name: "",
  linkedRepoUrl: "",
  description: "",
  mainGoal: "",
  targetUsers: [],
  problemsSolved: [],
  ideas: [],
  constraints: [],
  techStack: [],
  decisions: [],
  notes: "",
});

const parseList = (value: string): string[] =>
  value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);

const DEFAULT_AI_PLACEHOLDER = "Leave blank for AI suggestion.";
const OPTIONAL_REPO_PLACEHOLDER = "Optional. Leave blank if none.";
const REQUIRED_TECH_STACK_PLACEHOLDER =
  "Required. Describe the product/platform; AI suggests the stack.";

const withOptionalValue = (builder: TextInputBuilder, value: string): TextInputBuilder => {
  const trimmed = value.trim();
  if (!trimmed) {
    return builder;
  }
  return builder.setValue(trimmed);
};

const formatField = (field?: { value: string | string[]; source: "user" | "ai-suggested" }): string => {
  if (!field) {
    return "Not set.";
  }
  const rawValue = Array.isArray(field.value) ? field.value.join(", ") : field.value;
  const suffix = field.source === "ai-suggested" ? " (suggested)" : "";
  const availableLength = Math.max(16, MAX_FIELD_PREVIEW_LENGTH - suffix.length);
  const preview =
    rawValue.length > availableLength ? `${rawValue.slice(0, availableLength - 3).trimEnd()}...` : rawValue;
  return `${preview}${suffix}`;
};

const fitDiscordContent = (content: string): string =>
  content.length <= MAX_DISCORD_CONTENT_LENGTH
    ? content
    : `${content.slice(0, MAX_DISCORD_CONTENT_LENGTH - 3).trimEnd()}...`;

const buildBasicsModal = (values: ProjectBrainDraftValues): ModalBuilder => {
  const modal = new ModalBuilder().setCustomId(BASICS_MODAL_ID).setTitle("Project setup: basics");
  const rows: ActionRowBuilder<ModalActionRowComponentBuilder>[] = [
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
      withOptionalValue(
        new TextInputBuilder()
          .setCustomId("name")
          .setLabel("Project name")
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
        values.name.slice(0, 100),
      ),
    ),
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
      withOptionalValue(
        new TextInputBuilder()
          .setCustomId("description")
          .setLabel("What is the project about?")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setPlaceholder(DEFAULT_AI_PLACEHOLDER),
        values.description.slice(0, 4000),
      ),
    ),
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
      withOptionalValue(
        new TextInputBuilder()
          .setCustomId("mainGoal")
          .setLabel("What is the main goal?")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setPlaceholder(DEFAULT_AI_PLACEHOLDER),
        values.mainGoal.slice(0, 4000),
      ),
    ),
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
      withOptionalValue(
        new TextInputBuilder()
          .setCustomId("linkedRepoUrl")
          .setLabel("GitHub repo URL (optional)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder(OPTIONAL_REPO_PLACEHOLDER)
          .setRequired(false),
        values.linkedRepoUrl.slice(0, 200),
      ),
    ),
  ];
  modal.addComponents(...rows);
  return modal;
};

const buildDetailsModal = (values: ProjectBrainDraftValues): ModalBuilder => {
  const modal = new ModalBuilder().setCustomId(DETAILS_MODAL_ID).setTitle("Project setup: details");
  const rows: ActionRowBuilder<ModalActionRowComponentBuilder>[] = [
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
      withOptionalValue(
        new TextInputBuilder()
          .setCustomId("ideas")
          .setLabel("Existing features or ideas")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder(DEFAULT_AI_PLACEHOLDER)
          .setRequired(false),
        values.ideas.join("\n").slice(0, 4000),
      ),
    ),
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
      withOptionalValue(
        new TextInputBuilder()
          .setCustomId("constraints")
          .setLabel("Constraints or requirements")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder(DEFAULT_AI_PLACEHOLDER)
          .setRequired(false),
        values.constraints.join("\n").slice(0, 4000),
      ),
    ),
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
      withOptionalValue(
        new TextInputBuilder()
          .setCustomId("techStack")
          .setLabel("Tech stack used or considered")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder(REQUIRED_TECH_STACK_PLACEHOLDER)
          .setRequired(true),
        values.techStack.join("\n").slice(0, 4000),
      ),
    ),
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
      withOptionalValue(
        new TextInputBuilder()
          .setCustomId("decisions")
          .setLabel("Decisions already made")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder(DEFAULT_AI_PLACEHOLDER)
          .setRequired(false),
        values.decisions.join("\n").slice(0, 4000),
      ),
    ),
    new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
      withOptionalValue(
        new TextInputBuilder()
          .setCustomId("notes")
          .setLabel("Extra notes")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder(DEFAULT_AI_PLACEHOLDER)
          .setRequired(false),
        values.notes.slice(0, 4000),
      ),
    ),
  ];
  modal.addComponents(...rows);
  return modal;
};

const buildContinueComponents = () => [
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(CONTINUE_BUTTON_ID)
      .setLabel("Continue setup")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(CANCEL_BUTTON_ID)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary),
  ),
];

const buildReviewComponents = () => [
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(SAVE_WITH_SUGGESTIONS_BUTTON_ID)
      .setLabel("Save with suggestions")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(SAVE_WITHOUT_SUGGESTIONS_BUTTON_ID)
      .setLabel("Save without suggestions")
      .setStyle(ButtonStyle.Secondary),
  ),
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(EDIT_BUTTON_ID)
      .setLabel("Edit answers")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(CANCEL_BUTTON_ID)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary),
  ),
];

const buildReviewSummary = (brain: ProjectBrain, name: string): string =>
  fitDiscordContent([
    `Review project setup for ${name}`,
    "Suggested fields are marked with `(suggested)`.",
    "",
    `Goal: ${formatField(brain.mainGoal)}`,
    `Key ideas: ${formatField(brain.ideas)}`,
    `Tech stack: ${formatField(brain.techStack)}`,
  ].join("\n"));

const buildCreatedSummary = (project: Project): string =>
  fitDiscordContent([
    `Project created: ${project.name}`,
    `Goal: ${formatField(project.brain?.mainGoal)}`,
    `Key ideas: ${formatField(project.brain?.ideas)}`,
    `Tech stack: ${formatField(project.brain?.techStack)}`,
    `GitHub repo: ${project.linkedRepoUrl ?? "Not set."}`,
    "",
    `Active project: ${project.name}`,
  ].join("\n"));

export class ProjectSetupFlow {
  private readonly states = new Map<string, ProjectSetupState>();

  constructor(private readonly engine: BrainstormingEngine) {}

  async showBasicsModal(
    interaction: ChatInputCommandInteraction,
    scopeId: string,
    projectName?: string,
  ): Promise<void> {
    const state = this.getState(scopeId, interaction.user.id);
    const values = state?.values ?? {
      ...defaultValues(),
      name: projectName?.trim() ?? "",
    };
    await interaction.showModal(buildBasicsModal(values));
  }

  async handleModalSubmit(interaction: ModalSubmitInteraction, scopeId: string): Promise<boolean> {
    if (interaction.customId === BASICS_MODAL_ID) {
      const previous = this.getState(scopeId, interaction.user.id)?.values ?? defaultValues();
      this.drafts.delete(this.key(scopeId, interaction.user.id));
      this.setState(scopeId, interaction.user.id, {
        values: {
          ...previous,
          name: interaction.fields.getTextInputValue("name").trim(),
          linkedRepoUrl: interaction.fields.getTextInputValue("linkedRepoUrl").trim(),
          description: interaction.fields.getTextInputValue("description").trim(),
          mainGoal: interaction.fields.getTextInputValue("mainGoal").trim(),
        },
      });

      await interaction.reply({
        content: "Basics captured. Continue when you want to fill the project details.",
        components: buildContinueComponents(),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (interaction.customId === DETAILS_MODAL_ID) {
      const state = this.requireState(scopeId, interaction.user.id);
      const values: ProjectBrainDraftValues = {
        ...state.values,
        ideas: parseList(interaction.fields.getTextInputValue("ideas")),
        constraints: parseList(interaction.fields.getTextInputValue("constraints")),
        techStack: parseList(interaction.fields.getTextInputValue("techStack")),
        decisions: parseList(interaction.fields.getTextInputValue("decisions")),
        notes: interaction.fields.getTextInputValue("notes").trim(),
      };

      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      });

      const draft = await this.engine.prepareProjectBrainDraft(scopeId, values);
      this.setState(scopeId, interaction.user.id, {
        values,
      });
      this.drafts.set(this.key(scopeId, interaction.user.id), draft);

      await interaction.editReply({
        content: buildReviewSummary(draft.review, draft.input.name),
        components: buildReviewComponents(),
      });
      return true;
    }

    return false;
  }

  async handleButton(interaction: ButtonInteraction, scopeId: string): Promise<boolean> {
    const customId = interaction.customId;
    if (!customId.startsWith("project-setup:")) {
      return false;
    }

    if (customId === CONTINUE_BUTTON_ID) {
      const state = this.requireState(scopeId, interaction.user.id);
      await interaction.showModal(buildDetailsModal(state.values));
      return true;
    }

    if (customId === EDIT_BUTTON_ID) {
      const state = this.requireState(scopeId, interaction.user.id);
      await interaction.showModal(buildBasicsModal(state.values));
      return true;
    }

    if (customId === CANCEL_BUTTON_ID) {
      this.clearState(scopeId, interaction.user.id);
      await interaction.update({
        content: "Project setup canceled.",
        components: [],
      });
      return true;
    }

    const draft = this.drafts.get(this.key(scopeId, interaction.user.id));
    if (!draft) {
      throw new Error("Project setup draft expired. Run /project create again.");
    }

    if (customId === SAVE_WITH_SUGGESTIONS_BUTTON_ID || customId === SAVE_WITHOUT_SUGGESTIONS_BUTTON_ID) {
      const includeSuggestions = customId === SAVE_WITH_SUGGESTIONS_BUTTON_ID;
      const project = await this.engine.createProjectFromDraft(scopeId, draft, includeSuggestions);
      await this.engine.selectProject(scopeId, project.id);
      this.clearState(scopeId, interaction.user.id);
      await interaction.update({
        content: buildCreatedSummary(project),
        components: [],
      });
      return true;
    }

    return false;
  }

  private readonly drafts = new Map<string, Awaited<ReturnType<BrainstormingEngine["prepareProjectBrainDraft"]>>>();

  private key(scopeId: string, userId: string): string {
    return `${scopeId}:${userId}`;
  }

  private getState(scopeId: string, userId: string): ProjectSetupState | undefined {
    return this.states.get(this.key(scopeId, userId));
  }

  private setState(scopeId: string, userId: string, state: ProjectSetupState) {
    this.states.set(this.key(scopeId, userId), state);
  }

  private requireState(scopeId: string, userId: string): ProjectSetupState {
    const state = this.getState(scopeId, userId);
    if (!state) {
      throw new Error("Project setup expired. Run /project create again.");
    }
    return state;
  }

  private clearState(scopeId: string, userId: string) {
    const key = this.key(scopeId, userId);
    this.states.delete(key);
    this.drafts.delete(key);
  }
}
