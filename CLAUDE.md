# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A target repository for [Ergane](https://github.com/bryantharpeorg/ergane), an agentic
software factory. There is no application code yet — the repository currently holds its
own governance and build machinery. Work arrives as a spec, is compiled into a work graph,
dispatched to headless agents in isolated git worktrees, verified mechanically, and landed
through a GitHub merge queue with no human approving the diff.

## This file has two audiences

It is committed, so it is loaded both by an **operator session** on the host and by every
**dispatched node** Ergane runs inside a worktree of this repo. Sections below are marked
`[operator]` where they describe host machinery a sandboxed node cannot reach — a node has
a factory-owned `HOME`, no Docker, and no access to the operator's filesystem.

**The constitution governs, not this file.** `.specify/memory/constitution.md` is injected
into every node's prompt via the `standards` key in `ergane.yaml`. This file is
orientation; the constitution is binding. Where they disagree, the constitution wins.

## Landing discipline

Applies to everyone, operator and node alike.

- **Direct pushes to `main` are refused** by repository ruleset (`GH013 ... Changes must be
  made through the merge queue`). Every change goes through a PR.
- **Squash-only, and the PR title becomes the commit subject.** `ergane spec landed` reads
  the story out of that subject line, so a vague title is work the factory cannot see it
  did. One story per PR.
- **Every gate in `ergane.yaml` must have a job of the same name** in
  `.github/workflows/ergane-gates.yml`, and the landing branch must require exactly those
  checks. A gate the forge does not run does not exist.
- The merge queue re-runs the gates on a `merge_group` event after the PR checks pass, so
  expect two workflow runs per landing.

### The gate, and what it does not cover

`gates: {test: bash scripts/gate.sh}`. It checks Python syntax, runs `unittest discover`
when a `tests/` directory exists, and greps `src/` for the negative requirements spec 001
phrased as searches — no password input, no user table, no login route, no currency
selection, no remote script or stylesheet.

Everything in it is shell or stdlib Python **because it has to run in two places**: the
`test` job on GitHub, and the node's bwrap worktree, which has `/usr` read-only and no
network. Nothing can be installed there, so a gate needing pytest or FastAPI would fail
every attempt for a reason unrelated to the diff.

It is a floor, not proof. The acceptance scenarios are scored by the judge against
criteria snapshotted out of `spec.md`; the gate catches what prose-reading cannot. On a
tree with no `src/` every check is vacuous and passes — that is a gate finding nothing to
verify, not a gate verifying nothing is wrong.

## Specs: two status conventions that do not talk to each other

This is the most common way to be confused here.

- **Ergane** reads YAML frontmatter at the top of `specs/<dir>/spec.md`: `state:`
  (`draft` | `ready` | `deferred` | `landed`) and `depends_on_landed: [...]`. A spec with
  **no frontmatter reads as `draft`** and will never dispatch.
- **Spec Kit** writes `**Status**: Draft` as ordinary prose in the document body. Ergane
  does not read it. Editing that line changes nothing.

Only `state: ready` with all `depends_on_landed` edges satisfied will dispatch. Check what
Ergane actually sees rather than trusting the document:

```bash
ergane spec list specs        # e.g. "001-trip-expenses  draft"
```

Promote with real frontmatter, or `ergane roadmap promote`.

**The roadmap scheduler reads the local working tree**, not the pushed branch, on a 300s
timer. An uncommitted spec marked `ready` is live to the factory immediately.


## Commands

`[operator]` Load the environment first — every `ergane` command needs it:

```bash
eval "$(~/.config/ergane/ergane-env.sh)"
```

`[operator]` Health, in the order worth checking:

```bash
ergane install --verify      # 6 control-plane probes (host, llm, temporal, memory, telemetry, escalation)
ergane init --check          # 11 per-repo readiness checks; writes nothing
ergane status                # what the floor is doing
ergane findings list         # open defects
ergane escalations           # what is waiting on you
systemctl --user status ergane-worker ergane-bridge temporal-dev
~/code/litellm/up.sh ps      # gateway; use up.sh, NOT bare docker compose
~/code/litellm/smoke.sh      # walks every proxy endpoint Ergane calls
```

`[operator]` Dispatching by hand, when you do not want to wait for the scheduler:

```bash
ergane spec validate <spec-dir>
ergane spec derive <spec-dir> --target-repo "$PWD" -o graph.json
ergane build start graph.json
ergane build status <epic-id>
```

There is no build, lint, or test toolchain in this repository yet — the only declared gate
is a no-op. When code arrives, its gate command belongs in `ergane.yaml` and its job in the
gates workflow; nothing else runs in CI.

## Layout worth knowing

- **`.ergane/`** — gitignored runtime root holding worktrees, session transcripts and
  verification evidence. Never commit it; it lands megabytes of agent output on a branch.
- **`.claude/skills/`** — 10 Spec Kit skills, committed deliberately. Project-scoped skills
  are visible to dispatched nodes because worktrees carry committed files; skills in the
  operator's `~/.claude` are **not**, because the sandbox exposes no operator home.
- **`.specify/`** — Spec Kit templates, scripts and `memory/constitution.md`.
  `.specify/feature.json` is machine-local and gitignored.
- **`specs/<feature>/spec.md`** — the corpus the roadmap scheduler walks. A directory
  without a `spec.md` is skipped, not an error.

## `[operator]` Host machinery outside this repo

- **Gateway** — `~/code/litellm`. LiteLLM + Postgres on `127.0.0.1:4000`. The database is
  not optional: Ergane mints a model-constrained, TTL'd virtual key per attempt and reads
  `/spend/logs/v2`. Drive it with `./up.sh`, since there is no `.env` beside the compose
  file by design.
- **Secrets** — `~/.config/ergane/litellm.env` (provider keys, container-only) and
  `worker.env` (Telegram), both mode 600, outside any git repo. `ergane-env.sh` emits
  export lines and deliberately does not export provider keys to the worker.
- **Model aliases** — `personas.yaml` is the only place a model name may appear, and it
  ships **inside the uv tool venv**
  (`~/.local/share/uv/tools/ergane-cli/.../factory/personas.yaml`).
  `uv tool upgrade ergane-cli` silently overwrites edits there. `ergane install --verify`
  completes a 1-token completion against every `model` and `fallback` in it.
