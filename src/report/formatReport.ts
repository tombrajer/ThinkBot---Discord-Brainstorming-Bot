import { SessionReport } from "../domain/types.js";

const cleanDiscordText = (value: string): string => {
  const withoutFences = value.replace(/```(?:json)?/gi, "").replace(/```/g, "");
  const withoutObjectDump = withoutFences.replace(/\[object Object\]/g, "details unavailable");
  return withoutObjectDump.trim();
};

const section = (title: string, items: string[]): string => {
  const cleanedItems = items.map((item) => cleanDiscordText(item)).filter(Boolean);
  if (cleanedItems.length === 0) {
    return `${title}:\n- None`;
  }
  return `${title}:\n${cleanedItems.map((item) => `- ${item}`).join("\n")}`;
};

export const formatReport = (report: SessionReport): string => {
  return [
    `Session goal:`,
    `- ${cleanDiscordText(report.sessionGoal) || "No clear goal captured."}`,
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
