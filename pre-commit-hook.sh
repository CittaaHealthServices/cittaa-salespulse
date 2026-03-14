#!/bin/sh
# Cittaa SalesPulse — git pre-commit safety hook
# Blocks commits that accidentally delete too many files

DELETED=$(git diff --cached --name-only --diff-filter=D | wc -l | tr -d ' ')
ADDED=$(git diff --cached --name-only --diff-filter=A | wc -l | tr -d ' ')
MODIFIED=$(git diff --cached --name-only --diff-filter=M | wc -l | tr -d ' ')

if [ "$DELETED" -gt 5 ]; then
  echo ""
  echo "🚨 SAFETY BLOCK: This commit would DELETE $DELETED files!"
  echo ""
  echo "Files being deleted:"
  git diff --cached --name-only --diff-filter=D | head -20
  if [ "$DELETED" -gt 20 ]; then
    echo "  ... and $(($DELETED - 20)) more"
  fi
  echo ""
  echo "This is almost certainly a mistake."
  echo ""
  echo "To fix: run  git reset HEAD  to unstage everything"
  echo "Then:    git add <only the files you meant to change>"
  echo ""
  echo "If you REALLY want to delete these files, bypass with:"
  echo "  git commit --no-verify -m \"your message\""
  echo ""
  exit 1
fi

exit 0
