#!/usr/bin/env bash
# Auto-commit and push HireFlow changes to GitHub (run by a Claude Code Stop hook).
# Safe by design: refuses to push if anything that looks like a secret is staged.
cd "$(dirname "$0")/.." || exit 0
[ -d .git ] || exit 0

# Never auto-push to main (main = live site on Vercel). Work happens on dev; main is merged by hand.
[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] && { echo '{"systemMessage":"Auto-sync skipped: on main. Switch to dev (git checkout dev)."}'; exit 0; }

git add -A
if git diff --cached --quiet; then     # nothing new — just retry any unpushed commits
  [ -n "$(git log @{u}..HEAD --oneline 2>/dev/null)" ] && git push -q origin HEAD >/dev/null 2>&1
  exit 0
fi

# Secret guard — the GitHub repo is PUBLIC.
bad_files=$(git diff --cached --name-only | grep -E '(^|/)\.env($|\.)' | grep -v '\.env\.example$')
added=$(git diff --cached -U0 -- . ':!.claude/autosync.sh' | grep -E '^\+' | grep -v 'YOUR-PASSWORD')
bad_text=$(printf '%s\n' "$added" | grep -E 'sk-ant-[a-z]{3}|rzp_live_|rzp_test_[A-Za-z0-9]{8}|gh[op]_[A-Za-z0-9]{20}|postgres(ql)?://[^:/]+:[^@:]{6,}@[^l1]')
rc=$?   # 0 = secret found, 1 = clean, 2 = grep error -> fail closed
if [ -n "$bad_files" ] || [ "$rc" -ne 1 ]; then
  git reset -q
  echo '{"systemMessage":"Auto-sync BLOCKED: a secret was about to be committed. Nothing was pushed."}'
  exit 0
fi

files=$(git diff --cached --name-only | head -5 | tr '\n' ' ')
count=$(git diff --cached --name-only | wc -l | tr -d ' ')
git -c user.name="Aryan Sehgal" -c user.email="aryansehgal101@gmail.com" \
  commit -q -m "Update ${count} file(s): ${files}" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"

if git push -q origin HEAD 2>/dev/null; then
  echo "{\"systemMessage\":\"Synced ${count} file(s) to GitHub\"}"
else
  echo '{"systemMessage":"Committed locally but push to GitHub failed (will retry next turn)."}'
  git push -q origin HEAD >/dev/null 2>&1 &
fi
exit 0
