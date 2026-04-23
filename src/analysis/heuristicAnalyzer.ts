import { AnalysisInput, Analyzer } from "../domain/types.js";

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "to",
  "for",
  "of",
  "in",
  "on",
  "we",
  "is",
  "it",
  "this",
  "that",
  "with",
  "be",
  "as",
]);

const topKeywords = (messages: string[]): string[] => {
  const counts = new Map<string, number>();
  for (const msg of messages) {
    const words = msg
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
    for (const word of words) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map((entry) => entry[0]);
};

export class HeuristicAnalyzer implements Analyzer {
  async analyze(input: AnalysisInput) {
    const messageTexts = input.messages.map((m) => m.content.trim()).filter(Boolean);
    const ideas = messageTexts.slice(0, 8).map((text) => text.replace(/\s+/g, " "));
    const keywords = topKeywords(messageTexts);
    const memorySnippets = input.relevantPastContext
      .slice(-3)
      .map((memory) => memory.content)
      .filter(Boolean);

    const goal =
      ideas[0] ??
      `Brainstorm direction for project "${input.project.name}" and identify strongest next moves.`;

    return {
      sessionGoal: goal,
      mainIdeasRaised: ideas.length > 0 ? ideas : ["No clear ideas were captured in this session."],
      patternsThemes:
        keywords.length > 0
          ? keywords.map((kw) => `Recurring theme around "${kw}".`)
          : ["Themes were unclear due to low-signal inputs."],
      strongestIdeas:
        ideas.length > 0
          ? [ideas[0], ideas[1]].filter(Boolean) as string[]
          : ["Define one clear user problem before exploring solutions."],
      weakPointsConcerns: [
        "Some ideas need sharper problem statements and user definition.",
        "Feasibility assumptions were not validated in detail.",
      ],
      missingQuestions: [
        "Who is the primary user and what painful workflow are they solving?",
        "What does success look like in the first 2 weeks after release?",
      ],
      suggestions: [
        "Pick one narrow MVP flow and defer optional features.",
        "Define 2-3 measurable success metrics before implementation.",
      ],
      relevantPastContext:
        memorySnippets.length > 0
          ? memorySnippets
          : ["No prior project memory found yet."],
      repoObservations: [],
    };
  }
}
