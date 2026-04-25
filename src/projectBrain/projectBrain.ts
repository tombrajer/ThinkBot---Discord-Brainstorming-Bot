import {
  Project,
  ProjectBrain,
  ProjectBrainDraft,
  ProjectBrainDraftValues,
  ProjectBrainField,
  ProjectBrainFieldKey,
  ProjectBrainSuggestionOutput,
} from "../domain/types.js";

const normalizeText = (value: string | undefined): string => value?.trim() ?? "";

const normalizeList = (values: string[] | undefined): string[] =>
  (values ?? []).map((value) => value.trim()).filter(Boolean);

const createTextField = (
  value: string,
  source: ProjectBrainField<string>["source"],
): ProjectBrainField<string> | undefined => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return undefined;
  }
  return { value: normalized, source };
};

const createListField = (
  values: string[],
  source: ProjectBrainField<string[]>["source"],
): ProjectBrainField<string[]> | undefined => {
  const normalized = normalizeList(values);
  if (normalized.length === 0) {
    return undefined;
  }
  return { value: normalized, source };
};

export const normalizeProjectBrainDraftValues = (
  input: ProjectBrainDraftValues,
): ProjectBrainDraftValues => ({
  name: normalizeText(input.name),
  linkedRepoUrl: normalizeText(input.linkedRepoUrl),
  description: normalizeText(input.description),
  mainGoal: normalizeText(input.mainGoal),
  targetUsers: normalizeList(input.targetUsers),
  problemsSolved: normalizeList(input.problemsSolved),
  ideas: normalizeList(input.ideas),
  constraints: normalizeList(input.constraints),
  techStack: normalizeList(input.techStack),
  decisions: normalizeList(input.decisions),
  notes: normalizeText(input.notes),
});

export const buildProjectBrainReview = (
  input: ProjectBrainDraftValues,
  suggestions: ProjectBrainSuggestionOutput,
  includeSuggestions = true,
  rewriteUserValuesWithSuggestions = false,
): ProjectBrain => {
  const normalizedInput = normalizeProjectBrainDraftValues(input);

  const pickText = (userValue: string, suggestedValue: string) =>
    userValue
      ? createTextField(
          rewriteUserValuesWithSuggestions && includeSuggestions && normalizeText(suggestedValue)
            ? suggestedValue
            : userValue,
          "user",
        )
      : createTextField(includeSuggestions ? suggestedValue : "", "ai-suggested");

  const pickList = (userValue: string[], suggestedValue: string[]) =>
    userValue.length > 0
      ? createListField(
          rewriteUserValuesWithSuggestions && includeSuggestions && normalizeList(suggestedValue).length > 0
            ? suggestedValue
            : userValue,
          "user",
        )
      : createListField(includeSuggestions ? suggestedValue : [], "ai-suggested");

  return {
    description: pickText(normalizedInput.description, suggestions.description),
    mainGoal: pickText(normalizedInput.mainGoal, suggestions.mainGoal),
    targetUsers: pickList(normalizedInput.targetUsers, suggestions.targetUsers),
    problemsSolved: pickList(normalizedInput.problemsSolved, suggestions.problemsSolved),
    ideas: pickList(normalizedInput.ideas, suggestions.ideas),
    constraints: pickList(normalizedInput.constraints, suggestions.constraints),
    techStack: pickList(normalizedInput.techStack, suggestions.techStack),
    decisions: pickList(normalizedInput.decisions, suggestions.decisions),
    notes: pickText(normalizedInput.notes, suggestions.notes),
  };
};

export const buildProjectBrainDraft = (
  input: ProjectBrainDraftValues,
  suggestions: ProjectBrainSuggestionOutput,
  rewriteUserValuesWithSuggestions = false,
): ProjectBrainDraft => {
  const normalizedInput = normalizeProjectBrainDraftValues(input);
  return {
    input: normalizedInput,
    suggestions,
    review: buildProjectBrainReview(
      normalizedInput,
      suggestions,
      true,
      rewriteUserValuesWithSuggestions,
    ),
  };
};

export const projectToBrainDraftValues = (project: Project): ProjectBrainDraftValues => ({
  name: project.name,
  linkedRepoUrl: normalizeText(project.linkedRepoUrl),
  description: normalizeText(project.brain?.description?.value ?? project.description),
  mainGoal: normalizeText(project.brain?.mainGoal?.value),
  targetUsers: normalizeList(project.brain?.targetUsers?.value),
  problemsSolved: normalizeList(project.brain?.problemsSolved?.value),
  ideas: normalizeList(project.brain?.ideas?.value),
  constraints: normalizeList(project.brain?.constraints?.value),
  techStack: normalizeList(project.brain?.techStack?.value),
  decisions: normalizeList(project.brain?.decisions?.value),
  notes: normalizeText(project.brain?.notes?.value),
});

const weakTextField = (field?: ProjectBrainField<string>): boolean =>
  !field || field.source === "ai-suggested" || field.value.trim().length < 20;

const weakListField = (field?: ProjectBrainField<string[]>): boolean =>
  !field || field.source === "ai-suggested" || field.value.length < 2;

const shouldRefineField = (project: Project, field: ProjectBrainFieldKey): boolean => {
  switch (field) {
    case "description":
      return weakTextField(project.brain?.description);
    case "mainGoal":
      return weakTextField(project.brain?.mainGoal);
    case "notes":
      return weakTextField(project.brain?.notes);
    case "targetUsers":
      return weakListField(project.brain?.targetUsers);
    case "problemsSolved":
      return weakListField(project.brain?.problemsSolved);
    case "ideas":
      return weakListField(project.brain?.ideas);
    case "constraints":
      return weakListField(project.brain?.constraints);
    case "techStack":
      return weakListField(project.brain?.techStack);
    case "decisions":
      return weakListField(project.brain?.decisions);
  }
};

export const buildRefinementSuggestionOutput = (
  project: Project,
  suggestions: ProjectBrainSuggestionOutput,
): ProjectBrainSuggestionOutput => ({
  description: shouldRefineField(project, "description") ? suggestions.description : "",
  mainGoal: shouldRefineField(project, "mainGoal") ? suggestions.mainGoal : "",
  targetUsers: shouldRefineField(project, "targetUsers") ? suggestions.targetUsers : [],
  problemsSolved: shouldRefineField(project, "problemsSolved") ? suggestions.problemsSolved : [],
  ideas: shouldRefineField(project, "ideas") ? suggestions.ideas : [],
  constraints: shouldRefineField(project, "constraints") ? suggestions.constraints : [],
  techStack: shouldRefineField(project, "techStack") ? suggestions.techStack : [],
  decisions: shouldRefineField(project, "decisions") ? suggestions.decisions : [],
  notes: shouldRefineField(project, "notes") ? suggestions.notes : "",
});

export const getProjectDescription = (
  input: { description?: string; brain?: ProjectBrain },
): string | undefined => {
  const explicitDescription = normalizeText(input.description);
  if (explicitDescription) {
    return explicitDescription;
  }
  return input.brain?.description?.value;
};
