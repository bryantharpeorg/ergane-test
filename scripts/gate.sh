#!/usr/bin/env bash
# The `test` gate: the deterministic floor every node's diff has to clear.
#
# Constitution Principle II requires that any change adding executable code be
# verified by a gate that *can fail*. This replaces `gates: {test: 'true'}`,
# which reported PASS because the check existed, not because it checked.
#
# Two environments run this file and both constrain it:
#
#   - Ergane runs it inside the node's bwrap worktree, with `--ro-bind /usr` and
#     no network. `pip install` cannot succeed there, so every check below is
#     shell, git, or the Python standard library. A gate that needed FastAPI
#     importable would fail every attempt for a reason unrelated to the diff.
#   - GitHub Actions runs the same command as the `test` job, because the merge
#     queue requires a check named after each declared gate.
#
# This is a floor, not proof. Ergane verifies each node twice — these gates, and
# an LLM judge scoring the diff against the acceptance scenarios snapshotted out
# of spec.md. The gate's job is what a judge reading prose cannot do reliably:
# catch code that does not parse, and enforce the negative requirements the spec
# itself phrased as a search of the source tree.
#
# On an empty tree every check below is vacuous and this exits 0. That is
# correct and it is also the whole reason the checks are written against `src/`
# rather than the repository root: the moment US1 lands an application, they
# have something to bite on.
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
step() { printf '\n== %s\n' "$1"; }
ok()   { printf '   PASS %s\n' "$1"; }
bad()  { printf '   FAIL %s\n' "$1"; fail=1; }

step "python syntax"
# Bytecode goes outside the tree: this gate runs inside the worktree an agent
# is judged on, and a check that writes files into the diff it is checking has
# changed the thing it was measuring. us1 committed four .pyc files before this
# line existed.
export PYTHONPYCACHEPREFIX="${TMPDIR:-/tmp}/ergane-gate-pycache"
mapfile -t pyfiles < <(find . -name '*.py' -not -path './.git/*' | sort)
if [ ${#pyfiles[@]} -eq 0 ]; then
  ok "no python in the tree yet"
elif python3 -m compileall -q "${pyfiles[@]}"; then
  ok "${#pyfiles[@]} file(s) compile"
else
  bad "at least one file does not parse"
fi

step "unit tests"
# The stdlib runner, deliberately: pytest cannot be installed inside the gate
# boundary, so a suite that needs it would be unrunnable where it matters most.
if [ -d tests ]; then
  if python3 -m unittest discover -s tests -t . -v; then
    ok "unittest discover passed"
  else
    bad "unittest discover failed"
  fi
else
  ok "no tests/ directory yet"
fi

# --- the spec's own negative requirements, as searches (001 SC-007, SC-008) ---
#
# Scoped to src/ because that is what "the delivered source tree" means. The
# specs themselves are full of the words below — they are where the prohibition
# is written down — so scanning the repository root would fail on its own rules.
audit() { # <label> <extended-regex> [path-glob]
  local label="$1" pattern="$2" glob="${3:-*}" hits
  [ -d src ] || { ok "$label (no src/ yet)"; return; }
  hits=$(grep -rInE --include="$glob" -- "$pattern" src 2>/dev/null)
  if [ -n "$hits" ]; then
    bad "$label"
    printf '        %s\n' "$hits"
  else
    ok "$label"
  fi
}

step "FR-020 — no authentication in any form"
audit "no password input"        '<input[^>]*type=["'"'"']password'
audit "no user/account/session table" 'CREATE[[:space:]]+TABLE[^(]*\b(users?|accounts?|sessions?)\b'
audit "no login or logout route" '["'"'"']/(login|logout|signin|signup)\b'

step "FR-010 — United States dollars, and only dollars"
audit "no currency selection" '\bcurrenc(y|ies)\b'

step "FR-021 — local only, nothing fetched at run time"
audit "no remote script or stylesheet" '(src|href)=["'"'"']https?://'
audit "no runtime egress from the frontend" '\b(fetch|XMLHttpRequest|WebSocket)\(["'"'"']https?://' '*.js'

printf '\n'
if [ $fail -eq 0 ]; then printf 'gate: PASS\n'; else printf 'gate: FAIL\n'; fi
exit $fail
