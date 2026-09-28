# BUILD PROMPT: ¿Llego? (Week 7, Nico)

> Paste this whole file into your coding agent (Claude Code) from the repo root. `docs/PACKET.md` is the source of truth; if this prompt and the packet disagree, the packet wins. Ask me before you deviate from it.

## Context

You are building **¿Llego?**, a mobile-first web app that shows one commuter (Rodolfo, Atizapán → Metro El Rosario) how reliable his colectivo corridor is at a given departure time: typical wait (p50), bad-day wait (p90), probability of getting a seat, and an honest confidence label. It uses **simulated** data, labeled on every screen.

**Hard rules (do not break any of them):**
1. **No worker-identifying data, ever.** No `vehicle`, `unit`, `plate`, `driver`, `placa`, `unidad`, `chofer` columns, props, payload keys or UI. Data describes routes and hours only. (Blueprint Condition 3 / Shadow Clause)
2. **Aggregate only.** Live reports are shown only when count ≥ 3 in the 2-hour window. There are no individual vehicle icons on the map and no leaderboards.
3. **Contradictions go to a human.** If live reports contradict the forecast, create a `review_cases` row and tag the UI `en revisión`. Never auto-change the forecast.
4. **GPS is opt-in and local.** It runs only between explicit "Empezar"/"Terminar" taps, after a consent screen. Only durations and stop IDs are uploaded; the raw lat/lng trail never leaves the device.
5. **Security floor.** Supabase Auth (magic link); RLS on every table; no secrets in code (`.env.local` gitignored, Vercel env vars); service role only in `scripts/`; 100% simulated seed with `is_simulated = true`; yellow "DATOS SIMULADOS" banner on every screen.
6. **Free stack only.** No paid APIs, no map API keys, no ride-hailing, booking or dispatch features.
7. **Spanish UI**, large type, works one-handed on a small Android screen.

## Stack

Next.js (App Router, TypeScript) · Tailwind · Supabase (Postgres, Auth, RLS) · MapLibre GL JS + OSM raster tiles · Python 3 + scikit-learn for the batch model · Vitest · Playwright · Vercel.

## Features in commit order

Each commit must pass its acceptance criteria and `npm test` before you move on. After each one, update `docs/DECISIONS.md` with one line saying what you decided and why.

### Commit 1: `chore: scaffold, auth, banner, corridor config`
- Next.js + Tailwind + Supabase client; magic-link login; middleware protecting everything except `/`.
- `config/corridor.ts`: 4 stops (A Atizapán, B, C, D Metro El Rosario) with placeholder coordinates and a clear `// PLACEHOLDER: confirm with Rodolfo` comment. Swapping them must only require editing this file.
- `<SimBanner/>` in the root layout: yellow, "DATOS SIMULADOS".
- `.env.example` with variable names only; `.env.local` in `.gitignore`.

**Acceptance:** logged-out visit to `/corredor` redirects to `/login` (T1) · banner visible on every route · `git grep -i "service_role\|eyJ"` in `app/` and `components/` returns nothing.

### Commit 2: `feat: schema, RLS, simulated data, quantile model`
- `supabase/migrations/001_init.sql`: tables `stops`, `trips`, `reports`, `predictions`, `review_cases`, plus the function `live_reports_agg()` (security definer, returns counts per stop/kind for the last 2h, **omits rows with count < 3**). RLS policies exactly as in PACKET §9. Add a `reviewer` role check via a `profiles.role` column.
- `scripts/simulate_trips.py`: 90 days × weekdays/weekend × hours 4–9 × 3 segments. Waits get worse at 5–7am and on rainy days, with random breakdown spikes. Seat probability drops at peak. Set a fixed seed and `is_simulated=True`.
- `scripts/train.py`: `GradientBoostingRegressor(loss="quantile", alpha=0.5)` and `alpha=0.9` for wait; `GradientBoostingClassifier` for seat. Features: segment, daytype, hour, rain. Write one `predictions` row per (segment, daytype, hour) with `n_obs` and `model_version`. Enforce `wait_p90 >= wait_p50` by taking the max.
- `scripts/README.md` with the exact commands to run both.

**Acceptance:** migration applies cleanly · user A can't read user B's `trips` (T2, test with two accounts) · every prediction has p90 ≥ p50 (T9, a pytest or assert in `train.py`) · `grep -riE "vehicle|unit_id|plate|driver|placa|unidad|chofer" supabase/ scripts/ app/` → no matches (T6).

### Commit 3: `feat: forecast view with map + confidence labels` → 🚀 DEPLOY 1
- `/corredor`: pick origin, destination and departure time in **≤ 3 taps** (stop pair defaults to A→D, time defaults to "mañana 5:10").
- MapLibre map with the corridor as GeoJSON; segments colored green/amber/red by predicted p50; stops as circles; **no vehicle markers**.
- Forecast card: "Espera típica: X min", "Día malo: hasta Y min", "Ir sentado: Z%", and a confidence pill: `Buen dato · n viajes` (n ≥ 30), `Poco dato · n viajes` (5–29), or `Sin dato` (n < 5, shows the corridor-wide average in grey).
- `lib/confidence.ts` as a pure function, unit-tested.
- Cache the last prediction in memory/state so it survives a flaky connection.

**Acceptance:** Vitest covers confidence thresholds at 4/5/29/30 (T3) · Playwright happy path: login → corredor → card visible · deploy to Vercel, live URL works on a phone.

### Commit 4: `feat: live reports, k-threshold, review queue`
- On the forecast screen, three big buttons: "Espera larga" / "Va lleno" / "Se descompuso". Each inserts one `reports` row (expires +2h). Rate limit: 1 report per user per stop per 15 min.
- Live strip reads `live_reports_agg()`. It is hidden when every count < 3 (T4).
- Contradiction rule: ≥ 3 `long_wait` while p50 < 10 min, **or** 0 long-wait reports but ≥ 3 users logged waits under half of p50. When it triggers, insert a `review_cases` row (idempotent per stop + 2h window) and show `en revisión` on the strip. The forecast numbers must not change (T5).
- `/revision` page, visible only to `reviewer` role: list open cases, buttons "Confirmar" / "Descartar" plus a note field. Include no sanction or dispatch actions.

**Acceptance:** tests for T4 and T5 pass · a non-reviewer gets 403/redirect on `/revision` · the report payload in DevTools contains only `stop_id` and `kind`.

### Commit 5: `feat: trip logging with on-device GPS + Mis viajes` → 🚀 DEPLOY 2
- Consent screen before the first GPS use: "Guardamos cuánto esperaste y cuánto tardaste. No guardamos tu recorrido." with "Acepto" / "Ahora no".
- "Registrar mi viaje": "Empezar" starts `navigator.geolocation.watchPosition`. On the device, detect arrival at stops (≤ 80 m radius), compute `wait_min` and `ride_min`, and ask "¿Fuiste sentado?" (sí/no). "Terminar" clears the watch and **discards the trail from memory**, then uploads `{stop_from, stop_to, daytype, hour, wait_min, ride_min, got_seat}` only.
- Manual fallback if GPS is denied: two time pickers.
- `/mis-viajes`: list of own trips, with a delete button per trip.

**Acceptance:** T7, where the network payload has no lat/lng · T10, where a deleted trip is gone · T8, where on Slow 3G the forecast still renders from cache and the trip upload retries once · deploy.

## After commit 5 (fixes; each is its own commit)
- Run the full mechanical pass (T1–T10) and record results in `docs/TEST_LOG.md`. Fix at least one real bug, commit `fix: …`, redeploy.
- Apply the worst finding from `docs/PERSONA_LOG.md`, commit `fix(ux): …`, redeploy.

## Session Close (every session)
Update `docs/DECISIONS.md` (decisions + "mañana primero: …"), then commit and push.
