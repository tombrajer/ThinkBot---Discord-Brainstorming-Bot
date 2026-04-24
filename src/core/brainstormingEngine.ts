import { randomUUID } from "node:crypto";
import {
  Analyzer,
  ClarifyInput,
  Project,
  ProjectMemory,
  Session,
  SessionMessage,
  SessionReport,
} from "../domain/types.js";
import { JsonStore } from "../storage/jsonStore.js";

interface CreateProjectInput {
  name: string;
  description?: string;
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
        description: input.description?.trim(),
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
      if (!state.scopes[scopeId]) {
        state.scopes[scopeId] = {};
      }
      state.scopes[scopeId].activeProjectId = project.id;
      project.updatedAt = new Date().toISOString();
      return project;
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
      const activeProjectId = state.scopes[scopeId]?.activeProjectId;
      if (!activeProjectId) {
        throw new Error("No active project selected.");
      }

      const duplicate = state.sessions.find(
        (session) =>
          session.scopeId === scopeId &&
          session.projectId === activeProjectId &&
          session.channelId === channelId &&
          session.status === "active",
      );
      if (duplicate) {
        throw new Error("An active session already exists for this project and channel.");
      }

      const session: Session = {
        id: randomUUID(),
        scopeId,
        projectId: activeProjectId,
        channelId,
        startedBy,
        startedAt: new Date().toISOString(),
        status: "active",
        repoUsedFlag: false,
      };
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
      const activeProjectId = state.scopes[scopeId]?.activeProjectId;
      if (!activeProjectId) {
        return undefined;
      }
      const session = state.sessions.find(
        (candidate) =>
          candidate.scopeId === scopeId &&
          candidate.channelId === channelId &&
          candidate.projectId === activeProjectId &&
          candidate.status === "active",
      );
      if (!session) {
        return undefined;
      }

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

  async endSession(scopeId: string, channelId: string): Promise<SessionReport> {
    const state = await this.store.read();
    const activeProjectId = state.scopes[scopeId]?.activeProjectId;
    if (!activeProjectId) {
      throw new Error("No active project selected.");
    }

    const session = state.sessions.find(
      (candidate) =>
        candidate.scopeId === scopeId &&
        candidate.channelId === channelId &&
        candidate.projectId === activeProjectId &&
        candidate.status === "active",
    );
    if (!session) {
      throw new Error("No active session found for this channel.");
    }

    const project = state.projects.find((candidate) => candidate.id === session.projectId);
    if (!project) {
      throw new Error("Project not found for active session.");
    }

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
        throw new Error("Session not found during finalization.");
      }
      activeSession.status = "ended";
      activeSession.endedAt = new Date().toISOString();
      delete mutableState.clarifyRuns[this.clarifyRunKey(activeSession.id, activeSession.channelId)];

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
      return report;
    });
  }

  async getProjectMemory(projectId: string): Promise<ProjectMemory[]> {
    const state = await this.store.read();
    return state.memories.filter((memory) => memory.projectId === projectId);
  }

  async getActiveSession(scopeId: string, channelId: string): Promise<Session | undefined> {
    const state = await this.store.read();
    const activeProjectId = state.scopes[scopeId]?.activeProjectId;
    if (!activeProjectId) {
      return undefined;
    }
    return state.sessions.find(
      (session) =>
        session.scopeId === scopeId &&
        session.channelId === channelId &&
        session.projectId === activeProjectId &&
        session.status === "active",
    );
  }

  async buildClarifyInput(
    scopeId: string,
    channelId: string,
    focus?: string,
  ): Promise<ClarifyInput> {
    const state = await this.store.read();
    const activeProjectId = state.scopes[scopeId]?.activeProjectId;
    if (!activeProjectId) {
      throw new Error("No active project selected.");
    }

    const session = state.sessions.find(
      (candidate) =>
        candidate.scopeId === scopeId &&
        candidate.channelId === channelId &&
        candidate.projectId === activeProjectId &&
        candidate.status === "active",
    );
    if (!session) {
      throw new Error("No active session found for this channel.");
    }

    const project = state.projects.find((candidate) => candidate.id === activeProjectId);
    if (!project) {
      throw new Error("Project not found in this scope.");
    }

    const messages = state.messages
      .filter((message) => message.sessionId === session.id)
      .slice(-50);
    const relevantPastContext = state.memories
      .filter((memory) => memory.projectId === project.id)
      .slice(-6);

    return {
      project,
      session,
      messages,
      relevantPastContext,
      focus: focus?.trim() || undefined,
    };
  }

  async getSessionClarifyCooldownRemainingMs(
    sessionId: string,
    channelId: string,
    cooldownMs: number,
    nowMs = Date.now(),
  ): Promise<number> {
    const state = await this.store.read();
    const key = this.clarifyRunKey(sessionId, channelId);
    const lastRun = state.clarifyRuns[key];
    if (!lastRun) {
      return 0;
    }
    const elapsed = nowMs - lastRun;
    if (elapsed >= cooldownMs) {
      return 0;
    }
    return cooldownMs - elapsed;
  }

  async markSessionClarifyRun(
    sessionId: string,
    channelId: string,
    atMs = Date.now(),
  ): Promise<void> {
    await this.store.update((state) => {
      state.clarifyRuns[this.clarifyRunKey(sessionId, channelId)] = atMs;
    });
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
      for (const sessionId of removedSessionIds) {
        for (const key of Object.keys(state.clarifyRuns)) {
          if (key.startsWith(`${sessionId}:`)) {
            delete state.clarifyRuns[key];
          }
        }
      }

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
      for (const sessionId of removedSessionIds) {
        for (const key of Object.keys(state.clarifyRuns)) {
          if (key.startsWith(`${sessionId}:`)) {
            delete state.clarifyRuns[key];
          }
        }
      }

      if (state.scopes[scopeId]) {
        state.scopes[scopeId].activeProjectId = undefined;
      }

      return deletedCount;
    });
  }

  private clarifyRunKey(sessionId: string, channelId: string): string {
    return `${sessionId}:${channelId}`;
  }
}
