export type SessionStatus = "active" | "ended";

export interface Project {
  id: string;
  scopeId: string;
  name: string;
  description?: string;
  linkedRepoUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  scopeId: string;
  projectId: string;
  channelId: string;
  startedBy: string;
  startedAt: string;
  endedAt?: string;
  status: SessionStatus;
  repoUsedFlag: boolean;
}

export interface SessionMessage {
  id: string;
  sessionId: string;
  authorId: string;
  content: string;
  timestamp: string;
}

export interface ProjectMemory {
  id: string;
  projectId: string;
  memoryType: string;
  content: string;
  sourceSessionId: string;
  createdAt: string;
}

export interface SessionReport {
  id: string;
  sessionId: string;
  sessionGoal: string;
  mainIdeasRaised: string[];
  patternsThemes: string[];
  strongestIdeas: string[];
  weakPointsConcerns: string[];
  missingQuestions: string[];
  suggestions: string[];
  relevantPastContext: string[];
  repoObservations: string[];
}

export interface ScopeState {
  activeProjectId?: string;
}

export interface StoreState {
  projects: Project[];
  sessions: Session[];
  messages: SessionMessage[];
  memories: ProjectMemory[];
  reports: SessionReport[];
  clarifyRuns: Record<string, number>;
  scopes: Record<string, ScopeState>;
}

export interface AnalysisInput {
  project: Project;
  session: Session;
  messages: SessionMessage[];
  relevantPastContext: ProjectMemory[];
}

export interface Analyzer {
  analyze(input: AnalysisInput): Promise<Omit<SessionReport, "id" | "sessionId">>;
}

export interface ClarifyInput {
  project: Project;
  session: Session;
  messages: SessionMessage[];
  relevantPastContext: ProjectMemory[];
  focus?: string;
}

export interface Clarifier {
  generate(input: ClarifyInput): Promise<{ questions: string[] }>;
}
