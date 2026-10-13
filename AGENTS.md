# WakeCast — Agent Instructions

## Project overview

WakeCast.fi is a wakeboarding weather conditions application.

Stack:
- Frontend: Next.js, TypeScript
- Backend: FastAPI, Python
- Database: PostgreSQL, SQLAlchemy, Alembic
- Weather data providers: FMI, Open-Meteo, UIRA
- Tests: pytest

Repository:
- frontend/
- backend/
- backend/app/
- backend/tests/

## Weather provider architecture

- Preserve existing provider integrations and responsibilities.
- Keep provider-specific logic separate from shared models, storage, and API endpoints.
- Reuse existing provider integrations before considering alternatives.
- Do not add, remove, or replace providers unless explicitly requested.

## Primary objective

Complete the requested task correctly with minimal unnecessary tool calls, file reads, code changes, and repeated analysis.

Optimize for focused execution, not exhaustive exploration. Correctness takes priority over minimizing tool usage.

## Before making changes

1. Read this file and the user's task.
2. Inspect only files relevant to the requested change.
3. Use targeted searches instead of reading entire directories.
4. Reuse existing patterns and utilities.
5. Do not research external documentation unless necessary.
6. Do not investigate unrelated issues.
7. Ask for clarification when requirements are ambiguous and
   different interpretations could materially affect functionality,
   architecture, data integrity, or the expected outcome.
   Make reasonable assumptions for minor implementation details.
   State any significant assumptions before proceeding.

## Scope control

- Implement only the requested functionality.
- Avoid unrelated refactoring.
- Do not add speculative features or dependencies.
- Do not modify unrelated files.
- Prefer simple solutions over new abstractions.
- Preserve existing public APIs unless changes are requested.
- Do not repeatedly inspect unchanged files.

## Backend conventions

- Follow existing FastAPI and SQLAlchemy patterns.
- Keep parks as static location data.
- Store forecasts and observations separately.
- Preserve forecast generation and fetched_at information.
- Preserve forecast history and retention behavior.
- Store measured water temperatures as observations,
  preserving their source, measurement location, and timestamp.
- Keep measured and forecasted water temperatures distinct.
- Use Alembic for database schema changes.
- Never use day-specific weather columns.
- Never apply database migrations without explicit authorization.
- Never modify production data without explicit authorization.

## Testing

- Run targeted tests for changed functionality.
- For backend code changes, run the full suite once before completion:
  `cd backend && python -m pytest -v -ra`
- Skip tests for documentation-only changes.
- Do not repeatedly run the full suite without a reason.
- Add tests for changed behavior and meaningful regressions.
- Do not add redundant tests merely to increase coverage.
- If unrelated or pre-existing tests fail, report them rather
  than expanding the task scope without authorization.
- Never run destructive operations against development or production databases.
- Database tests must use wakecast_test.

## Git workflow

- GitHub access is read-only by default.
- Do not push, merge, create or modify pull requests,
  issues, branches, or other remote resources unless
  explicitly authorized for the specific task.
- Local code changes, file edits, and test execution
  are allowed within the requested task scope.
- Never modify the main branch directly.
- Create a dedicated feature branch for code changes.
- Do not switch or create branches for read-only tasks.
- Never merge into main without explicit authorization.
- Do not create local commits unless explicitly requested.
- Authorization for one task does not carry over to others.
- Keep changes small and reviewable.
- Do not modify unrelated working-tree changes.
- Never force-push or discard existing changes without
  explicit authorization.
- These Git restrictions apply to AI agents, not to
  Git operations performed directly by the user.

## Communication

- Keep responses concise.
- Summarize changed files and test results.
- Report blockers and remaining risks.
- Avoid lengthy explanations of routine operations.
- Do not repeat unchanged project context, except the active checklist.
- Never claim tests passed unless they were executed.

## Task checklists

- Treat user-provided checklists as the source of truth
  for task scope and progress.
- Follow checklist items in their specified order unless
  dependencies or explicit instructions require otherwise.
- Preserve existing checklist items and their completion status.
- Mark items complete only after implementation and
  relevant verification.
- Do not repeat work on already completed items unless necessary.
- Do not add unrelated tasks or expand the checklist scope
  without authorization.
- Start every response with the full active checklist,
  preserving its original order and completion status.
- Always display completed, current, and remaining items.
- Do not shorten, summarize, or omit checklist items
  unless explicitly requested.
- For multi-session tasks, use the designated project checklist
  file as the progress reference, if one exists.
- Update that file only when the task authorizes file changes.
- Never claim a checklist is complete while required
  items remain unfinished.

## Completion

Stop when:
1. The requested functionality is implemented.
2. Relevant tests pass.
3. The changes have been summarized.

Do not start another task without authorization.
