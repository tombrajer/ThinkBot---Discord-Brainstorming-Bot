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
import { Project, ProjectBrainDraft, ProjectEditableFieldKey } from "../domain/types.js";

const EDIT_MODAL_PREFIX = "project-brain:edit";
const EDIT_INPUT_ID = "value";
const REFINE_APPLY_ID = "project-brain:refine-apply";
const REFINE_CANCEL_ID = "project-brain:refine-cancel";
const MAX_DISCORD_CONTENT_LENGTH = 2_000;

const EDITABLE_FIELDS: Record<
  ProjectEditableFieldKey,
  { label: string; style: TextInputStyle; required: boolean; placeholder: string; list: boolean }
> = {
  description: {
    label: "Project description",
    style: TextInputStyle.Paragraph,
    required: false,
    placeholder: "Describe the project clearly.",
    list: false,
  },
  mainGoal: {
    label: "Main goal",
    style: TextInputStyle.Paragraph,
    required: false,
    placeholder: "What should this project achieve?",
    list: false,
  },
  targetUsers: {
    label: "Target users",
    style: TextInputStyle.Paragraph,
    required: false,
    placeholder: "Comma or newline separated users.",
    list: true,
  },
  problemsSolved: {
    label: "Problems solved",
    style: TextInputStyle.Paragraph,
    required: false,
    placeholder: "Comma or newline separated problems.",
    list: true,
  },
  ideas: {
    label: "Ideas or features",
    style: TextInputStyle.Paragraph,
    required: false,
    placeholder: "Comma or newline separated ideas.",
    list: true,
  },
  constraints: {
    label: "Constraints",
    style: TextInputStyle.Paragraph,
    required: false,
    placeholder: "Comma or newline separated constraints.",
    list: true,
  },
  techStack: {
    label: "Tech stack",
    style: TextInputStyle.Paragraph,
    required: false,
    placeholder: "Comma or newline separated stack items.",
    list: true,
  },
  decisions: {
    label: "Decisions",
    style: TextInputStyle.Paragraph,
    required: false,
    placeholder: "Comma or newline separated decisions.",
    list: true,
  },
  notes: {
    label: "Notes",
    style: TextInputStyle.Paragraph,
    required: false,
    placeholder: "Extra notes to remember.",
    list: false,
  },
  linkedRepoUrl: {
    label: "GitHub repo URL",
    style: TextInputStyle.Short,
    required: false,
    placeholder: "Leave blank to clear the linked repo.",
    list: false,
  },
};

const truncateContent = (content: string): string =>
  content.length <= MAX_DISCORD_CONTENT_LENGTH
    ? content
    : `${content.slice(0, MAX_DISCORD_CONTENT_LENGTH - 3).trimEnd()}...`;

const formatFieldValue = (value?: string | string[]): string =>
  Array.isArray(value) ? value.join(", ") || "Not set." : value?.trim() || "Not set.";

const projectFieldValue = (project: Project, field: ProjectEditableFieldKey): string => {
  if (field === "linkedRepoUrl") {
    return project.linkedRepoUrl ?? "";
  }

  const brainField = project.brain?.[field];
  if (!brainField) {
    return "";
  }
  return Array.isArray(brainField.value) ? brainField.value.join("\n") : brainField.value;
};

const buildEditModal = (project: Project, field: ProjectEditableFieldKey): ModalBuilder => {
  const config = EDITABLE_FIELDS[field];
  const value = projectFieldValue(project, field).slice(0, 4000);
  return new ModalBuilder()
    .setCustomId(`${EDIT_MODAL_PREFIX}:${field}`)
    .setTitle(`Edit ${config.label}`)
    .addComponents(
      new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
        (() => {
          const input = new TextInputBuilder()
            .setCustomId(EDIT_INPUT_ID)
            .setLabel(config.label)
            .setStyle(config.style)
            .setRequired(config.required)
            .setPlaceholder(config.placeholder);
          return value.trim() ? input.setValue(value) : input;
        })(),
      ),
    );
};

const buildRefineSummary = (project: Project, draft: ProjectBrainDraft): string =>
  truncateContent(
    [
      `Refine project brain for ${project.name}`,
      "Only missing or weak fields are updated here. User-provided strong fields stay unchanged.",
      "",
      `Description: ${formatFieldValue(draft.review.description?.value)}`,
      `Goal: ${formatFieldValue(draft.review.mainGoal?.value)}`,
      `Ideas: ${formatFieldValue(draft.review.ideas?.value)}`,
      `Constraints: ${formatFieldValue(draft.review.constraints?.value)}`,
      `Tech stack: ${formatFieldValue(draft.review.techStack?.value)}`,
      `Decisions: ${formatFieldValue(draft.review.decisions?.value)}`,
      `Notes: ${formatFieldValue(draft.review.notes?.value)}`,
    ].join("\n"),
  );

const buildRefineButtons = () => [
  new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(REFINE_APPLY_ID)
      .setLabel("Apply suggestions")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(REFINE_CANCEL_ID)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary),
  ),
];

const parseEditInput = (value: string, list: boolean): string[] =>
  list
    ? value
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [value.trim()].filter(Boolean);

export class ProjectBrainFlow {
  private readonly refinementDrafts = new Map<string, { projectId: string; draft: ProjectBrainDraft }>();

  constructor(private readonly engine: BrainstormingEngine) {}

  async showEditModal(
    interaction: ChatInputCommandInteraction,
    scopeId: string,
    field: ProjectEditableFieldKey,
  ): Promise<void> {
    const project = await this.requireActiveProject(scopeId);
    await interaction.showModal(buildEditModal(project, field));
  }

  async showRefineReview(
    interaction: ChatInputCommandInteraction,
    scopeId: string,
  ): Promise<void> {
    const project = await this.requireActiveProject(scopeId);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const draft = await this.engine.prepareProjectRefinement(scopeId, project.id);
    this.refinementDrafts.set(this.key(scopeId, interaction.user.id), { projectId: project.id, draft });
    await interaction.editReply({
      content: buildRefineSummary(project, draft),
      components: buildRefineButtons(),
    });
  }

  async handleModalSubmit(interaction: ModalSubmitInteraction, scopeId: string): Promise<boolean> {
    if (!interaction.customId.startsWith(`${EDIT_MODAL_PREFIX}:`)) {
      return false;
    }

    const field = interaction.customId.slice(`${EDIT_MODAL_PREFIX}:`.length) as ProjectEditableFieldKey;
    const config = EDITABLE_FIELDS[field];
    if (!config) {
      throw new Error("Unsupported project field.");
    }

    const project = await this.requireActiveProject(scopeId);
    const values = parseEditInput(interaction.fields.getTextInputValue(EDIT_INPUT_ID), config.list);
    const updated = await this.engine.updateProjectBrainField(scopeId, project.id, field, values);
    const updatedValue =
      field === "linkedRepoUrl"
        ? updated.linkedRepoUrl
        : updated.brain?.[field]?.value;

    await interaction.reply({
      content: truncateContent(
        `Updated ${config.label} for ${updated.name}.\nValue: ${formatFieldValue(updatedValue)}`,
      ),
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  async handleButton(interaction: ButtonInteraction, scopeId: string): Promise<boolean> {
    if (interaction.customId !== REFINE_APPLY_ID && interaction.customId !== REFINE_CANCEL_ID) {
      return false;
    }

    const draftState = this.refinementDrafts.get(this.key(scopeId, interaction.user.id));
    if (!draftState) {
      throw new Error("Project refinement expired. Run /project refine again.");
    }

    if (interaction.customId === REFINE_CANCEL_ID) {
      this.refinementDrafts.delete(this.key(scopeId, interaction.user.id));
      await interaction.update({
        content: "Project refinement canceled.",
        components: [],
      });
      return true;
    }

    const updated = await this.engine.applyProjectRefinement(scopeId, draftState.projectId, draftState.draft);
    this.refinementDrafts.delete(this.key(scopeId, interaction.user.id));
    await interaction.update({
      content: truncateContent(`Applied refinement suggestions to ${updated.name}.`),
      components: [],
    });
    return true;
  }

  private async requireActiveProject(scopeId: string): Promise<Project> {
    const project = await this.engine.getActiveProject(scopeId);
    if (!project) {
      throw new Error("No active project selected.");
    }
    return project;
  }

  private key(scopeId: string, userId: string): string {
    return `${scopeId}:${userId}`;
  }
}
