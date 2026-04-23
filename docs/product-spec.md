# Product Spec

## Product name
Working name: **Brainstorming Discord Bot**

## One-line description
A Discord bot that turns messy project brainstorm sessions into structured summaries, critiques, and useful follow-up insights.

## Product identity
This is a **brainstorming analyzer**.

It is designed to help users:
- think through product and app ideas
- organize scattered discussions
- identify strong and weak ideas
- surface missing questions
- retain project memory across sessions

It is **not** intended to be a coding or implementation agent.

## Core product promise
Users can start a brainstorming session inside Discord, dump ideas naturally, and then end the session to receive a structured analysis.

## Target users
- solo builders
- indie hackers
- small dev teams
- startup founders
- product-minded developers
- friend groups exploring app ideas

## Core use case
A user selects a project, starts a session, and writes any thoughts relevant to that project.
At the end of the session, the bot analyzes the discussion and returns an organized response.

## Main product decisions
- multi-project support
- memory across sessions
- end-of-session reply only by default
- plain text output, but organized
- GitHub/repo access is optional and not used unless relevant

## Non-goals
The bot should not:
- act as an autonomous coder
- generate production-ready code as its main value
- modify repositories
- create code pull requests
- take over project execution

## Core features for MVP

### 1. Project management
Users can manage multiple projects.

Required actions:
- create project
- list projects
- select active project
- optionally attach repo metadata to a project

### 2. Session management
Users can start and end brainstorming sessions.

Required actions:
- start session for current project
- collect session messages
- end session
- analyze session contents
- store session summary in project memory

### 3. End-of-session analysis
At the end of a session, the bot returns a structured text response.

Required sections:
- Session goal
- Main ideas raised
- Patterns / themes
- Strongest ideas
- Weak points / concerns
- Missing questions
- Suggestions
- Relevant past context

Optional section:
- Repo-aware observations

### 4. Memory across sessions
Each project should accumulate structured memory.

Memory examples:
- recurring goals
- recurring constraints
- prior decisions
- prior themes
- persistent open questions
- linked repo
- previous summaries

## GitHub / repo context behavior
Repository context is secondary and optional.

Default behavior:
- the bot should not inspect the repo unless it is brought up during the session, requested directly, or clearly needed for sharper analysis

When repo context is useful:
- architecture questions
- feasibility concerns
- “does this fit the existing codebase?”
- identifying likely affected areas of a project

Repo usage rule:
- read-only only

Recommended allowed sources:
- README
- docs
- package manifest
- config files
- selected files/directories

## User experience principles
- low-friction
- clear commands
- concise output
- organized text over paragraphs
- helpful critique over vague positivity
- no noisy mid-session interruptions by default

## Example command surface
Possible commands:
- `/project-create`
- `/project-list`
- `/project-select`
- `/start-session`
- `/end-session`
- `/attach-repo`
- `/project-memory`
- `/forget-project`

Command names can change later, but the capabilities should remain.

## Functional requirements

### Project layer
- store multiple named projects per Discord server or user scope
- track active project for a session
- support linked repository metadata

### Session layer
- only one active session per project/thread at a time
- capture session messages with timestamps and authors
- allow final analysis on session end

### Analysis layer
- summarize message content
- cluster ideas into themes
- identify best ideas
- critique weak areas
- surface contradictions and missing details
- use project memory as context
- optionally use repo context

### Memory layer
- save structured summaries from each session
- allow retrieval of prior project context during later analyses
- support memory reset or project deletion

## Data model outline

### Project
- id
- name
- description
- linked_repo_url (optional)
- created_at
- updated_at

### Session
- id
- project_id
- started_at
- ended_at
- started_by
- status
- repo_used_flag

### SessionMessage
- id
- session_id
- author_id
- content
- timestamp

### ProjectMemory
- id
- project_id
- memory_type
- content
- source_session_id
- created_at

### SessionReport
- id
- session_id
- summary
- strongest_ideas
- concerns
- missing_questions
- suggestions
- relevant_past_context
- repo_observations

## Constraints
- output should remain concise
- long sessions may require chunking/summarization strategy
- repo context must be selectively loaded
- the system should be model-provider agnostic

## Success criteria for MVP
The MVP is successful if a user can:
- manage more than one project
- run a brainstorm session for a chosen project
- receive a structured, useful end-of-session analysis
- see continuity from prior sessions
- optionally attach repo context without making it mandatory

## Future ideas, not MVP
- idea scoring
- voting / ranking
- issue generation
- PRD generation
- compare sessions over time
- role-based critiques
- optional live interaction during session
