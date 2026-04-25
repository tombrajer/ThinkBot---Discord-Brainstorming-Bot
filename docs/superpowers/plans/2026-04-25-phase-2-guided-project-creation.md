# Phase 2 Guided Project Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build guided `/project create` setup with structured project brain fields, AI-backed suggestions for skipped fields, and Discord review controls that save compatible project data.

**Architecture:** Extend the domain model so projects can store structured brain fields with source metadata while keeping the existing `description` field and JSON shape compatible. Add a suggestion path in the analyzer layer that can infer missing fields with heuristic fallback and optional Ollama support, then wire a Discord setup coordinator that manages a two-step modal flow and explicit accept/edit/skip actions before persisting the project.

**Tech Stack:** TypeScript, discord.js modals/buttons, existing JSON store, Ollama analyzer with heuristic fallback, Vitest

---

### Task 1: Add project brain domain types and migration-safe project creation support

**Files:**
- Modify: `C:\Users\Suntech\Documents\CodexProjects\BrainstormingBot\brainstorming-bot\src\domain\types.ts`
- Modify: `C:\Users\Suntech\Documents\CodexProjects\BrainstormingBot\brainstorming-bot\src\storage\jsonStore.ts`
- Modify: `C:\Users\Suntech\Documents\CodexProjects\BrainstormingBot\brainstorming-bot\src\core\brainstormingEngine.ts`
- Test: `C:\Users\Suntech\Documents\CodexProjects\BrainstormingBot\brainstorming-bot\tests\engine.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
it("stores structured project brain fields with source metadata", async () => {
  const engine = new BrainstormingEngine(new JsonStore(storePath), new HeuristicAnalyzer());

  const project = await engine.createProject("guild-1", {
    name: "ThinkBot",
    description: "Discord brainstorming bot",
    brain: {
      mainGoal: { value: "Make brainstorming always available", source: "user" },
      targetUsers: { value: ["solo builders"], source: "ai-suggested" },
    },
  });

  expect(project.brain?.mainGoal?.value).toBe("Make brainstorming always available");
  expect(project.brain?.targetUsers?.source).toBe("ai-suggested");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/engine.test.ts`
Expected: FAIL because `brain` is not part of the `Project` type or `createProject` input yet.

- [ ] **Step 3: Write minimal implementation**

```typescript
export type BrainFieldSource = "user" | "ai-suggested";

export interface ProjectBrainField<T> {
  value: T;
  source: BrainFieldSource;
}

export interface ProjectBrain {
  description?: ProjectBrainField<string>;
  mainGoal?: ProjectBrainField<string>;
  targetUsers?: ProjectBrainField<string[]>;
  problemsSolved?: ProjectBrainField<string[]>;
  ideas?: ProjectBrainField<string[]>;
  constraints?: ProjectBrainField<string[]>;
  techStack?: ProjectBrainField<string[]>;
  decisions?: ProjectBrainField<string[]>;
  notes?: ProjectBrainField<string>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/engine.test.ts`
Expected: PASS for the new project-brain persistence case.

- [ ] **Step 5: Commit**

```bash
git add src/domain/types.ts src/storage/jsonStore.ts src/core/brainstormingEngine.ts tests/engine.test.ts
git commit -m "feat: add structured project brain storage"
```

### Task 2: Add missing-field suggestion generation with heuristic fallback and Ollama support

**Files:**
- Modify: `C:\Users\Suntech\Documents\CodexProjects\BrainstormingBot\brainstorming-bot\src\domain\types.ts`
- Modify: `C:\Users\Suntech\Documents\CodexProjects\BrainstormingBot\brainstorming-bot\src\analysis\heuristicAnalyzer.ts`
- Modify: `C:\Users\Suntech\Documents\CodexProjects\BrainstormingBot\brainstorming-bot\src\analysis\ollamaAnalyzer.ts`
- Test: `C:\Users\Suntech\Documents\CodexProjects\BrainstormingBot\brainstorming-bot\tests\ollamaAnalyzer.test.ts`
- Test: `C:\Users\Suntech\Documents\CodexProjects\BrainstormingBot\brainstorming-bot\tests\engine.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
it("suggests missing project brain fields without overwriting user answers", async () => {
  const analyzer = new HeuristicAnalyzer();

  const result = await analyzer.suggestProjectBrain({
    projectName: "ThinkBot",
    userInput: {
      description: "Discord brainstorming bot",
      mainGoal: "",
      targetUsers: [],
      problemsSolved: ["Messy idea capture"],
      ideas: [],
      constraints: [],
      techStack: ["TypeScript", "Discord.js"],
      decisions: [],
      notes: "",
    },
  });

  expect(result.mainGoal).toBeTruthy();
  expect(result.techStack).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/engine.test.ts tests/ollamaAnalyzer.test.ts`
Expected: FAIL because no project-brain suggestion API exists.

- [ ] **Step 3: Write minimal implementation**

```typescript
export interface ProjectBrainSuggestionInput {
  projectName: string;
  userInput: ProjectBrainDraftValues;
}

export interface ProjectBrainSuggestionOutput {
  description: string;
  mainGoal: string;
  targetUsers: string[];
  problemsSolved: string[];
  ideas: string[];
  constraints: string[];
  techStack: string[];
  decisions: string[];
  notes: string;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/engine.test.ts tests/ollamaAnalyzer.test.ts`
Expected: PASS for suggestion generation and fallback behavior.

- [ ] **Step 5: Commit**

```bash
git add src/domain/types.ts src/analysis/heuristicAnalyzer.ts src/analysis/ollamaAnalyzer.ts tests/engine.test.ts tests/ollamaAnalyzer.test.ts
git commit -m "feat: add project brain suggestion generation"
```

### Task 3: Add engine helpers that prepare guided setup drafts and save reviewed projects

**Files:**
- Modify: `C:\Users\Suntech\Documents\CodexProjects\BrainstormingBot\brainstorming-bot\src\core\brainstormingEngine.ts`
- Test: `C:\Users\Suntech\Documents\CodexProjects\BrainstormingBot\brainstorming-bot\tests\engine.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
it("builds a reviewed project draft and saves suggested skipped fields as ai-suggested", async () => {
  const engine = new BrainstormingEngine(new JsonStore(storePath), new HeuristicAnalyzer());

  const draft = await engine.prepareProjectBrainDraft("guild-1", {
    name: "ThinkBot",
    description: "Discord brainstorming bot",
    mainGoal: "",
    targetUsers: [],
    problemsSolved: ["Messy brainstorming"],
    ideas: [],
    constraints: [],
    techStack: ["TypeScript"],
    decisions: [],
    notes: "",
  });

  const project = await engine.createProjectFromDraft("guild-1", draft, true);

  expect(project.brain?.mainGoal?.source).toBe("ai-suggested");
  expect(project.brain?.description?.source).toBe("user");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/engine.test.ts`
Expected: FAIL because the engine cannot prepare or save guided project drafts yet.

- [ ] **Step 3: Write minimal implementation**

```typescript
async prepareProjectBrainDraft(scopeId: string, input: ProjectBrainDraftValues) {
  const suggestions = await this.analyzer.suggestProjectBrain({
    projectName: input.name,
    userInput: input,
  });
  return buildProjectBrainDraft(input, suggestions);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/engine.test.ts`
Expected: PASS for draft creation, metadata preservation, and final project save.

- [ ] **Step 5: Commit**

```bash
git add src/core/brainstormingEngine.ts tests/engine.test.ts
git commit -m "feat: add guided project creation draft flow"
```

### Task 4: Add Discord guided setup coordinator for `/project create`

**Files:**
- Create: `C:\Users\Suntech\Documents\CodexProjects\BrainstormingBot\brainstorming-bot\src\discord\projectSetupFlow.ts`
- Modify: `C:\Users\Suntech\Documents\CodexProjects\BrainstormingBot\brainstorming-bot\src\discord\bot.ts`
- Modify: `C:\Users\Suntech\Documents\CodexProjects\BrainstormingBot\brainstorming-bot\src\discord\commands.ts`

- [ ] **Step 1: Write the failing test**

```typescript
it("registers grouped project create without required inline fields", () => {
  const projectCommand = commandBuilders.find((builder) => builder.name === "project");
  const createSubcommand = projectCommand?.options?.find((option) => option.name === "create");

  expect(createSubcommand?.options ?? []).toHaveLength(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/commands.test.ts`
Expected: FAIL because `/project create` still requires inline command options.

- [ ] **Step 3: Write minimal implementation**

```typescript
if (interaction.commandName === "project" && projectSubcommand === "create") {
  await projectSetupFlow.showBasicsModal(interaction, scopeId);
  return;
}

if (interaction.isModalSubmit()) {
  await projectSetupFlow.handleModalSubmit(interaction, scopeId);
  return;
}

if (interaction.isButton()) {
  await projectSetupFlow.handleButton(interaction, scopeId);
  return;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/commands.test.ts`
Expected: PASS for the grouped create command shape.

- [ ] **Step 5: Commit**

```bash
git add src/discord/projectSetupFlow.ts src/discord/bot.ts src/discord/commands.ts tests/commands.test.ts
git commit -m "feat: add guided project setup flow"
```

### Task 5: Update README for the new creation flow and run full verification

**Files:**
- Modify: `C:\Users\Suntech\Documents\CodexProjects\BrainstormingBot\brainstorming-bot\README.md`

- [ ] **Step 1: Write the failing test**

```typescript
it("documents project create as a guided setup flow", () => {
  const readme = readFileSync("README.md", "utf8");
  expect(readme).toContain("/project create");
  expect(readme).toContain("guided setup");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/commands.test.ts`
Expected: FAIL only if a dedicated README assertion test is added, otherwise skip this step and verify via manual doc review.

- [ ] **Step 3: Write minimal implementation**

```markdown
`/project create` now opens a guided setup flow that captures project context, suggests skipped fields, and lets you save with or without suggestions.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS for the full suite.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: describe guided project creation flow"
```

## Self-Review

- Spec coverage: covered Phase 2 storage, guided questions, skip-safe fields, source metadata, AI suggestions, incomplete project saves, and README updates.
- Placeholder scan: no `TODO`, `TBD`, or unresolved task references remain.
- Type consistency: uses one consistent vocabulary across the plan: `ProjectBrain`, `ProjectBrainDraftValues`, `suggestProjectBrain`, `prepareProjectBrainDraft`, and `createProjectFromDraft`.
