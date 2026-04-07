#!/bin/zsh
source <(sed -n '/^claude-sandbox/,/^}/p' ~/.zshrc)
set -eo pipefail

if [ -z "$1" ] || [ -z "$2" ]; then
  echo "Usage: $0 <plan-and-prd> <iterations>"
  exit 1
fi

for ((i=1; i<=$2; i++)); do
  tmpfile=$(mktemp)
  trap "rm -f $tmpfile" EXIT

  echo "\n=== Iteration $i / $2 ==="
  commits=$(git log -n 5 --format="%H%n%ad%n%B---" --date=short 2>/dev/null || echo "No commits found")
  prompt=$(cat ralph/prompt.md)

  claude-sandbox \
    --dangerously-skip-permissions \
    --verbose \
    --print \
    --output-format stream-json \
    "Previous commits: $commits Plan and PRD: $1 $prompt" \
  < /dev/null 2>&1 \
  | grep --line-buffered '^{' \
  | tee "$tmpfile" \
  | jq --unbuffered -rj '
    if .type == "system" and .subtype == "init" then
      "[session \(.session_id)] model=\(.model)\n"
    elif .type == "assistant" then
      .message.content[]?
      | if .type == "text" then .text
        elif .type == "thinking" then "[thinking] \(.thinking[:200])...\n"
        elif .type == "tool_use" then "[\(.name)] \(.input | to_entries | map("\(.key)=\(.value | tostring | .[:100])") | join(" "))\n"
        else empty end
    elif .type == "user" then
      .message.content[]?
      | select(.type == "tool_result")
      | "  => \(.content | if type == "array" then .[0].text? // "" elif type == "string" then . else "" end | .[:200])\n"
    elif .type == "result" then
      "\n--- \(if .is_error then "ERROR" else "done" end) in \(.duration_ms / 1000 | round)s | cost $\(.total_cost_usd | . * 1000 | round | . / 1000) | \(.usage.output_tokens) output tokens ---\n"
    else empty end
  ' || true

  if grep -q "<promise>NO MORE TASKS</promise>" "$tmpfile"; then
    echo "Ralph complete after $i iterations."
    exit 0
  fi
done
