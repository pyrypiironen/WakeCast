# Section 1 handoff

Base source: `034196b802ac9d06b138e30deacc8ee8d3fcf1e3`.
Local branch: `feature/frontend-foundation`.

Direct clone failed with proxy HTTP 403. Files were retrieved through the read-only
GitHub connector at the pinned revision and placed in a new, isolated local Git
snapshot. The index contains the source baseline (there is no local commit); working
tree changes and new files are the implementation. Existing workspaces were left
untouched. No commits, pushes, merges, remote mutations or database changes occurred.

## Status

- 1.1 / 1.2: preserved, previously complete.
- 1.3: implemented, production HTTP checks passed; visual and keyboard browser checks
  remain pending. Chromium was unavailable and the browser download failed.
- 1.4: backend source audit complete; actual live API samples, configuration, horizon,
  PoP coverage and freshness remain pending. No live API was reachable/provided.
- 1.5: complete; types, client methods, formatters and timezone utilities tested.

## Files

Created:

- `src/components/AppHeader.tsx`: shared brand/navigation and skip link.
- `src/types/weather.ts`: exact forecast, history and latest-water wire shapes.
- `src/lib/date.ts`: aware timestamps, local dates/times, calendar arithmetic, DST boundaries.
- `src/lib/format.ts`: null-safe localized units, compass and provenance labels.
- `tests/api.test.ts`, `tests/date.test.ts`, `tests/format.test.ts`: targeted regressions.
- `tsconfig.test.json`: compile tests for Node's built-in runner.
- `docs/API_CONTRACT.md`: source audit, limitations and remaining live verification.
- `docs/FOUNDATION_HANDOFF.md`: this handoff.

Modified:

- `src/app/[lang]/layout.tsx`: shared header and single main landmark.
- `src/app/[lang]/page.tsx`: integrates shared layout, preserves existing simple
  names/count and adds localized empty/error text. No new park listing UI.
- `src/app/globals.css`: compact responsive layout, spacing, typography and focus states.
- `src/components/LanguageSwitcher.tsx`: localized accessible name and active-link styling.
- `src/lib/i18n.ts`: English/Finnish shared UI text.
- `src/lib/api.ts`: typed public weather/history reads, status/detail errors and timeout.
- `package.json`: dependency-free test command; lockfile/dependencies unchanged.
- `.gitignore`, `eslint.config.mjs`, `tsconfig.json`: exclude compiled test output.
- `docs/IMPLEMENTATION_CHECKLIST.md`: 1.5 checked, 1.3/1.4 limitations recorded.
- `docs/DESIGN_SPEC.md`: notes that historical API-gap text is superseded by current audit.

## Verification

- `npm test`: 16 passed.
- `npx tsc --noEmit`: passed (Next route types generated first).
- `npm run lint`: passed.
- `npm run build`: passed with installed Next.js 16.3.1.
- Production HTTP checks with controlled API test responses: `/` returns 307 to
  `/en`; `/en` and `/fi` return 200 with correct HTML language, links and localized
  empty/error text; skip-link target exists; unsupported `/de` returns 404.
- `git diff --check`: passed.
- Browser visual/keyboard checks: not executed; missing browser and failed download.
- Live backend response checks: not executed; no reachable live API.

No new packages, provider calls from the UI, backend changes, migrations, charts,
detail routes, measurement tables or Section 2 work were introduced.

## Continuing from the GitHub branch

The user authorized publishing this implementation to the dedicated GitHub branch
`feature/frontend-foundation` on 2026-10-15. The earlier no-push statement above
records the original implementation handoff. Main remains unchanged.

From your repository root, first check for uncommitted work:

```bash
git status --short
git fetch origin
git switch --track origin/feature/frontend-foundation
cd frontend
npm ci
npx next typegen
npm test
npx tsc --noEmit
npm run lint
npm run build
```

If you already have a local branch of that name, inspect it before switching or
pulling; do not overwrite existing changes. The earlier ZIP patch is an alternative
transfer method and must not be applied again after checking out this branch.

Set `WAKECAST_API_URL` using your existing environment setup for live verification.
Review `API_CONTRACT.md`'s remaining live checks, then visually check both languages
at phone/tablet/desktop sizes, Tab focus/skip link and language switching. Mark
1.3/1.4 complete only after their remaining checks pass.

Publishing this foundation is authorized. Merging into main and starting Section 2 still require separate approval.
