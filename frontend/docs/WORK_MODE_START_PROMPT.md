# Work mode kickoff prompt — WakeCast frontend

Continue the WakeCast.fi frontend implementation from the existing repository. Before making ANY code changes:

1. Read `AGENTS.md` at repo root, `frontend/AGENTS.md`, `frontend/docs/DESIGN_SPEC.md`, and `frontend/docs/IMPLEMENTATION_CHECKLIST.md`. Follow relevant installed Next.js docs from `frontend/node_modules/next/dist/docs/` before writing frontend code.
2. Compare those documents with the actual local checkout and backend API models. Respect any uncommitted local work; do not assume the GitHub main snapshot is identical.
3. Check current branch and follow root AGENTS Git rules; no direct main edits, no commits/pushes/migrations without my explicit authorization.
4. Report the current state, identify the first unchecked checklist task, and propose a narrowly scoped implementation and tests. STOP and wait for my approval before implementing it.
5. Preserve the agreed UI: responsive EN/FI site; compact park list; current conditions and replaceable wind compass; daily hourly and two-page weekly 3-hour four-line weather chart with two separate unit axes; cloudiness shading; rain probability boxes below chart; honest measurement-vs-forecast distinction; water temp continuity with true sample timestamp; one collapsible hourly data table with day navigation and explicit NOW/source distinction.
6. The backend stores more data than it exposes. Verify observation, water-temp history and rain-probability availability before building charts. Never invent data. Proposed new read-only endpoints require approval and tests.
7. Communicate just the current top-level checklist section in routine answers, not the entire list (unless asked). Keep changes small and wait for review between substeps.

Do not start coding until you have presented your assessment and I have approved the first step.


## New backend-history patch package (prepared separately)
Before frontend weather dashboard development, review and integrate the two read-only backend history endpoints from `WakeCast_history_endpoints`, **only after user authorizes backend changes on the feature branch**. Validate station association and bounded local calendar queries, run targeted and full backend test suite. The bundled files are proposed code and have NOT been applied to GitHub. Do not attempt to add a rain-probability provider; use available non-null FMI `PoP` values. Keep future water temperature blank. Include measured precipitation and clickable source-info disclosures in UI.
