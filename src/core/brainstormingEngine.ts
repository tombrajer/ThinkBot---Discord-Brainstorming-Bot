import { randomUUID } from "node:crypto";
import {
  Analyzer,
  Project,
  ProjectBrain,
  ProjectBrainDraft,
  ProjectBrainDraftValues,
  ProjectEditableFieldKey,
  ProjectBrainFieldKey,
  ProjectMemory,
  ProjectSummaryReport,
  Session,
  SessionMessage,
  SessionReport,
  StoreState,
  BrainstormReport,
} from "../domain/types.js";
import {
  buildRefinementSuggestionOutput,
  buildProjectBrainDraft,
  buildProjectBrainReview,
  getProjectDescription,
  normalizeProjectBrainDraftValues,
  projectToBrainDraftValues,
} from "../projectBrain/projectBrain.js";
import { JsonStore } from "../storage/jsonStore.js";

interface CreateProjectInput {
  name: string;
  description?: string;
  brain?: ProjectBrain;
  linkedRepoUrl?: string;
}

export class BrainstormingEngine {
  constructor(
    private readonly store: JsonStore,
    private readonly analyzer: Analyzer,
  ) {}

  async createProject(scopeId: string, input: CreateProjectInput): Promise<Project> {
    return this.store.update((state) => {
      const normalizedName = input.name.trim();
      const loweredName = normalizedName.toLowerCase();
      const duplicate = state.projects.find(
        (project) => project.scopeId === scopeId && project.name.trim().toLowerCase() === loweredName,
      );
      if (duplicate) {
        throw new Error("A project with that name already exists in this scope.");
      }

      const now = new Date().toISOString();
      const project: Project = {
        id: randomUUID(),
        scopeId,
        name: normalizedName,
        description: getProjectDescription(input),
        brain: input.brain,
        linkedRepoUrl: input.linkedRepoUrl?.trim() || undefined,
        createdAt: now,
        updatedAt: now,
      };
      state.projects.push(project);
      if (!state.scopes[scopeId]) {
        state.scopes[scopeId] = {};
      }
      if (!state.scopes[scopeId].activeProjectId) {
        state.scopes[scopeId].activeProjectId = project.id;
      }
      return project;
    });
  }

  async listProjects(scopeId: string): Promise<Project[]> {
    const state = await this.store.read();
    return state.projects.filter((project) => project.scopeId === scopeId);
  }

  async prepareProjectBrainDraft(
    _scopeId: string,
    input: ProjectBrainDraftValues,
  ): Promise<ProjectBrainDraft> {
    const normalizedInput = normalizeProjectBrainDraftValues(input);
    const suggestions = await this.analyzer.suggestProjectBrain({
      projectName: normalizedInput.name,
      userInput: {
        description: normalizedInput.description,
        mainGoal: normalizedInput.mainGoal,
        targetUsers: normalizedInput.targetUsers,
        problemsSolved: normalizedInput.problemsSolved,
        ideas: normalizedInput.ideas,
        constraints: normalizedInput.constraints,
        techStack: normalizedInput.techStack,
        decisions: normalizedInput.decisions,
        notes: normalizedInput.notes,
      },
    });

    return buildProjectBrainDraft(normalizedInput, suggestions, true);
  }

  async createProjectFromDraft(
    scopeId: string,
    draft: ProjectBrainDraft,
    includeSuggestions: boolean,
  ): Promise<Project> {
    const brain = buildProjectBrainReview(
      draft.input,
      draft.suggestions,
      includeSuggestions,
      includeSuggestions,
    );
    return this.createProject(scopeId, {
      name: draft.input.name,
      description: brain.description?.value ?? draft.input.description,
      brain,
      linkedRepoUrl: draft.input.linkedRepoUrl,
    });
  }

  async prepareProjectRefinement(scopeId: string, selector: string): Promise<ProjectBrainDraft> {
    const project = await this.resolveProject(scopeId, selector);
    const input = projectToBrainDraftValues(project);
    const baseSuggestions = await this.analyzer.suggestProjectBrain({
      projectName: input.name,
      userInput: {
        description: input.description,
        mainGoal: input.mainGoal,
        targetUsers: input.targetUsers,
        problemsSolved: input.problemsSolved,
        ideas: input.ideas,
        constraints: input.constraints,
        techStack: input.techStack,
        decisions: input.decisions,
        notes: input.notes,
      },
    });

    return buildProjectBrainDraft(
      input,
      buildRefinementSuggestionOutput(project, baseSuggestions),
      false,
    );
  }

  async applyProjectRefinement(
    scopeId: string,
    selector: string,
    draft: ProjectBrainDraft,
  ): Promise<Project> {
    return this.store.update((state) => {
      const project = this.resolveProjectFromState(scopeId, selector, state.projects);
      project.brain = draft.review;
      project.description = draft.review.description?.value ?? project.description;
      project.updatedAt = new Date().toISOString();
      return project;
    });
  }

  async updateProjectBrainField(
    scopeId: string,
    selector: string,
    field: ProjectEditableFieldKey,
    values: string[],
  ): Promise<Project> {
    return this.store.update((state) => {
      const project = this.resolveProjectFromState(scopeId, selector, state.projects);
      const nextValues = values.map((value) => value.trim()).filter(Boolean);

      if (field === "linkedRepoUrl") {
        project.linkedRepoUrl = nextValues[0] ?? undefined;
        project.updatedAt = new Date().toISOString();
        return project;
      }

      const currentBrain = project.brain ?? {};
      const nextBrain: ProjectBrain = { ...currentBrain };
      this.assignBrainField(nextBrain, field, nextValues);
      project.brain = nextBrain;
      project.description = nextBrain.description?.value ?? project.description;
      project.updatedAt = new Date().toISOString();
      return project;
    });
  }

  private assignBrainField(
    brain: ProjectBrain,
    field: ProjectBrainFieldKey,
    values: string[],
  ) {
    switch (field) {
      case "targetUsers":
      case "problemsSolved":
      case "ideas":
      case "constraints":
      case "techStack":
      case "decisions":
        brain[field] = values.length > 0 ? { value: values, source: "user" } : undefined;
        return;
      case "description":
      case "mainGoal":
      case "notes": {
        const nextValue = values[0];
        brain[field] = nextValue ? { value: nextValue, source: "user" } : undefined;
        return;
      }
    }
  }

  private ensureScopeState(state: StoreState, scopeId: string) {
    if (!state.scopes[scopeId]) {
      state.scopes[scopeId] = {};
    }
    return state.scopes[scopeId];
  }

  private getActiveProjectFromState(state: StoreState, scopeId: string): Project | undefined {
    const activeProjectId = state.scopes[scopeId]?.activeProjectId;
    if (!activeProjectId) {
      return undefined;
    }
    return state.projects.find(
      (project) => project.scopeId === scopeId && project.id === activeProjectId,
    );
  }

  private requireActiveProjectFromState(state: StoreState, scopeId: string): Project {
    const project = this.getActiveProjectFromState(state, scopeId);
    if (!project) {
      throw new Error("No active project selected.");
    }
    return project;
  }

  private findActiveSession(
    state: StoreState,
    scopeId: string,
    channelId: string,
    projectId: string,
  ): Session | undefined {
    return state.sessions.find(
      (session) =>
        session.scopeId === scopeId &&
        session.channelId === channelId &&
        session.projectId === projectId &&
        session.status === "active",
    );
  }

  private buildSession(
    scopeId: string,
    projectId: string,
    channelId: string,
    startedBy: string,
  ): Session {
    return {
      id: randomUUID(),
      scopeId,
      projectId,
      channelId,
      startedBy,
      startedAt: new Date().toISOString(),
      status: "active",
      repoUsedFlag: false,
    };
  }

  private buildProjectContext(
    state: StoreState,
    scopeId: string,
    channelId: string,
  ): { project: Project; messages: SessionMessage[]; memories: ProjectMemory[] } {
    const project = this.requireActiveProjectFromState(state, scopeId);
    const session = this.findActiveSession(state, scopeId, channelId, project.id);
    const messages = session
      ? state.messages.filter((message) => message.sessionId === session.id)
      : [];
    const memories = state.memories.filter((memory) => memory.projectId === project.id);
    return { project, messages, memories };
  }

  private async ensureActiveSessionRecord(
    scopeId: string,
    channelId: string,
    startedBy: string,
  ): Promise<Session> {
    return this.store.update((state) => {
      const project = this.requireActiveProjectFromState(state, scopeId);
      const existing = this.findActiveSession(state, scopeId, channelId, project.id);
      if (existing) {
        return existing;
      }

      const session = this.buildSession(scopeId, project.id, channelId, startedBy);
      state.sessions.push(session);
      return session;
    });
  }

  private resolveProjectFromState(
    scopeId: string,
    selector: string,
    projects: Project[],
  ): Project {
    const trimmedSelector = selector.trim();
    const exactIdMatch = projects.find(
      (candidate) => candidate.scopeId === scopeId && candidate.id === trimmedSelector,
    );
    if (exactIdMatch) {
      return exactIdMatch;
    }

    const lowered = trimmedSelector.toLowerCase();
    const nameMatches = projects.filter(
      (candidate) => candidate.scopeId === scopeId && candidate.name.toLowerCase() === lowered,
    );
    if (nameMatches.length === 1) {
      return nameMatches[0];
    }
    if (nameMatches.length > 1) {
      throw new Error(
        "More than one project has that name. Use the project ID from /project-list.",
      );
    }

    throw new Error("Project not found in this scope.");
  }

  async resolveProject(scopeId: string, selector: string): Promise<Project> {
    const state = await this.store.read();
    return this.resolveProjectFromState(scopeId, selector, state.projects);
  }

  async selectProject(scopeId: string, selector: string): Promise<Project> {
    return this.store.update((state) => {
      const project = this.resolveProjectFromState(scopeId, selector, state.projects);
      this.ensureScopeState(state, scopeId).activeProjectId = project.id;
      project.updatedAt = new Date().toISOString();
      return project;
    });
  }

  async exitProject(scopeId: string): Promise<void> {
    await this.store.update((state) => {
      this.ensureScopeState(state, scopeId).activeProjectId = undefined;
    });
  }

  async getActiveProject(scopeId: string): Promise<Project | undefined> {
    const state = await this.store.read();
    const activeProjectId = state.scopes[scopeId]?.activeProjectId;
    return state.projects.find((project) => project.id === activeProjectId);
  }

  async attachRepo(scopeId: string, projectId: string, linkedRepoUrl: string): Promise<void> {
    await this.store.update((state) => {
      const project = this.resolveProjectFromState(scopeId, projectId, state.projects);
      project.linkedRepoUrl = linkedRepoUrl;
      project.updatedAt = new Date().toISOString();
    });
  }

  async startSession(scopeId: string, channelId: string, startedBy: string): Promise<Session> {
    return this.store.update((state) => {
      const activeProject = this.requireActiveProjectFromState(state, scopeId);

      const duplicate = this.findActiveSession(state, scopeId, channelId, activeProject.id);
      if (duplicate) {
        throw new Error("An active session already exists for this project and channel.");
      }

      const session = this.buildSession(scopeId, activeProject.id, channelId, startedBy);
      state.sessions.push(session);
      return session;
    });
  }

  async captureMessage(
    scopeId: string,
    channelId: string,
    authorId: string,
    content: string,
  ): Promise<SessionMessage | undefined> {
    if (!content.trim()) {
      return undefined;
    }

    return this.store.update((state) => {
      const activeProject = this.getActiveProjectFromState(state, scopeId);
      if (!activeProject) {
        return undefined;
      }

      const session =
        this.findActiveSession(state, scopeId, channelId, activeProject.id) ??
        (() => {
          const created = this.buildSession(scopeId, activeProject.id, channelId, authorId);
          state.sessions.push(created);
          return created;
        })();

      const message: SessionMessage = {
        id: randomUUID(),
        sessionId: session.id,
        authorId,
        content: content.trim(),
        timestamp: new Date().toISOString(),
      };
      state.messages.push(message);
      return message;
    });
  }

  async summarizeSession(
    scopeId: string,
    channelId: string,
    requestedBy: string,
  ): Promise<SessionReport> {
    const ensuredSession = await this.ensureActiveSessionRecord(scopeId, channelId, requestedBy);
    const state = await this.store.read();
    const session =
      state.sessions.find((candidate) => candidate.id === ensuredSession.id) ?? ensuredSession;
    const project =
      state.projects.find(
        (candidate) => candidate.scopeId === scopeId && candidate.id === session.projectId,
      ) ?? this.requireActiveProjectFromState(state, scopeId);

    const messages = state.messages.filter((message) => message.sessionId === session.id);
    const memories = state.memories.filter((memory) => memory.projectId === project.id);
    const analysis = await this.analyzer.analyze({
      project,
      session,
      messages,
      relevantPastContext: memories,
    });

    return this.store.update((mutableState) => {
      const activeSession = mutableState.sessions.find((candidate) => candidate.id === session.id);
      if (!activeSession) {
        throw new Error("Session not found during summarization.");
      }
      activeSession.status = "ended";
      activeSession.endedAt = new Date().toISOString();

      const report: SessionReport = {
        id: randomUUID(),
        sessionId: session.id,
        ...analysis,
      };
      mutableState.reports.push(report);

      const memory: ProjectMemory = {
        id: randomUUID(),
        projectId: project.id,
        memoryType: "session_summary",
        content: [
          `Goal: ${report.sessionGoal}`,
          `Strongest: ${report.strongestIdeas.join("; ")}`,
          `Concerns: ${report.weakPointsConcerns.join("; ")}`,
          `Missing: ${report.missingQuestions.join("; ")}`,
        ].join(" | "),
        sourceSessionId: session.id,
        createdAt: new Date().toISOString(),
      };
      mutableState.memories.push(memory);

      mutableState.sessions.push(
        this.buildSession(scopeId, project.id, channelId, requestedBy),
      );
      return report;
    });
  }

  async endSession(scopeId: string, channelId: string, requestedBy?: string): Promise<SessionReport> {
    return this.summarizeSession(scopeId, channelId, requestedBy ?? "legacy-command");
  }

  async summarizeProject(
    scopeId: string,
    channelId: string,
    requestedBy: string,
  ): Promise<ProjectSummaryReport> {
    await this.ensureActiveSessionRecord(scopeId, channelId, requestedBy);
    const state = await this.store.read();
    const { project, messages, memories } = this.buildProjectContext(state, scopeId, channelId);
    const summary = await this.analyzer.summarizeProject({
      project,
      messages,
      relevantPastContext: memories,
    });

    await this.store.update((mutableState) => {
      mutableState.memories.push({
        id: randomUUID(),
        projectId: project.id,
        memoryType: "project_summary",
        content: [
          `Direction: ${summary.currentDirection}`,
          `Themes: ${summary.importantThemes.join("; ")}`,
          `Next focus: ${summary.currentNextFocus.join("; ")}`,
          `Open issues: ${summary.openIssues.join("; ")}`,
        ].join(" | "),
        sourceSessionId:
          this.findActiveSession(mutableState, scopeId, channelId, project.id)?.id ??
          "project-summary",
        createdAt: new Date().toISOString(),
      });
    });

    return summary;
  }

  async brainstormProject(
    scopeId: string,
    channelId: string,
    requestedBy: string,
    currentInput?: string,
  ): Promise<BrainstormReport> {
    await this.ensureActiveSessionRecord(scopeId, channelId, requestedBy);
    const state = await this.store.read();
    const { project, messages, memories } = this.buildProjectContext(state, scopeId, channelId);
    return this.analyzer.brainstormProject({
      project,
      messages,
      relevantPastContext: memories,
      currentInput,
    });
  }

  async getProjectMemory(projectId: string): Promise<ProjectMemory[]> {
    const state = await this.store.read();
    return state.memories.filter((memory) => memory.projectId === projectId);
  }

  async getActiveSession(scopeId: string, channelId: string): Promise<Session | undefined> {
    const state = await this.store.read();
    const activeProject = this.getActiveProjectFromState(state, scopeId);
    if (!activeProject) {
      return undefined;
    }
    return this.findActiveSession(state, scopeId, channelId, activeProject.id);
  }

  async deleteProject(scopeId: string, selector: string): Promise<void> {
    await this.store.update((state) => {
      const project = this.resolveProjectFromState(scopeId, selector, state.projects);
      const projectId = project.id;
      state.projects = state.projects.filter((candidate) => candidate.id !== projectId);

      const removedSessionIds = new Set(
        state.sessions
          .filter((session) => session.projectId === projectId)
          .map((session) => session.id),
      );
      state.sessions = state.sessions.filter((session) => session.projectId !== projectId);
      state.messages = state.messages.filter((message) => !removedSessionIds.has(message.sessionId));
      state.memories = state.memories.filter((memory) => memory.projectId !== projectId);
      state.reports = state.reports.filter((report) => !removedSessionIds.has(report.sessionId));

      if (state.scopes[scopeId]?.activeProjectId === projectId) {
        const replacement = state.projects.find((project) => project.scopeId === scopeId);
        state.scopes[scopeId].activeProjectId = replacement?.id;
      }
    });
  }

  async deleteAllProjects(scopeId: string): Promise<number> {
    return this.store.update((state) => {
      const projectIds = new Set(
        state.projects
          .filter((project) => project.scopeId === scopeId)
          .map((project) => project.id),
      );
      const deletedCount = projectIds.size;
      if (deletedCount === 0) {
        return 0;
      }

      const removedSessionIds = new Set(
        state.sessions
          .filter((session) => projectIds.has(session.projectId))
          .map((session) => session.id),
      );

      state.projects = state.projects.filter((project) => !projectIds.has(project.id));
      state.sessions = state.sessions.filter((session) => !projectIds.has(session.projectId));
      state.messages = state.messages.filter((message) => !removedSessionIds.has(message.sessionId));
      state.memories = state.memories.filter((memory) => !projectIds.has(memory.projectId));
      state.reports = state.reports.filter((report) => !removedSessionIds.has(report.sessionId));

      if (state.scopes[scopeId]) {
        state.scopes[scopeId].activeProjectId = undefined;
      }

      return deletedCount;
    });
  }
}
