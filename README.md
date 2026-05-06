# botcod — Auto Signup Bot + CodeBuddy Router

Two tools in one repo:

1. **Bot** (`index.js`): auto signup for **Unlucid.ai** and **CodeBuddy.ai** via Camoufox + proxy rotation. Harvests CodeBuddy `ck_…` API keys to `codebuddy_keys.txt`.
2. **Router + Dashboard** (`server/`): a local web app on port `4141` that
    - exposes the harvested keys as an **OpenAI-compatible API** (`/v1/chat/completions`, `/v1/models`) so OpenCode / OpenAI SDKs can use them transparently,
    - **auto-rotates** keys when one hits a rate limit / quota / auth failure (mid-request, no client-visible reset),
    - and provides a **dashboard** to control everything: view the key pool, edit `accounts.txt` / `proxies.txt`, run signup batches with live logs, and tune cooldown settings.

## Requirements

- Node.js 18+
- Camoufox binary (auto-installed via `camoufox-js` when needed)

## Setup

```bash
npm install
```

## File Structure

```
accounts.txt            # email:password (one per line)
proxies.txt             # http://user:pass@host:port (one per line)
codebuddy_keys.txt      # bot output — email:ck_xxx.yyy

index.js                # CLI entry (bot only)
lib/                    # shared bot logic (importable modules)
server/                 # router + dashboard
  index.js              # Express on :4141
  lib/                  # keyPool, upstream, translate, jobs, …
  routes/openai.js      # OpenAI-compatible /v1/* routes
  routes/api.js         # dashboard backend
  public/               # vanilla HTML/JS dashboard (no build step)
```

`accounts.txt`, `proxies.txt`, `codebuddy_keys.txt`, `server/state.json` and `server/settings.json` are gitignored.

## Usage

### Run the bot (CLI)

```bash
npm start
```

Interactive prompts: mode (1 = Unlucid, 2 = CodeBuddy, 3 = both), headless toggle, start.

### Run the dashboard + router

```bash
npm run dev
# server listens on http://127.0.0.1:4141
```

Open `http://127.0.0.1:4141/` in a browser. The dashboard has tabs for **Overview**, **Key Pool**, **Accounts**, **Proxies**, **Run Bot**, **Settings**.

### OpenCode integration

In `~/.config/opencode/opencode.jsonc` (or wherever your OpenCode config lives):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "codebuddy-router": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "CodeBuddy Router",
      "options": {
        "baseURL": "http://127.0.0.1:4141/v1",
        "apiKey": "not-required"
      },
      "models": {
        "auto-chat":        { "name": "auto-chat" },
        "gpt-5":            { "name": "gpt-5" },
        "o4-mini":          { "name": "o4-mini" },
        "gemini-2.5-pro":   { "name": "gemini-2.5-pro" },
        "gemini-2.5-flash": { "name": "gemini-2.5-flash" },
        "glm-4.6":          { "name": "glm-4.6" },
        "deepseek-v3":      { "name": "deepseek-v3" }
      }
    }
  }
}
```

The dashboard's **Overview** tab also generates this snippet for you with the current model list.

## How rotation works

For each incoming `/v1/chat/completions`:

1. The router picks the active key with the **oldest `last_used_at`** (round-robin among keys that aren't on cooldown / dead).
2. Forwards the request to `https://www.codebuddy.ai/v2/chat/completions` with that key as `Authorization: Bearer …`.
3. If upstream returns:
   - **`401` / `403`** → mark key **dead**, retry with next key.
   - **`429` / `402`** or `code 11128` / "rate limit" / "quota" → mark key **cooldown** (default 24h, configurable), retry with next key.
   - **Other 4xx/5xx** → propagate error to client (no rotation).
4. If a stream has already started writing to the client, errors mid-stream are surfaced to the client (no retry, since headers/body are partially sent).
5. After ~24h (configurable) cooldown keys auto-promote back to active.

OpenCode (and any OpenAI client) sees a single, stable endpoint — they re-send full chat history each call so memory stays continuous regardless of which key answered.

## Available models

Verified working against `https://www.codebuddy.ai/v2/chat/completions` with a real `ck_` key:

| Exposed name       | Upstream model              |
| ------------------ | --------------------------- |
| `auto-chat`        | glm-4.6 (default fallback)  |
| `claude-opus-4.6`  | claude-opus-4.6             |
| `gpt-5.5`          | gpt-5.5                     |
| `gpt-5.2`          | gpt-5.2                     |
| `gpt-5.1`          | gpt-5.1                     |
| `gpt-5`            | gpt-5-2025-08-07            |
| `gpt-5-codex`      | gpt-5-codex-2               |
| `o3`               | o3-2025-04-16               |
| `o4-mini`          | o4-mini-2025-04-16          |
| `gemini-3.1-pro`   | gemini-3.1-pro-preview      |
| `gemini-3.0-pro`   | gemini-3-pro-preview        |
| `gemini-2.5-pro`   | gemini-2.5-pro              |
| `gemini-2.5-flash` | gemini-2.5-flash            |
| `glm-4.6`          | glm-4.6                     |
| `deepseek-v3.2`    | deepseek-v3.2               |
| `deepseek-v3`      | deepseek-v3                 |

Adjust the list in **Settings → Exposed models** if your CodeBuddy account doesn't have access to a particular model. Models not on this account return `code 11102 — service info not found`.

## Bot signup flow (unchanged from v2.0)

### Unlucid.ai
1. Navigate to referral link
2. Click Sign In → Google
3. Google OAuth (email → password → workspace terms → consent)
4. Redirect back to unlucid.ai

### CodeBuddy.ai
1. Navigate to login page → "Sign up with Google" (inside iframe)
2. Confirm service agreement
3. Google OAuth
4. Select **Singapore** as registration region
5. Navigate to Profile → Access Keys → create key
6. Append `email:ck_xxx.yyy` to `codebuddy_keys.txt`

Each service gets up to 3 retries; on failure the browser navigates to `about:blank` and re-runs from scratch.

## Configuration knobs

Set via env vars (prefix `BOTCOD_` or `ROUTER_`):

| Var | Default | Meaning |
| --- | --- | --- |
| `PORT` | `4141` | Server listen port |
| `HOST` | `127.0.0.1` | Bind host. Use `0.0.0.0` to expose on LAN (set `DASHBOARD_PASSWORD` too). |
| `KEYS_FILE` | `codebuddy_keys.txt` | Path to key pool file (auto-watched for hot reload) |
| `UPSTREAM_BASE` | `https://www.codebuddy.ai` | CodeBuddy upstream |
| `COOLDOWN_MS` | `86400000` (24h) | How long to mark a 429-d key as cooldown before auto-promoting back |
| `DASHBOARD_PASSWORD` | _unset_ | If set, dashboard requires `X-Dashboard-Password` header. `/v1/*` is always open. |

The dashboard **Settings** tab persists overrides to `server/settings.json` (gitignored).
