# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Two independent pub-quiz web apps for live events, each a handful of static HTML files with
inline `<style>` and inline vanilla JS. No framework, no build step, no package.json, no tests.

- `Mini-Secrets/` - "Secrets of Prague", English, 7 questions, gold-on-black ornamental styling.
- `Bursa/` - Czech, 6 questions, flat off-white/black/mint brand, installable as a PWA.
- `index.html` at the root is a chooser linking to both.

They are **deliberately duplicated, not a shared codebase.** Bursa began as a rebrand of
Mini-Secrets, but the two share almost no visual language, so they were forked rather than
abstracted behind a theme layer. Do not "DRY them up" without being asked - a change to one is
not meant to affect the other.

## Running and deploying

```bash
npx serve . -l 5000          # from the repo root
```

Then `http://localhost:5000/Bursa/` or `/Mini-Secrets/`.

**A service worker will not register over `file://`**, so opening the HTML directly silently
disables everything PWA-related in `Bursa/`. Always test over HTTP.

Note `serve` rewrites clean URLs (`/Bursa/scoreboard` works locally). GitHub Pages does not -
live links need the `.html`.

Deployment is `git push origin main`. GitHub Pages serves **`main` at root**, and Pages allows
exactly one source per repo - which is why both quizzes live in sibling folders rather than on
separate branches. Work on a branch, but nothing is reachable publicly until it lands on `main`.
The build takes roughly a minute; poll it with:

```bash
gh api repos/dtmika2/Mini-Secrets-of-Prague/pages/builds/latest --jq '.status + " " + .commit'
```

There is no test suite. Verification is driving the real app in a browser - checking the full
question flow, the 25-second timer, offline behaviour, and that `Mini-Secrets/` still works after
touching anything shared.

## Architecture

Each app is three standalone pages that never import from each other, plus (Bursa only) a service
worker:

| | role | reads scores from | writes to |
|---|---|---|---|
| `index.html` | the quiz itself | localStorage | localStorage + Sheet |
| `scoreboard.html` | projector/TV board, auto-scrolls, re-polls every 20s | **the Sheet** | - |
| `editor.html` | score admin: restore from Sheet, wipe local | localStorage | localStorage only |

`index.html` is the whole quiz in one file. A single mutable `S` object holds all state; `render()`
removes the current `.screen` node and calls the function named by `S.screen`
(`start | name | question | result | scoreboard`). Navigation is: mutate `S.screen`, call
`render()`. There is no router and no framework.

**A Google Apps Script web app is the only thing linking devices.** `Bursa/apps-script.gs` is the
source, but it does not run from this repo - it lives inside the Google Sheet and must be deployed
there as a web app. A tablet POSTs each finished score; the projector GETs the whole list. There is
no direct device-to-device channel, so both need internet. Each app has its own endpoint and its
own Sheet.

## Gotchas that will cost you time

**Bump `CACHE` in `Bursa/sw.js` on every content change.** Otherwise installed clients keep serving
the old shell. Currently `bursa-v9`. Users need no action beyond reopening the app while online -
navigations are network-first, so the fresh `index.html` (which carries all CSS and JS inline)
arrives on the first launch, and `skipWaiting()`/`clients.claim()` swap the worker immediately.
Clearing old caches does not touch localStorage, so scores survive an update.

**Precache entries must use `cache: 'reload'`.** The `<audio>` elements preload with Range
requests, so the HTTP cache holds *206 Partial Content* for the mp3s - and `Cache.put` rejects a
206. Without the flag the sounds silently fail to cache and the app is mute offline. For the same
reason the runtime fetch handler checks `status === 200`, not `res.ok`.

**localStorage is scoped per-origin, not per-path.** Every page under `dtmika2.github.io` shares one
origin, so the two quizzes would share a leaderboard if they used the same key. They must stay
distinct: `bursaScores_v1` vs `miniSecretsScores_v1`.

**`curl` cannot test an Apps Script endpoint.** Google serves a Czech "file cannot be opened" HTML
page to non-browser clients - the known-working endpoints return it too. Test with a real browser,
fetching from the site origin so CORS is exercised the way the app does it.

**Editing `apps-script.gs` does not update the live `/exec` URL.** In the Apps Script editor:
Deploy → Manage deployments → pencil → Version: *New version*. Access must be "Anyone", not "Anyone
with a Google account", or callers get a sign-in page instead of JSON.

**Careful with anything that writes to the Sheet during testing.** The offline queue flushes on
load, so seeding `bursaPendingScores_v1` will POST junk rows into the live leaderboard. Point
`SHEET_URL` at the placeholder in any scratch copy.

## Conventions worth knowing

- **Questions are authored with the correct answer first** (`correct: 0`) for readability;
  `buildDeck()` shuffles the options per playthrough and remaps `correct`. Keep that convention when
  editing `QS` - do not hand-shuffle the source.
- **Both apps collect a player email between the name screen and the first question.** It is
  POSTed to the Sheet but deliberately never written to localStorage and never returned by
  `doGet`, so no address reaches the projector board or a shared tablet's local leaderboard.
  Prague's step is optional (a SKIP button); Bursa's is required. Both sheets are
  `Timestamp | Name | Email | Score | Correct`.
- **The in-app leaderboard is local-only by design.** Only `scoreboard.html` queries the Sheet, so
  with several tablets each shows just its own players while the projector shows everyone. This is
  known and accepted, not a bug to fix.
- **Constants are duplicated across the three files of each app** (`STORE_KEY`, `QUEUE_KEY`,
  `MAX_QS`, `SHEET_URL`) and so is the colour palette. Changing one means changing all of them -
  grep before assuming a single edit is enough. `MAX_QS` is 6 for Bursa, 7 for Prague.
- **Language**: Bursa is Czech throughout (`lang="cs"`), Prague is English. Bursa has a `bodu()`
  helper for Czech point plurals (bod / body / bodů) - use it rather than hardcoding.
- **Scoring is identical in both**: per-question points plus `secondsLeft * 3` from a 25s timer.
  The totals differ only because Prague has a seventh question. Prague's result screen claims "out
  of 730 points", which is wrong since the time bonus exceeds it; Bursa's wording was corrected.
- `Bursa/` deliberately carries **no background images** - that is what keeps a full offline
  precache practical. `Mini-Secrets/Backgrounds/` alone is 55 MB.
- The real Bursa typeface has not arrived; `fonts/archivo-*.woff2` is a self-hosted placeholder
  (weight 900 with the width axis widened). Swapping it is one `@font-face` block.
