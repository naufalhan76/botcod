# sambungin

> Local multi-provider "router" yang nyambungin OpenCode (atau OpenAI client apapun) ke beberapa provider AI sekaligus (CodeBuddy.ai + Kiro IDE), dengan auto-rotate kalau salah satu key/credential kena limit. Dilengkapi bot signup buat CodeBuddy + dashboard buat manage semuanya.

```
OpenCode  ─┐                                          ┌─► https://www.codebuddy.ai (pakai ck_*)
OpenAI SDK ├──► sambungin (localhost:4141) ──▼           (claude-opus-4.6, gpt-5.5, gemini-3.1-pro, dst.)
curl       ─┘   │                                       │
               │   model → provider routing            └─► https://codewhisperer.us-east-1.amazonaws.com (Kiro)
               │                                          (claude-sonnet-4.5, glm-5, qwen3-coder-next, dst.)
               │
            dashboard (localhost:4141)
            ├ CodeBuddy Pool: status `ck_*` keys
            ├ Kiro Pool: status refresh tokens + auto-refresh
            ├ edit accounts.txt + proxies.txt
            ├ run signup bot batch + live log
            └ tune cooldown / model list
```

## Daftar isi

1. [Kenapa pake sambungin](#kenapa-pake-sambungin)
2. [Requirement](#requirement)
3. [Install](#install)
4. [Cara pake — quick start](#cara-pake--quick-start)
5. [Setup provider Kiro (extra)](#setup-provider-kiro-extra)
6. [Konfigurasi OpenCode (penting)](#konfigurasi-opencode-penting)
7. [Konfigurasi OpenAI SDK / curl](#konfigurasi-openai-sdk--curl)
8. [Cara kerja rotation + multi-provider](#cara-kerja-rotation--multi-provider)
9. [Daftar model yang bisa dipake](#daftar-model-yang-bisa-dipake)
10. [Bot signup (Unlucid + CodeBuddy)](#bot-signup-unlucid--codebuddy)
11. [Temp Mail (catchall via Cloudflare → Gmail IMAP)](#temp-mail-catchall-via-cloudflare--gmail-imap)
12. [Konfigurasi lanjutan (env var)](#konfigurasi-lanjutan-env-var)
13. [Troubleshooting](#troubleshooting)

---

## Kenapa pake sambungin

CodeBuddy.ai dan Kiro IDE punya tier gratis dengan limit harian/bulanan per akun. Kalau lo punya banyak akun, lo bakal punya banyak `ck_…` key (CodeBuddy) + banyak refresh token (Kiro). Tapi OpenCode (atau klien OpenAI lain) cuma support **satu** baseURL + satu API key per provider.

`sambungin` jadi proxy lokal yang:

- Kasih **satu** endpoint OpenAI-compatible (`http://127.0.0.1:4141/v1`) yang gabungin model dari beberapa provider sekaligus.
- Auto-pilih provider berdasarkan model: minta `claude-opus-4.6` → ke CodeBuddy, minta `claude-sonnet-4.5` → ke Kiro.
- Pegang **semua** key/credential lo di pool per-provider.
- Kalau key kena `429` / quota → mark cooldown, ganti ke key berikutnya **mid-request**, klien ga ngerasain apa-apa.
- Kalau key kena `401`/`403` → mark dead, ganti ke key berikutnya.
- Untuk Kiro: auto-refresh access token via OIDC ~1 menit sebelum expire (gratis tinggal kasih refresh token sekali).
- Memori chat tetep utuh karena history dikirim ulang tiap request oleh klien (sifat OpenAI API).

---

## Requirement

- **Node.js 18+** (node 20 oke)
- Browser modern buat akses dashboard
- (Optional, kalau lo mau pake bot signup) **Camoufox** auto-install via `camoufox-js`. Linux/macOS work out-of-the-box, Windows perlu Visual C++ runtime.

Cek versi:
```bash
node --version   # v18 atau lebih
npm --version
```

---

## Install

```bash
# 1. Clone repo
git clone https://github.com/naufalhan76/botcod.git sambungin
cd sambungin

# 2. Install dependency
npm install

# 3. Siapin file API key (minimal 1 line, atau lewat dashboard nanti)
echo "your.email@gmail.com:ck_xxxxx.yyyyyyyy" > codebuddy_keys.txt
#       │                  │
#       │                  └─ API key dari https://www.codebuddy.ai/profile/keys
#       └─ email akun (opsional, cuma label, ga dikirim ke upstream)
#
# (opsional) Kiro credential di-add nanti via dashboard tab "Kiro Pool".
# Kalau ga di-set, model Kiro tetep di-list tapi return 503 sampai lo add minimal 1 cred.

# 4. Jalanin server
npm run dev
```

Output:
```
sambungin server listening on http://127.0.0.1:4141
  Dashboard:  http://127.0.0.1:4141/
  OpenAI API: http://127.0.0.1:4141/v1
  Models:     auto-chat, claude-opus-4.6, gpt-5.5, ...
```

Buka `http://127.0.0.1:4141/` di browser → dashboard.

---

## Cara pake — quick start

### 1. Tambah key

Edit `codebuddy_keys.txt` (satu key per line, format `email:ck_xxx.yyy`), atau pake bot di dashboard tab **Run Bot** buat signup otomatis (lihat [Bot signup](#bot-signup-unlucid--codebuddy)).

File ini di-watch otomatis — perubahan langsung ke-reload tanpa restart server.

### 2. Test cepat dari dashboard

- Buka `http://127.0.0.1:4141/`
- Tab **Overview** → pilih model di dropdown → tulis prompt → klik **Send**
- Kalau balik response, router lo udah jalan.

### 3. Test pake `curl`

```bash
curl -N -X POST http://127.0.0.1:4141/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-opus-4.6",
    "messages": [
      {"role": "system", "content": "You are helpful."},
      {"role": "user",   "content": "Reply with: ROUTER_OK"}
    ],
    "stream": true
  }'
```

Lo bakal liat SSE chunks `data: {…}` ngalir.

---

## Setup provider Kiro (extra)

Sambungin udah support routing ke **Kiro IDE** upstream juga. Free tier Kiro = 50 credits/bulan + 500 bonus, dengan model:

- `claude-sonnet-4.5` — Claude Sonnet 4.5 (1M context)
- `claude-sonnet-4` — Claude Sonnet 4
- `claude-3.7-sonnet` — Claude 3.7 Sonnet
- `deepseek-v3.2-kiro` — DeepSeek V3.2 (Kiro version)
- `minimax-m2.5`, `minimax-m2.1`
- `glm-5`, `qwen3-coder-next`

Kiro pake OAuth (refresh token), bukan API key. Cara setup:

### Step 1. Login lewat Kiro CLI

Install [kiro-cli](https://docs.kiro.dev/) di mesin lo, terus login:
```bash
kiro-cli login --license free --use-device-flow
# Browser kebuka, login pake Google/email, approve device.
```

### Step 2. Extract refresh token + client creds

Di mesin yang sama lo run kiro-cli:

**Linux:**
```bash
sqlite3 ~/.local/share/kiro-cli/data.sqlite3 \
  "SELECT value FROM auth_kv WHERE key='kirocli:odic:token';"

sqlite3 ~/.local/share/kiro-cli/data.sqlite3 \
  "SELECT value FROM auth_kv WHERE key='kirocli:odic:client-registration';"
```

**macOS:** ganti path ke `~/Library/Application Support/kiro-cli/data.sqlite3`.

Output kedua query bakal JSON. Yang pertama berisi `refresh_token` + `access_token`. Yang kedua berisi `client_id` + `client_secret`.

### Step 3. Add ke sambungin lewat dashboard

1. Buka http://127.0.0.1:4141/ → tab **Kiro Pool**.
2. Klik field "refreshToken" → paste nilai `refresh_token`.
3. Auth type pilih **IdC (Builder ID / DeviceCode)**.
4. Paste `client_id` dan `client_secret`.
5. Klik **Add credential**. Sambungin bakal langsung validate (refresh token → dapet access token). Kalau toast bilang `✓ refresh succeeded`, status `active`, lo udah bisa pake model Kiro lewat OpenCode.

### Auto-refresh

Sambungin auto-refresh access token ~1 menit sebelum expire (default ~1 jam TTL). Refresh token bertahan lebih lama. Kalau refresh token expired (jarang), tinggal ulangi step 1-3.

### Multi-akun Kiro

Tiap akun Kiro = 1 credential row. Lo bisa add berapapun via dashboard, sambungin auto-rotate kalau salah satu kena rate limit.

---

## Konfigurasi OpenCode (penting)

OpenCode pake [openai-compatible provider](https://opencode.ai/docs/providers/) — kita cuma perlu kasih dia `baseURL` ke router lo dan list model yang mau di-expose.

### Step 1. Cari config OpenCode lo

Default lokasi:

| OS | Path |
| --- | --- |
| macOS / Linux | `~/.config/opencode/opencode.jsonc` |
| Windows | `%USERPROFILE%\.config\opencode\opencode.jsonc` |

Kalau belum ada, bikin folder + file kosong dulu:
```bash
mkdir -p ~/.config/opencode
touch ~/.config/opencode/opencode.jsonc
```

### Step 2. Paste config ini

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "sambungin": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Sambungin (CodeBuddy + Kiro)",
      "options": {
        "baseURL": "http://127.0.0.1:4141/v1",
        "apiKey": "not-required-router-doesnt-check"
      },
      "models": {
        "claude-opus-4.6": {
          "name": "claude-opus-4.6",
          "variants": {
            "max":    { "reasoningEffort": "max",    "textVerbosity": "low",    "reasoningSummary": "auto" },
            "high":   { "reasoningEffort": "high",   "textVerbosity": "low",    "reasoningSummary": "auto" },
            "medium": { "reasoningEffort": "medium", "textVerbosity": "medium", "reasoningSummary": "auto" },
            "low":    { "reasoningEffort": "low",    "textVerbosity": "medium", "reasoningSummary": "auto" }
          },
          "limit":      { "context": 1000000, "output": 128000 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] }
        },
        "claude-sonnet-4.5": {
          "name": "claude-sonnet-4.5",
          "variants": {
            "max":  { "reasoningEffort": "max",  "textVerbosity": "low" },
            "high": { "reasoningEffort": "high", "textVerbosity": "low" }
          },
          "limit":      { "context": 200000, "output": 64000 },
          "modalities": { "input": ["text", "image", "pdf"], "output": ["text"] }
        }
        // ... 22 more models — see the full snippet on dashboard tab Overview
      }
    }
  }
}
```

> Snippet di atas cuma cuplikan. Yang lengkap (24 model: 16 dari CodeBuddy + 8 dari Kiro, dengan `variants` / `limit` / `modalities` per model) di-generate otomatis di dashboard tab **Overview** — copy dari sana. Kalau lo butuh ngubah angkanya (misal context limit beda buat akun lo), pake form **Per-model capability overrides** di tab **Settings** — overrides di-merge ke snippet otomatis.

**Variants** (`max`, `high`, `medium`, `low`) di OpenCode bakal di-forward ke router sebagai `reasoning_effort` / `text_verbosity` / `reasoning_summary` body fields. Sambungin treatment:
- **Reasoning model di CodeBuddy** (claude-opus-4.6, gpt-5.x, o3, o4-mini, gemini-3.x/2.5, glm-4.6) → field di-passthrough ke upstream as-is.
- **Reasoning model di Kiro** (claude-sonnet-4.5/4, claude-3.7-sonnet, glm-5) → CodeWhisperer ga support `reasoning_effort` natively, jadi sambungin nge-prepend instruksi system prompt yang minta model wrap reasoning di `<thinking>...</thinking>`. Sambungin parse balik ke `reasoning_content` di response stream — OpenCode bakal render di reasoning panel.
- **Non-reasoning model** (deepseek, minimax, qwen, auto-chat) → reasoning fields di-strip sebelum forward biar upstream parser ga komplain.

### Step 3. Pilih model di OpenCode

Restart OpenCode, terus di session ketik `/model`. Lo bakal liat provider **Sambungin (CodeBuddy)** dengan list model di atas. Pilih `claude-opus-4.6` (atau yang lain), enjoy.

OpenCode terus bisa pake API memori native dia karena history dikirim ulang tiap turn — ga peduli key mana yang lagi mejawab.

---

## Konfigurasi OpenAI SDK / curl

### Python (openai SDK)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:4141/v1",
    api_key="not-required",
)

resp = client.chat.completions.create(
    model="claude-opus-4.6",
    messages=[{"role": "user", "content": "Halo!"}],
    stream=True,
)
for chunk in resp:
    print(chunk.choices[0].delta.content or "", end="", flush=True)
```

### Node.js (openai SDK)

```js
import OpenAI from "openai";
const client = new OpenAI({ baseURL: "http://127.0.0.1:4141/v1", apiKey: "not-required" });
const resp = await client.chat.completions.create({
  model: "claude-opus-4.6",
  messages: [{ role: "user", content: "Halo!" }],
  stream: true,
});
for await (const chunk of resp) process.stdout.write(chunk.choices[0]?.delta?.content || "");
```

---

## Cara kerja rotation + multi-provider

Tiap request masuk `/v1/chat/completions`:

1. Router lookup `body.model` di `MODEL_PROVIDERS` map → tentuin provider (`codebuddy` atau `kiro`).
2. Pilih key dari pool **provider tersebut** dengan `last_used_at` paling lama (round-robin antar key yang ga cooldown / dead).
3. Untuk Kiro: kalau access token udah mau expire (<1 menit), refresh dulu via OIDC (`oidc.us-east-1.amazonaws.com/token` untuk IdC, atau `prod.us-east-1.auth.desktop.kiro.dev/refreshToken` untuk Social).
4. Forward ke upstream provider:
   - CodeBuddy → `Authorization: Bearer <ck_*>`
   - Kiro → `Authorization: Bearer <accessToken>` ke `codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse`
5. Kalau upstream balik:
   - **`401` / `403`** → mark **dead** (di pool provider tsb), retry sama key/cred berikutnya.
   - **`429` / `402`** atau "rate limit" / "quota" → mark **cooldown** (default 24 jam, configurable), retry sama key/cred berikutnya.
   - **Error lain** → propagasi ke klien (no rotation).
6. Kalau stream **udah mulai nulis** ke klien terus error mid-stream → klien terima error apa adanya (no retry, karena byte udah terkirim).
7. Setelah cooldown abis (default 24h), key auto-promote balik jadi active.

Rotation **stays within the same provider** — kalau lo minta `claude-sonnet-4.5` (Kiro) dan semua Kiro creds cooldown, router balik `503 no_creds_available`, **bukan** auto-fallback ke CodeBuddy. Logic ini sengaja: model Kiro vs CodeBuddy beda kapabilitas + harga.

Default max rotation per request: **5 key**. Kalau semua 5 key fail, router balikin `503 all_keys_failed` ke klien.

---

## Daftar model yang bisa dipake

### Provider: CodeBuddy (`https://www.codebuddy.ai/v2/chat/completions`)

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

### Provider: Kiro (`https://codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse`)

| Exposed name          | Upstream model ID                        |
| --------------------- | ---------------------------------------- |
| `claude-sonnet-4.5`   | `CLAUDE_SONNET_4_5_20250929_V1_0`        |
| `claude-sonnet-4`     | `CLAUDE_SONNET_4_20250514_V1_0`          |
| `claude-3.7-sonnet`   | `CLAUDE_3_7_SONNET_20250219_V1_0`        |
| `deepseek-v3.2-kiro`  | `DEEPSEEK_V3_2_EXP_V1_0`                 |
| `minimax-m2.5`        | `MINIMAX_M2_5_V1_0`                      |
| `minimax-m2.1`        | `MINIMAX_M2_FP8_V1_0`                    |
| `glm-5`               | `GLM_5_FP8_V1_0`                         |
| `qwen3-coder-next`    | `QWEN3_CODER_NEXT_V1_0`                  |

Mapping `model → provider` di-store di `server/lib/config.js → MODEL_PROVIDERS`. Kalau lo nambah model baru di Settings tab, jangan lupa juga set provider-nya di `MODEL_PROVIDERS`.

Kalau model CodeBuddy ga ada di akun lo, upstream balikin `code 11102 — service info not found`. Edit list di tab **Settings** (atau langsung di `server/lib/config.js → EXPOSED_MODELS`) supaya nyocokin sama akun lo.

---

## Bot signup (Unlucid + CodeBuddy + Kiro)

Buat ngegandain key/credential, ada bot bawaan yang signup ke Unlucid.ai (referral), CodeBuddy.ai, dan/atau Kiro IDE pake Camoufox + Google OAuth.

**Mode** (pilih di dashboard tab Run Bot):
- **Unlucid + CodeBuddy + Kiro** — full pipeline, 1 akun Google → unlucid ref + ck_* key + Kiro refresh token.
- **CodeBuddy + Kiro** — skip Unlucid (kalo lo udah pernah unlucid).
- **CodeBuddy only** — cuma signup CodeBuddy, isi `codebuddy_keys.txt`.
- **Kiro only** — cuma login Kiro, isi `kiro_credentials.json`.

Kalo mode include Kiro, bot bakal:
1. Spawn `kiro-cli login --license free --use-device-flow` (jadi syarat: `kiro-cli` dan `sqlite3` ada di PATH mesin lo).
2. Parse device URL dari output kiro-cli, navigasi browser ke URL itu, klik "Continue with Google".
3. Pake `lib/google.js` yang sama dengan CodeBuddy → login Google → approve device.
4. Tunggu kiro-cli exit (token tersimpan di `~/.local/share/kiro-cli/data.sqlite3`).
5. Baca refreshToken/clientId/clientSecret dari sqlite, langsung append ke pool Kiro sambungin (validate via refresh dulu).

> **Note:** `kiro-cli` data sqlite di-share antar invocation pada mesin yang sama. Kalo lo pengen multi-akun Kiro di mesin yang sama, set ulang HOME atau jalanin di VM/container terpisah biar token ga ke-overwrite. Production multi-akun lebih reliable kalo lo pisah-pisah lewat VM.

### File input

**`accounts.txt`** — list akun Google (yg udah lo bikin sebelumnya):
```
emailgw1@gmail.com:passwordgw1
emailgw2@gmail.com:passwordgw2
```

**`proxies.txt`** — list proxy buat di-rotate (round-robin):
```
http://user:pass@1.2.3.4:8080
http://user:pass@5.6.7.8:8080
```

### Cara jalanin

**Lewat dashboard (recommended):**
1. Buka tab **Accounts**, paste list akun → Save.
2. Buka tab **Proxies**, paste list proxy → Save.
3. Buka tab **Run Bot**:
   - Mode: `Unlucid + CodeBuddy + Kiro` / `CodeBuddy + Kiro` / `CodeBuddy only` / `Kiro only`
   - Headless: **No** (kalau pertama kali, biar lo bisa liat) / Yes (production)
   - Limit: 0 = pake semua akun
   - Klik **Start**
4. Live log streaming di panel bawah. Key CodeBuddy baru otomatis ke-append ke `codebuddy_keys.txt` → langsung muncul di pool. Credential Kiro otomatis di-validate (refresh token → access token) lalu di-append ke `kiro_credentials.json` → langsung muncul di Kiro Pool.

**Lewat CLI (mode lama, Unlucid + CodeBuddy):**
```bash
npm start
# Interactive prompts:
# 1) Mode: 1=Unlucid, 2=CodeBuddy, 3=Both
# 2) Headless? y/n
# 3) Confirm? y/n
```
> CLI cuma support mode 1/2/3 (no Kiro). Buat Kiro signup, pake dashboard.

### Detail flow signup

**CodeBuddy.ai:**
1. Login page → "Sign up with Google" (di iframe)
2. Confirm service agreement
3. Google OAuth (email → password → workspace terms → consent)
4. Pilih region: **Singapore**
5. Profile → Access Keys → create key (random name)
6. Append `email:ck_xxx.yyy` ke `codebuddy_keys.txt`

**Unlucid.ai:**
1. Buka referral link
2. "Sign In with Google"
3. Google OAuth
4. Redirect kembali ke Unlucid

Tiap service auto-retry 3x kalau timeout / fail.

---

## Temp Mail (catchall via Cloudflare → Gmail IMAP)

Tab **Temp Mail** di dashboard ngehandle alamat email sekali pakai untuk signup-an (target awal: ChatGPT Pro). Arsitekturnya simple:

```
xxxx@domainlo.com → MX (Cloudflare) → Email Routing catch-all
                                              ↓
                                      gmail-tujuan@gmail.com
                                              ↓ IMAP polling tiap 10s
                                          sambungin
```

**State persistent di `server/tempmail.json`** (gitignored): inbox list, domain list, address pool, cache message + UID checkpoint per inbox. Restart server ga ngewipe apa-apa.

### Setup (sekali aja per domain + per Gmail)

1. **Cloudflare Email Routing** untuk tiap domain:
   - Domain → Email → Email Routing → Get started
   - Cloudflare auto-add MX + SPF, accept aja
   - Tambah destination address (Gmail tujuan), klik link verifikasi yang Cloudflare kirim
   - Routing rules → enable Catch-all → action "Send to an email" → pilih Gmail tujuan
2. **Gmail App Password** untuk Gmail tujuan:
   - Aktifin 2FA di Google account
   - Buka https://myaccount.google.com/apppasswords, generate password (16 karakter)
3. Di dashboard tab **Temp Mail**:
   - Form **Gmail inbox** → paste Gmail address + app password → klik **Test connection** (validasi IMAP) → **Save inbox**
   - Form **Domain** → ketik domain lo → pilih Gmail inbox tujuan → **Add domain**
   - Form **Generate address** → pilih domain → optional prefix/label → **Generate** → dapet `prefix.xxxxxxxx@domainlo.com`

### API endpoints (buat integrasi bot)

| Method | Path | Use case |
| --- | --- | --- |
| GET | `/api/tempmail/overview` | Snapshot semua state |
| POST | `/api/tempmail/addresses` | Generate address baru, body `{ domain, prefix?, label? }` |
| GET | `/api/tempmail/addresses/:address/messages` | List mail untuk address itu |
| GET | `/api/tempmail/addresses/:address/extract` | Auto-extract OTP 6 digit / kode `code: XXXX` / magic link URL pertama |
| POST | `/api/tempmail/poll` | Trigger poll manual (poll otomatis jalan tiap 10s) |
| DELETE | `/api/tempmail/addresses/:address` | Revoke address + drop cached messages |

Bot autocreate ChatGPT (Phase 2) bakal pake `POST /addresses` → submit address ke OpenAI signup form → loop `GET /addresses/:addr/extract` sampai dapet OTP.

---

## Konfigurasi lanjutan (env var)

Set sebelum `npm run dev`. Prefix `SAMBUNGIN_` paling utama, `BOTCOD_` / `ROUTER_` juga keterima buat backward compat.

| Var | Default | Arti |
| --- | --- | --- |
| `SAMBUNGIN_PORT` | `4141` | Port listen |
| `SAMBUNGIN_HOST` | `127.0.0.1` | Host bind. Set `0.0.0.0` buat expose ke LAN (set `DASHBOARD_PASSWORD` juga). |
| `SAMBUNGIN_KEYS_FILE` | `./codebuddy_keys.txt` | Path file key (auto-watched buat hot reload) |
| `SAMBUNGIN_UPSTREAM_BASE` | `https://www.codebuddy.ai` | URL upstream |
| `SAMBUNGIN_COOLDOWN_MS` | `86400000` (24h) | Durasi cooldown setelah `429` sebelum auto-promote balik |
| `SAMBUNGIN_DASHBOARD_PASSWORD` | _kosong_ | Kalau di-set, dashboard butuh header `X-Dashboard-Password`. `/v1/*` tetep open. |

Sebagian besar override juga bisa dilakuin lewat tab **Settings** di dashboard, dan persist ke `server/settings.json` (gitignored).

---

## Troubleshooting

**`code 11102 — service info not found`**
Model yang lo minta ga ada di akun CodeBuddy lo. Pilih model lain dari [tabel di atas](#daftar-model-yang-bisa-dipake), atau edit `EXPOSED_MODELS`.

**`code 11101 — Parse message failed: invalid request`**
Body request kosong / kelewat field. Sambungin udah inject `system` message default kalau klien lo cuma kirim user message; tapi kalau lo ngirim manual via curl, pastiin minimal ada satu pesan `user`.

**`429` terus walaupun ada banyak key**
Cek tab **Key Pool**: kalau semua status **cooldown**, tunggu 24h (atau turunin `SAMBUNGIN_COOLDOWN_MS`). Kalau **dead**, cek tab Settings/log: bisa jadi key di-revoke di CodeBuddy.

**Streaming tiba-tiba putus**
Mid-stream errors **ga di-rotate** (response udah mulai nulis). OpenCode bakal show error → tinggal retry, request kedua bakal ke key baru otomatis.

**Bot signup error "Camoufox not found"**
```bash
npx camoufox-js fetch
```

**Dashboard ga ke-load di browser**
Pastiin `npm run dev` jalan dan port `4141` ga di-block. Coba `curl http://127.0.0.1:4141/api/overview`.

---

## File structure

```
sambungin/
├── index.js                    # CLI entry (bot signup mode)
├── lib/                        # bot logic (importable)
│   ├── utils.js
│   ├── google.js               # handleGoogleLogin
│   ├── unlucid.js              # processUnlucid
│   ├── codebuddy.js            # processCodeBuddy
│   └── runner.js               # processAccount + runBatch (EventEmitter)
├── server/
│   ├── index.js                # Express @ :4141
│   ├── lib/
│   │   ├── config.js           # env + persisted settings
│   │   ├── state.js            # JSON state per-key
│   │   ├── keyPool.js          # rotation logic
│   │   ├── translate.js        # OpenAI ↔ CodeBuddy
│   │   ├── upstream.js         # streamChatCompletion w/ rotation
│   │   └── jobs.js             # bot job runner + SSE emitter
│   ├── routes/
│   │   ├── openai.js           # /v1/chat/completions, /v1/models
│   │   └── api.js              # dashboard backend
│   └── public/                 # dashboard SPA (HTML + vanilla JS, no build)
├── codebuddy_keys.txt          # gitignored — output bot, input router
├── accounts.txt                # gitignored — input bot
├── proxies.txt                 # gitignored — input bot
└── package.json
```

---

## License

ISC. Pake bertanggung jawab — hormati ToS CodeBuddy / Unlucid.
