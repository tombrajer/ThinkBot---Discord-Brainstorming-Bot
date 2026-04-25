import {
  ProjectBrain,
  ProjectBrainDraft,
  ProjectBrainDraftValues,
  ProjectBrainField,
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
): ProjectBrain => {
  const normalizedInput = normalizeProjectBrainDraftValues(input);

  const pickText = (userValue: string, suggestedValue: string) =>
    createTextField(
      includeSuggestions && normalizeText(suggestedValue)
        ? suggestedValue
        : userValue || (includeSuggestions ? suggestedValue : ""),
      includeSuggestions && normalizeText(suggestedValue)
        ? "ai-suggested"
        : userValue
          ? "user"
          : "ai-suggested",
    );

  const pickList = (userValue: string[], suggestedValue: string[]) =>
    createListField(
      includeSuggestions && normalizeList(suggestedValue).length > 0
        ? suggestedValue
        : userValue.length > 0
          ? userValue
          : includeSuggestions
            ? suggestedValue
            : [],
      includeSuggestions && normalizeList(suggestedValue).length > 0
        ? "ai-suggested"
        : userValue.length > 0
          ? "user"
          : "ai-suggested",
    );

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
): ProjectBrainDraft => {
  const normalizedInput = normalizeProjectBrainDraftValues(input);
  return {
    input: normalizedInput,
    suggestions,
    review: buildProjectBrainReview(normalizedInput, suggestions, true),
  };
};

export const getProjectDescription = (
  input: { description?: string; brain?: ProjectBrain },
): string | undefined => {
  const explicitDescription = normalizeText(input.description);
  if (explicitDescription) {
    return explicitDescription;
  }
  return input.brain?.description?.value;
};
