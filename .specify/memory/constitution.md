<!--
Sync Impact Report
- Version change: none → 1.0.0 (initial ratification)
- Modified principles: none (no prior version; file was the unfilled scaffold)
- Added sections:
  - Core Principles I–V
  - Security & Runtime Constraints
  - Development Workflow & Quality Gates
  - Governance
- Removed sections: none
- Follow-up TODOs:
  - Principles were inferred from repository context (README.md, ergane.yaml,
    the gates workflow) because the command was invoked with no user input.
    They describe how this repository is actually built today; the operator
    should review and amend before they are treated as binding.
  - Principle II names `gates.test: 'true'` in ergane.yaml as a known defect.
    Closing it is a governance change and needs its own spec.
-->
# ergane-test Constitution

## Core Principles

### I. Spec-Derived Work (NON-NEGOTIABLE)

Every change MUST trace to a spec directory under `specs/`. An attempt MUST implement
what its spec asks for and MUST NOT add scope the spec does not name — no speculative
abstractions, no adjacent refactors, no "while I was here" edits.

When a spec is ambiguous or contradicts the codebase, the attempt MUST escalate through
the operator bridge rather than choose an interpretation silently. Rationale: this
repository has no human reviewing each diff before it lands, so an agent's guess becomes
the record unless it is forced into the open.

### II. Mechanical Verification

A gate MUST be a command capable of failing. Verification MUST be reproducible from a
clean checkout with no operator-local state.

`ergane.yaml` currently declares `gates.test: 'true'`, which passes unconditionally and
proves nothing. This is a known defect, recorded here so it cannot be mistaken for a
passing suite: **a green check from this gate is not evidence.** Any spec that adds
executable code MUST also replace or extend that gate with one that fails when the code
is wrong.

### III. Scoped, Reversible Change

An attempt MUST confine its writes to its own worktree and MUST honor its persona's
declared `write_scope` (`worktree`, `docs`, or `read`). A `read` persona that writes is
a violation, not a shortcut.

An attempt MUST NOT alter the merge queue ruleset, the gates workflow, the landing
branch, or `ergane.yaml` as a side effect of feature work. Those are governance surfaces;
changing them requires its own spec. Rationale: a node that can rewrite its own gates can
land anything.

### IV. Evidence Over Assertion

A claim that code works MUST be backed by a command that ran and the output it produced.
An attempt MUST report a failing gate as failing, and MUST report work it did not finish
as unfinished.

An attempt MUST NOT weaken, skip, delete, or narrow a test to turn a gate green. If a test
is genuinely wrong, the attempt MUST say so and escalate rather than edit it into
agreement. Rationale: the factory's only defense against fabricated success is that
failure is cheaper to report than to hide.

### V. One Story Per Landing

Each proposal MUST carry exactly one story, and its title MUST state that story, because
`ergane spec landed` reads the story out of the squashed subject line — a landing titled
from anything else is work the factory cannot see it did.

Landing is squash-only through the merge queue. Direct pushes to the landing branch are
refused by rule, and MUST NOT be worked around.

## Security & Runtime Constraints

No credential of any kind may be committed to this repository, encrypted or not.

Each attempt receives a model-constrained, TTL'd virtual key minted for that attempt
alone. That key MUST NOT be written to a file, echoed into a log, embedded in a commit,
or passed to a subprocess that records its arguments. Configuration MUST reference
secrets by environment-variable name, never by value.

Attempts run sandboxed under `bwrap` with a factory-owned per-node home. Code MUST NOT
depend on the operator's home directory, on state outside the worktree, or on network
access beyond the declared model gateway. Anything a build needs MUST be declared in the
repository.

## Development Workflow & Quality Gates

Specs live at `specs/<feature-dir>/spec.md` and declare `state` in frontmatter. Only a
spec with `state: ready` whose `depends_on_landed` edges are all satisfied may dispatch;
`draft` and `deferred` are deliberate holds, not oversights.

The path from spec to landed code is: derive a work graph, dispatch it, verify each
attempt mechanically, then land through the merge queue.

Every gate named in `ergane.yaml` MUST have a job of the same name in
`.github/workflows/ergane-gates.yml`, and the landing branch MUST require exactly those
checks — no more, no fewer. A gate the forge does not run is a gate that does not exist.

A node that cannot proceed MUST escalate and wait. It MUST NOT invent a decision that
belongs to the operator.

## Governance

This constitution supersedes other practice in this repository. Where a spec, a prompt,
or a habit disagrees with it, this document wins.

Amendments MUST land through the same merge queue as code, in a pull request that states
the version bump and its rationale. Versioning follows semantic versioning: MAJOR for a
principle removed or redefined incompatibly, MINOR for a principle or section added or
materially expanded, PATCH for clarification and wording.

Every proposal is reviewed against these principles. A proposal that violates one MUST be
rejected, or this constitution MUST be amended first — a violation is never granted a
silent exception. Complexity MUST be justified against the spec that asked for it.

**Version**: 1.0.0 | **Ratified**: 2026-08-18 | **Last Amended**: 2026-08-18
