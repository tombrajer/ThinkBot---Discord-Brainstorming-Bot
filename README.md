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
- `/project-active`
- `/project-select project` (exact name)
- `/attach-repo url`
- `/project-memory`
- `/start-session`
- `/session-clarify focus?`
- `/end-session`
- `/forget-project project` (exact name)
- `/forget-all-projects confirm:true`

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

For local AI analysis with Ollama (default):
```bash
OLLAMA_MODEL=qwen3:8b
OLLAMA_BASE_URL=http://127.0.0.1:11434
ANALYZER_PROVIDER=ollama
OLLAMA_TIMEOUT_MS=180000
```
Use `OLLAMA_TIMEOUT_MS=180000` (3 minutes) for slower local models to avoid 60-second aborts.

For Docker/VM networking, set:
```bash
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

If you need to force the old rule-based analyzer:
```bash
ANALYZER_PROVIDER=heuristic
```

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

## Ollama setup notes

1. Start Ollama normally (desktop app/service). Do not run `ollama serve` twice.
2. Verify the API is reachable:
```powershell
curl http://127.0.0.1:11434/api/tags
```
3. Set `OLLAMA_MODEL` to the exact value shown by `ollama list`.
4. Keep `OLLAMA_BASE_URL` at `http://127.0.0.1:11434` unless the bot runs in Docker/VM, then use `http://host.docker.internal:11434`.

On startup, the bot checks `GET /api/tags`. If Ollama is unreachable or the configured model is missing, it logs a clear warning and falls back to the heuristic analyzer instead of crashing.

## Development

- Tests:
```bash
npm test
```

- Live local-model connectivity test (optional):
```powershell
$env:RUN_OLLAMA_LIVE='true'
$env:OLLAMA_BASE_URL='http://127.0.0.1:11434'
$env:OLLAMA_MODEL='qwen3:8b'
npm run test:ollama-live
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
