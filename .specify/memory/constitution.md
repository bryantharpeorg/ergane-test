<!--
Sync Impact Report
- Version change: 1.0.0 → 1.1.0 (Principle II's known defect closed)
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
  - CLOSED at 1.1.0: `gates.test` is now `bash scripts/gate.sh`, a command that
    fails on unparseable Python, on a failing stdlib test suite, and on the
    negative requirements spec 001 phrases as searches of the source tree.
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

`ergane.yaml` declares `gates.test: bash scripts/gate.sh`. Until 1.1.0 it declared the
`true` builtin, which passed unconditionally; that defect is closed.

A gate MUST run identically in the node's bwrap worktree and in the `test` job of the
gates workflow, which means it MUST NOT require network access or an installed package —
nothing can be installed inside the gate boundary. A gate MUST NOT be widened to pass:
narrowing a check, excluding a path, or deleting an audit to turn it green is the
violation Principle IV names.

The gate is a floor, not proof. Acceptance scenarios are scored separately, by the judge,
against the criteria snapshotted from `spec.md`. A gate that passes on a tree containing
none of the code it checks has verified nothing yet — it has only found nothing to
verify.

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

**Version**: 1.1.0 | **Ratified**: 2026-08-18 | **Last Amended**: 2026-08-19
