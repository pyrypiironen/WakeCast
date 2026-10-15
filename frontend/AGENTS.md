<!-- BEGIN:nextjs-agent-rules -->

### This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in node_modules/next/dist/docs/ (resolved from this file's directory; in monorepos the next package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by next dev — verify at node_modules/next/dist/server/lib/generate-agent-files.js. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


### WakeCast frontend implementation rules

These supplement the repository-root AGENTS.md. Preserve the Next.js-generated block above and comply with the stricter rules on Git, tests, migrations and scope in root AGENTS.md.


## Sources of truth

- Read docs/DESIGN_SPEC.md for approved UX, weather charts, park pages and weather-data provenance requirements.
- Read docs/IMPLEMENTATION_CHECKLIST.md for the active work item, dependencies and verification acceptance criteria.
- Reinspect local checkout before changes: repository and files may be newer than the design preparation date.
- Do not change agreed product decisions without asking the user.


## Architecture

- Existing frontend stack: Next.js 16, React 19, TypeScript, Tailwind CSS 4. Reuse existing components/patterns and appropriate official local Next docs.
- Keep server-side backend API fetching for public data where suitable; never expose privileged API keys in client bundles.
- Backend FastAPI owns weather provider integration, database access and observation/forecast provenance. Do not call FMI/Open-Meteo/


## UIRA directly from UI as a workaround

- Maintain locale-prefixed /en (default) and /fi routes, all interface copy and accessible labels translated.
- Weather display is data-first, compact, mobile-responsive, readable on desktop.


## Weather data correctness

- Inspect exact FastAPI response models and real example responses. Forecasts are not measurements. Never invent a precipitation_probability value or treat observed rain as forecast probability.
- Use park timezone for local calendar-day selection; support DST 23/25-hour days.
- Show source station, provenance, timestamp and freshness where relevant.
- Preserve weather-data gaps in plotted actual observations and null columns; present water-temperature as a continuous held line only with explicit timestamp of last true sample.
- Keep wind direction FROM bearing concept distinct from downwind arrow; map/compass backdrop replaceable without changing rotation logic.
- Charts share 4 thin lines, two compatible axes (wind and temperatures), subtle cloudiness shading and separate rain-probability boxes below plot. Tooltip on hover/touch/keyboard.
- Detailed data table is one LOCAL calendar day at a time, collapsed by default, hourly with source/provenance labels and a NOW divider on current day.


## Work discipline

- Implement one checklist substep at a time. Do not perform speculative refactors or silently add dependencies.
- Do not modify backend except narrowly scoped, authorized API prerequisites for the requested frontend feature.
- Explicitly mark chat code snippets COMPLETE FILE versus PARTIAL CHANGE.
- Run relevant type-checks, linting and tests, report exact results; never claim tests passed without running them.
- Do not commit, push, merge or apply database migrations without explicit permission. Do not edit main directly: root instructions require a dedicated branch for changes.
- In routine replies show only the active TOP-LEVEL checklist section; show the full checklist when requested or transitioning between top-level sections. This is the user's specific frontend workflow preference and supersedes the generic root formatting rule in the frontend scope.
- Stop after the authorized step, summarize files changed, tests and next pending step, and await approval.


<!-- END:nextjs-agent-rules -->
