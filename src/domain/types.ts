export type SessionStatus = "active" | "ended";
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

export interface ProjectBrainDraftValues {
  name: string;
  linkedRepoUrl: string;
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

export interface ProjectBrainSuggestionInput {
  projectName: string;
  userInput: Omit<ProjectBrainDraftValues, "name" | "linkedRepoUrl">;
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

export interface ProjectBrainDraft {
  input: ProjectBrainDraftValues;
  suggestions: ProjectBrainSuggestionOutput;
  review: ProjectBrain;
}

export interface Project {
  id: string;
  scopeId: string;
  name: string;
  description?: string;
  brain?: ProjectBrain;
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
  suggestProjectBrain(input: ProjectBrainSuggestionInput): Promise<ProjectBrainSuggestionOutput>;
}
