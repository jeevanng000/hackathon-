# 🩹 AutoPatch

**A bug fixer that shows its work, because "the AI says it's fixed" isn't good enough.**

AutoPatch finds bugs in your code, traces them to the root cause, and writes a patch. It then runs your tests in a locked-down sandbox before telling you whether the fix is safe to trust. Nothing gets applied unless a human says yes, and every decision is saved to a tamper-evident log.

> Built for the InnovEdge Hackathon 2026 · Team: "THE ONE"

---

## Why we built this

AI tools are great at suggesting fixes and bad at proving them. You paste in a bug, get a confident-looking patch, and then spend an hour wondering what it quietly broke.

We wanted the opposite: the AI proposes, the tests decide, and the developer stays in charge.

## How a fix travels through AutoPatch

```
  Your code + a failing test or error message
                    │
                    ▼
  1. DETECT    AST analysis and a Gemini AI scan find the suspects
  2. TRACE     Suspicious lines are ranked by which tests fail through them
  3. PATCH     A candidate fix is generated
  4. PROVE IT  Tests re-run in a sandbox and are compared to the original baseline
  5. VERDICT   You get a confidence score and a trust verdict
  6. YOU DECIDE  Approve or reject; the decision goes into the audit ledger
```

## What's inside

- **Hybrid bug detection:** a deterministic Python engine (AST analysis) works alongside a Gemini AI scan, and their findings are merged into one list.
- **Root-cause tracing:** it points to the likely culprit line instead of just saying "something is wrong".
- **Sandboxed validation:** every patch is tested in an isolated process with limits on memory, CPU time, output size and open files.
- **Trust verdict and confidence score:** a patch that doesn't hold up gets a hard `blocked`, not a polite suggestion.
- **Stale-patch protection:** patches are tied to a SHA-256 hash of the original code. If your file changed since the analysis, the patch is rejected (HTTP 409).
- **Audit ledger:** an append-only, hash-chained record of every validation, including the file, line, bug type, test results before and after, the diff, the decision (accepted, blocked or override) and who approved it.
- **Voice notes:** describe a bug out loud and Gemini transcribes it into the bug context.
- **Optional GraphRAG memory:** with Neo4j connected, AutoPatch remembers past bugs and patches and uses them as context for new ones. It's advisory only, and the app works fine without it.

## Tech stack

| Layer | What we used |
|---|---|
| Front end | React 19, Vite, Tailwind CSS 4, Motion, Prism (code highlighting), Lucide icons |
| Back end | Node.js, Express, TypeScript |
| Analysis engine | Python 3 (AST analysis and patch validation) |
| AI | Google Gemini via `@google/genai` |
| Memory (optional) | Neo4j AuraDB |
| Started from | Google AI Studio repository template |

## Project map

```
engine/                 The brains: Python analysis engine, Gemini scanner,
                        sandbox runner, audit ledger, security helpers, GraphRAG
src/                    React front end, plus shared types and helpers
public/assets/aistudio/ Static assets
server.ts               Express server and all API routes
.env.example            Every setting you can change, with safe defaults
```

---

## 🏃 Run it locally

This is the exact path that worked, written down so future-us doesn't have to rediscover it.

### What you need (one-time)

| Tool | Why | Check it |
|---|---|---|
| **Node.js** (current LTS) from [nodejs.org](https://nodejs.org) | Runs the server and the website | `node -v` and `npm -v` |
| **Python 3** | The analysis engine is started as `python3` | `python3 --version` |
| **Git** | To clone the repo | `git --version` |
| **Gemini API key** (optional) | Turns on the AI scan, AI patching and voice notes | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |

After installing Node.js, **close your terminal and open a new one**. An old window can't see the new install.

### First-time setup

```bash
git clone https://github.com/jeevanng000/hackathon-.git
cd hackathon-
npm install --legacy-peer-deps
cp .env.example .env
```

**Why `--legacy-peer-deps`?** `package.json` pins `esbuild` to `^0.25`, but Vite 8 wants `^0.27` or `^0.28`. Plain `npm install` stops with an `ERESOLVE` error. The flag tells npm to continue, and nothing breaks because the clash is on an optional peer dependency.

**Prefer to fix it properly?** Run `npm install -D esbuild@^0.28.0` instead, then commit `package.json` so teammates don't hit the same error.

### Add your Gemini key (optional)

Open the `.env` file in the project folder and set:

```
GEMINI_API_KEY=your_key_here
```

No quotes, no spaces, all on one line. The core features work without it, and only the AI parts stay off.

> ⚠️ **Never commit `.env` or share your key.** The repo is public. Run `git check-ignore .env`. It should print `.env`. If it prints nothing, fix `.gitignore` before you commit anything. If a key ever leaks, delete it at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) and create a new one.

### Start it

```bash
npm run dev
```

Then open **http://localhost:3000**.

Check the first line the server prints:

- `"geminiAi":true` means the key was picked up.
- `"geminiAi":false` means the key is missing, or you edited `.env` and didn't restart.

The server only reads `.env` when it starts, so after **any** change to `.env`, press `Ctrl+C` and run `npm run dev` again.

### Coming back later (quick start)

Once the setup above is done, this is all you need:

```bash
cd ~/hackathon-
npm run dev
```

Open http://localhost:3000. Stop the server with `Ctrl+C`.

If you pulled new changes from GitHub, run `npm install --legacy-peer-deps` once before starting.

### Try it with a quick test

Paste this buggy function (the `+ 1` is the bug) as the source:

```python
def average(numbers):
    total = 0
    for n in numbers:
        total += n
    return total / (len(numbers) + 1)
```

And this as the test:

```python
import unittest
from module import average

class TestAverage(unittest.TestCase):
    def test_average(self):
        self.assertEqual(average([2, 4, 6]), 4)

if __name__ == "__main__":
    unittest.main()
```

AutoPatch should flag the `+ 1` line and propose dividing by `len(numbers)`.

### If something goes wrong

| What you see | What it means | Fix |
|---|---|---|
| `fatal: destination path 'hackathon-' already exists` | You already cloned it | Skip the clone and just `cd hackathon-` |
| `bash: npm: command not found` | Node.js isn't installed, or the terminal can't see it yet | Install Node.js, close the terminal, open a new one, check `node -v` |
| `npm error ERESOLVE could not resolve` | esbuild version clash (see above) | `npm install --legacy-peer-deps` |
| `'tsx' is not recognized` | The install failed, so `tsx` never arrived | Fix the install first, then `npm run dev` |
| `"geminiAi":false` | Key missing from `.env`, or no restart | Add `GEMINI_API_KEY=...`, then `Ctrl+C` and `npm run dev` |
| `"sandboxLevel":"unavailable"` | The sandbox can't get its isolation on plain Windows | Use WSL (below) for full validation |
| Port 3000 already in use | Another copy is running | Close the other terminal, or set `PORT=3001` in `.env` |

### Windows users: use WSL for the full experience

On plain Windows (Git Bash), the server starts and the page loads, but the sandbox reports `unavailable`, and patch validation may fail or come back unverified. For a reliable demo, run it inside WSL (Ubuntu):

1. In PowerShell as administrator: `wsl --install`, then restart the laptop.
2. Open **Ubuntu** from the Start menu and install a current Node.js. Don't use the plain `apt install nodejs` package, which is usually too old. Use NodeSource instead:
   ```bash
   sudo apt update && sudo apt install -y git python3 curl
   curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
   sudo apt install -y nodejs
   node -v
   ```
3. Clone inside the Ubuntu home folder, **not** under `/mnt/c`:
   ```bash
   cd ~
   git clone https://github.com/jeevanng000/hackathon-.git
   cd hackathon-
   npm install --legacy-peer-deps
   cp .env.example .env
   npm run dev
   ```
4. Open http://localhost:3000 in your normal Windows browser.

## Settings that matter

| Variable | What it does | Required? |
|---|---|---|
| `GEMINI_API_KEY` | Turns on the AI scan, AI patching and voice transcription | For AI features |
| `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`, `NEO4J_DATABASE` | Turns on GraphRAG memory | Optional |
| `AUTOPATCH_API_KEY` | Locks `/api/*` behind a token | Optional |
| `PORT` | Server port (default `3000`) | Optional |
| `AUDIT_LOG_PATH` | Where the audit ledger is saved | Optional |
| `SANDBOX_*` | Memory, CPU, timeout and process limits for the sandbox | Optional |

`.env.example` lists every setting, and all of them have sensible defaults.

## API at a glance

| Endpoint | What it does |
|---|---|
| `GET /api/health` | Sandbox status, supported languages, and which integrations are switched on |
| `POST /api/autopatch` | The full Gemini-powered find, explain and patch workflow |
| `POST /api/analyze` | Deterministic analysis, with an optional AI scan on top |
| `POST /api/validate` | Runs a candidate patch in the sandbox and records the result in the audit ledger |
| `POST /api/transcribe-note` | Voice note in, text out |
| `/api/graphrag/*` | Optional Neo4j memory routes |

## Guardrails (why you can trust it)

- **Secrets never reach the sandbox.** The Python process runs with a stripped-down environment, so your API keys and database passwords can't leak into it.
- **Runaway code gets killed.** There are hard time limits, output caps and process-group kills.
- **Baselines can't be forged.** The server keeps its own test baseline and ignores any baseline sent by the client.
- **Requests are bounded.** There are size limits, rate limits, JSON-only POSTs and optional API-key auth.

## Honest limitations

- Python gets the full treatment. C, C++ and TypeScript are compile-checked, and other supported languages get static analysis only. `/api/health` lists exactly which is which.
- GraphRAG needs your own Neo4j instance. Without one, AutoPatch simply runs without memory.
- Sandbox isolation depends on the operating system. On plain Windows it reports `unavailable`, so use Linux or WSL for real validation.

## Run the checks

```bash
npm test        # unit tests for workflow, diff/audit, backend and GraphRAG
npm run check   # type-check plus Python engine syntax check
```

## The team-"THE ONE"
K V AMRUTESH-Team Lead
JEEVAN N G-Team Member
JAYDEV M S-Team Member

K V Amrutesh-Separation and sorting of files in GitHub,repo manager and ppt presentation
Jaydev M S-Front End Developer
Jeevan N G-Back End Developer

---

*Built in one hackathon, with more caffeine than sleep.* ☕
