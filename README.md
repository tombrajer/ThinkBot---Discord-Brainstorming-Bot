# Brainstorming Discord Bot

Discord bot for project brainstorming sessions with:
- Multi-project management
- Per-project session capture
- End-of-session structured analysis
- Per-project memory across sessions
- Optional repository metadata linking

This bot is scoped as a brainstorming analyzer, not a coding agent.

## Commands

- `/project-create name description?`
- `/project-list`
- `/project-select project_id`
- `/attach-repo url`
- `/start-session`
- `/end-session`
- `/project-memory`
- `/forget-project project_id`

## Quick start

1. Install deps:
```bash
npm install
```

2. Configure env:
```bash
copy .env.example .env
```
Fill in `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`.

If you want the bot to capture regular channel messages during sessions, set:
```bash
ENABLE_MESSAGE_CONTENT_INTENT=true
```
and enable **Message Content Intent** in the Discord Developer Portal:
`Bot -> Privileged Gateway Intents -> Message Content Intent`.

3. Register slash commands:
```bash
npm run register:commands
```

4. Run bot:
```bash
npm run dev
```

## Development

- Tests:
```bash
npm test
```

- Typecheck/build:
```bash
npm run build
```

## Common errors

- `Used disallowed intents`
  - Cause: `Message Content Intent` is requested but not enabled for your bot in Discord settings.
  - Fix option A: enable it in the Discord portal and set `ENABLE_MESSAGE_CONTENT_INTENT=true`.
  - Fix option B: keep `ENABLE_MESSAGE_CONTENT_INTENT=false` (bot starts, but it will not ingest normal message content).

- `UNABLE_TO_VERIFY_LEAF_SIGNATURE`
  - Cause: TLS interception (for example Norton SSL/TLS scanning) and Node does not trust that local root CA by default.
  - Fix: export the local root CA as PEM and set `NODE_EXTRA_CA_CERTS` in `.env`.
