import { SessionReport } from "../domain/types.js";

const section = (title: string, items: string[]): string => {
  if (items.length === 0) {
    return `## ${title}\n- None`;
  }
  return `## ${title}\n${items.map((item) => `- ${item}`).join("\n")}`;
};

export const formatReport = (report: SessionReport): string => {
  return [
    `## Session goal`,
    `- ${report.sessionGoal}`,
    "",
    section("Main ideas raised", report.mainIdeasRaised),
    "",
    section("Patterns / themes", report.patternsThemes),
    "",
    section("Strongest ideas", report.strongestIdeas),
    "",
    section("Weak points / concerns", report.weakPointsConcerns),
    "",
    section("Missing questions", report.missingQuestions),
    "",
    section("Suggestions", report.suggestions),
    "",
    section("Relevant past context", report.relevantPastContext),
    "",
    section("Repo-aware observations", report.repoObservations),
  ].join("\n");
};
