import {
  AnalysisInput,
  Analyzer,
  ProjectBrainSuggestionInput,
  ProjectBrainSuggestionOutput,
} from "../domain/types.js";

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

const normalizeText = (value: string): string => value.trim();
const normalizeList = (values: string[]): string[] =>
  values.map((value) => value.trim()).filter(Boolean);
const titleCase = (value: string): string =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const pickPrimaryUser = (input: ProjectBrainSuggestionInput): string => {
  const existing = normalizeList(input.userInput.targetUsers)[0];
  if (existing) {
    return existing;
  }

  const context = `${input.projectName} ${input.userInput.description}`.toLowerCase();
  if (context.includes("discord")) {
    return "Discord communities";
  }
  if (context.includes("team") || context.includes("collab")) {
    return "small teams";
  }
  if (context.includes("founder") || context.includes("startup")) {
    return "founders exploring new product ideas";
  }
  return "people exploring an early product idea";
};

const pickPrimaryProblem = (input: ProjectBrainSuggestionInput): string => {
  const existing = normalizeList(input.userInput.problemsSolved)[0];
  if (existing) {
    return existing;
  }

  const description = normalizeText(input.userInput.description);
  if (description) {
    return description.replace(/\.$/, "");
  }

  return `turn unclear brainstorming for ${input.projectName} into something structured`;
};

const buildSuggestions = (input: ProjectBrainSuggestionInput): ProjectBrainSuggestionOutput => {
  const primaryUser = pickPrimaryUser(input);
  const primaryProblem = pickPrimaryProblem(input);
  const description = normalizeText(input.userInput.description);
  const mainGoal = normalizeText(input.userInput.mainGoal);
  const notes = normalizeText(input.userInput.notes);
  const ideaHints = normalizeList(input.userInput.ideas);
  const constraintHints = normalizeList(input.userInput.constraints);
  const decisionHints = normalizeList(input.userInput.decisions);
  const techHints = normalizeList(input.userInput.techStack);
  const stackContext = [
    input.projectName,
    description,
    mainGoal,
    ...techHints,
    ...ideaHints,
  ]
    .join(" ")
    .toLowerCase();

  const inferTechStack = (): string[] => {
    if (stackContext.includes("discord")) {
      return ["TypeScript", "discord.js", "JSON storage", "Ollama"];
    }
    if (
      stackContext.includes("web") ||
      stackContext.includes("website") ||
      stackContext.includes("web page") ||
      stackContext.includes("landing page")
    ) {
      return ["TypeScript", "React or Next.js", "Tailwind CSS", "Vercel or Netlify"];
    }
    if (stackContext.includes("mobile")) {
      return ["React Native", "TypeScript", "Expo", "SQLite or Supabase"];
    }
    if (stackContext.includes("api") || stackContext.includes("backend")) {
      return ["TypeScript", "Node.js", "Express or Fastify", "PostgreSQL"];
    }
    return techHints.length > 0
      ? techHints.map((item) => titleCase(item))
      : ["TypeScript", "Node.js", "JSON storage"];
  };

  return {
    description: description
      ? `${input.projectName} focuses on ${description.replace(/\.$/, "")}.`
      : `${input.projectName} is focused on helping ${primaryUser.toLowerCase()} ${primaryProblem}.`,
    mainGoal: mainGoal
      ? mainGoal.replace(/\.$/, "")
      : `Help ${primaryUser.toLowerCase()} ${primaryProblem} with a workflow that stays easy to use.`,
    targetUsers: input.userInput.targetUsers.length > 0 ? [] : [primaryUser],
    problemsSolved: input.userInput.problemsSolved.length > 0 ? [] : [primaryProblem],
    ideas:
      input.userInput.ideas.length > 0
        ? ideaHints.map((idea) => `${idea.replace(/\.$/, "")}.`)
        : [
            "Capture messy discussion in one place and turn it into a clear summary.",
            "Keep the first version narrow around one repeated user workflow.",
          ],
    constraints:
      input.userInput.constraints.length > 0
        ? constraintHints.map((constraint) => constraint.replace(/\.$/, ""))
        : ["Keep the first version lightweight and focused on the core workflow."],
    techStack: inferTechStack(),
    decisions:
      input.userInput.decisions.length > 0
        ? decisionHints.map((decision) => decision.replace(/\.$/, ""))
        : [],
    notes:
      notes
        ? notes
        : "Suggestion: keep the setup incomplete-friendly so the project can improve over time.",
  };
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

    const primaryTheme = keywords[0] ?? "core workflow";
    const secondaryTheme = keywords[1] ?? "activation";
    const tertiaryTheme = keywords[2] ?? "retention";

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
        `Idea: Build a focused "${primaryTheme}" command flow. Features: one-click entry command, clear next action prompt, lightweight status output. Implementation: add command handler + scoped state transitions + response formatter. Creative twist: include a rotating "try this next" nudge based on recent session themes.`,
        `Idea: Add a structured idea board around "${secondaryTheme}". Features: cluster ideas into buckets (problem, solution, risks), quick vote reactions, top-3 auto-highlight. Implementation: persist tagged idea items and compute simple ranking at /end-session. Creative twist: add an "unpopular but high-leverage" bucket for contrarian ideas.`,
        `Idea: Create an experimentation loop for "${tertiaryTheme}". Features: each strong idea gets hypothesis, success metric, and first test plan. Implementation: enrich Suggestions output with an "experiment card" template and track outcome notes in project memory. Creative twist: auto-suggest one low-cost experiment and one bold experiment per session.`,
        "Define 2-3 measurable success metrics before implementation so idea quality can be compared across sessions.",
      ],
      relevantPastContext:
        memorySnippets.length > 0
          ? memorySnippets
          : ["No prior project memory found yet."],
      repoObservations: [],
    };
  }

  async suggestProjectBrain(
    input: ProjectBrainSuggestionInput,
  ): Promise<ProjectBrainSuggestionOutput> {
    return buildSuggestions(input);
  }
}
