# Multi-Service Auto Signup Bot

Auto signup bot for **Unlucid.ai** and **CodeBuddy.ai** using Camoufox (anti-detect Firefox) with proxy rotation.

## Features

- 3 registration modes: Unlucid only, CodeBuddy only, or both
- Google OAuth login automation
- Proxy rotation (round-robin)
- Anti-detect browser via Camoufox
- Auto retry up to 3x on timeout/failure (refreshes browser between attempts)
- CodeBuddy: auto-creates API key and saves to `codebuddy_keys.txt` immediately per account
- Handles Google Workspace terms, OAuth consent, account chooser, 2FA wait

## Requirements

- Node.js 18+
- Camoufox binary (installed via `camoufox-js`)

## Setup

```bash
npm install
```

## File Structure

```
accounts.txt        # email:password (one per line)
proxies.txt         # http://user:pass@host:port (one per line)
codebuddy_keys.txt  # output - email:apikey (auto-generated)
```

### accounts.txt format
```
email@domain.com:password
another@domain.com:password
```

### proxies.txt format
```
http://user:pass@ip:port
http://user:pass@ip:port
```

## Usage

```bash
npm start
```

The bot will prompt you to:
1. Select mode (1 = Unlucid, 2 = CodeBuddy, 3 = Both)
2. Choose headless or headed browser
3. Confirm to start

## Output

When running CodeBuddy mode, API keys are saved to `codebuddy_keys.txt` immediately after each successful registration:

```
email@domain.com:ck_xxxxx.yyyyyyyyyyyyyyyy
another@domain.com:ck_xxxxx.zzzzzzzzzzzzzz
```

## Registration Flow

### Unlucid.ai
1. Navigate to referral link
2. Click Sign In → Google
3. Google OAuth (email → password → workspace terms → consent)
4. Redirect back to unlucid.ai

### CodeBuddy.ai
1. Navigate to login page
2. Click "Sign up with Google" (inside iframe)
3. Confirm service agreement
4. Google OAuth
5. Select Singapore as registration region
6. Navigate to Profile → Access Keys
7. Create key with random name
8. Extract API key from success dialog
9. Append `email:apikey` to `codebuddy_keys.txt`

## Retry Logic

Each service gets up to 3 attempts. On failure:
- Browser navigates to `about:blank` to clear state
- Waits 3 seconds
- Re-runs the entire flow from scratch

## Notes

- Proxies are assigned round-robin (cycling if more accounts than proxies)
- `accounts.txt`, `proxies.txt`, and `codebuddy_keys.txt` are gitignored
- CodeBuddy region is hardcoded to **Singapore**
