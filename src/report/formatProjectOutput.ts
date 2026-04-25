import { BrainstormReport, ProjectSummaryReport } from "../domain/types.js";

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

export const formatProjectSummary = (report: ProjectSummaryReport): string =>
  [
    "Current direction:",
    `- ${cleanDiscordText(report.currentDirection) || "No clear current direction captured."}`,
    "",
    section("Important themes", report.importantThemes),
    "",
    section("Recent changes", report.recentChanges),
    "",
    section("Open issues", report.openIssues),
    "",
    section("Current next focus", report.currentNextFocus),
    "",
    section("Relevant past context", report.relevantPastContext),
    "",
    section("Repo observations", report.repoObservations),
  ].join("\n");

export const formatBrainstormReport = (report: BrainstormReport): string =>
  [
    section("Core Ideas", report.coreIdeas),
    "",
    section("Variations & Twists", report.variationsTwists),
    "",
    section("Gaps / Risks", report.gapsRisks),
    "",
    section("Next Steps", report.nextSteps),
    report.assumptions.length > 0 ? "" : null,
    report.assumptions.length > 0 ? section("Assumptions", report.assumptions) : null,
    report.repoObservations.length > 0 ? "" : null,
    report.repoObservations.length > 0 ? section("Repo Observations", report.repoObservations) : null,
  ]
    .filter((item): item is string => Boolean(item))
    .join("\n");
