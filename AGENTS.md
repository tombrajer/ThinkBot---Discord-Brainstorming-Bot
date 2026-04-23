# AGENTS.md

## Project purpose
This repository contains a Discord bot for brainstorming and idea analysis.

The bot helps users:
- capture messy ideas during a session
- analyze and summarize discussions at the end of a session
- identify strong ideas, weak points, risks, contradictions, and missing questions
- carry memory across sessions for each project
- optionally use GitHub repository context when explicitly requested or clearly needed

## Product boundary
This bot is **not** a coding agent.

It must not:
- generate production code for users as its main job
- autonomously implement features
- modify repositories
- open pull requests with code
- behave like an autonomous software engineer

It may:
- suggest implementation directions at a high level
- reference likely relevant parts of a repository
- explain architectural tradeoffs
- ask for repository context when that would improve the analysis

Core rule:
**The bot thinks, critiques, and organizes. It does not build.**

## Primary product behavior
- Multi-project support is required.
- Users should be able to create, select, and manage separate projects.
- Sessions are attached to a project.
- The bot should reply primarily at the **end** of a session.
- Output should be plain text, but clearly structured.
- The default mode is brainstorming analysis, not planning.
- Planning should remain lightweight and secondary.

## Repository / GitHub access rules
Repository access is optional and contextual.

Default behavior:
- do not read the repository unless the session mentions it, the user asks for it, or the bot determines that repo context would materially improve the feedback
- if repo context would help, the bot should ask for permission or suggest linking the repo
- keep repository access read-only

Allowed repo context sources:
- README files
- architecture docs
- package manifests
- configuration files
- selected directories or files explicitly requested by the user
- issue / PR metadata if later implemented

Avoid by default:
- full repository ingestion
- secrets or env files
- vendor folders
- build outputs
- large binaries

## Memory rules
The bot should maintain memory across sessions on a **per-project** basis.

Persisted memory should favor:
- session summaries
- recurring goals
- recurring constraints
- past decisions
- key themes
- open questions
- linked repository metadata

Prefer not to rely on storing raw chat forever unless explicitly required.
The default assumption is: store structured memory and summaries, not unlimited raw history.

## Expected end-of-session output shape
The end-session response should be concise, structured, and easy to scan.

Preferred sections:
- Session goal
- Main ideas raised
- Patterns / themes
- Strongest ideas
- Weak points / concerns
- Missing questions
- Suggestions
- Relevant past context
- Repo-aware observations (only if repo context was used)

Do not produce bloated essays.
Favor bullets and short sections.

## Recommended architecture
Expected major areas in the codebase:
- Discord bot / command layer
- session management
- project management
- memory store
- AI orchestration layer
- optional GitHub adapter
- formatting / report generation

## Implementation guidance
When working in this repo:
- keep modules focused and small
- prefer explicit types and clear interfaces
- separate Discord concerns from AI logic
- separate AI prompting from persistence logic
- keep GitHub integration behind a dedicated adapter/service layer
- make model routing configurable

## Model behavior assumptions
The runtime may use local models such as Gemma, Qwen, or GPT-OSS.
Do not hardcode one provider into the architecture.
Design for pluggable model backends.

Suggested logical roles:
- primary analysis model
- lightweight formatting / utility model
- optional fallback model

## Output / UX rules
- keep user-facing output concise
- prefer organized plain text over long paragraphs
- avoid excessive fluff
- be critical when useful
- do not be rude
- do not overpromise

## Safety and privacy
- repository access must be read-only unless explicitly changed later
- do not expose secrets
- do not ingest hidden credentials
- do not make destructive external actions the default
- memory deletion / project reset should be supported

## Non-goals for MVP
- autonomous code writing
- codebase mutation
- automatic PR creation
- automatic issue creation unless explicitly added later
- live interruption-heavy assistant behavior during sessions

## Working style for contributors / agents
When making changes:
- preserve the narrow product scope
- avoid feature creep into “AI dev agent” territory
- optimize for clarity and maintainability
- prefer incremental changes over broad rewrites
- keep docs aligned with actual behavior
