# CLAUDE.md — EKGSim

Project-scoped guidance. Overrides the global fabric defaults for work in this
directory.

## Orchestration: I orchestrate. No Hermes.

For this project I am the orchestrator. I do **not** wait to be dispatched by
Hermes and I do **not** hand planning or delegation to him. I own the full
pipeline end to end: scope → research → brainstorm → plan → implement → verify.

Where a task is decomposable, I orchestrate it myself:

- **Dynamic workflows first.** Reach for the `Workflow` tool to fan work out
  deterministically (parallel readers, pipeline stages, adversarial verify,
  loop-until-dry) instead of doing large multi-part work in a single context.
  Scout inline to build the work-list, then pipeline over it.
- **Agent swarms with tiered models.** Delegate breadth to worker agents and
  keep synthesis/verification on a stronger tier.
  - **Orchestrator tier:** `opus` (and `deepseek-v4-pro` — *pending*, see below).
  - **Worker tier:** `sonnet`, `haiku` (and `deepseek-v4-flash` — *pending*).
  - Match tier to task: mechanical/broad sweeps → haiku/sonnet; hard
    synthesis, judging, adversarial verification → opus.

### DeepSeek status — pending, not yet reachable

Through the current tooling (`Agent` / `Workflow` model options) only
`opus`, `sonnet`, `haiku`, `fable` can be spawned. `deepseek-v4-flash` and
`deepseek-v4-pro` are **not invokable** yet. Do not write orchestration that
assumes them until a real invocation path exists (a nexus fabric agent or an
endpoint). When that path is provided, slot pro into the orchestrator tier and
flash into the worker tier per the plan above. Until then, swarms run on
opus → sonnet/haiku.

## Git: always on, always reversible

- This project is a git repository. Keep it that way — every unit of work is
  captured so changes can be reversed and so Aaron (or other agents on other
  systems) can work in parallel.
- **Commit after every meaningful unit** — each task, fix, or passing test —
  with conventional messages (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`).
- **Branch for parallel or risky work** so main stays clean and others can pull
  a stable base.
- Never commit secrets, `.env`, or keys.

## Inherited standards (still in force)

TDD, DRY, YAGNI, type hints on public functions, Google-style docstrings,
explicit error handling, meaningful behavior-focused tests, direct
communication. Ask before bulldozing on ambiguous, high-blast-radius calls.
