#!/usr/bin/env bash
# Extract Claude Code OAuth credentials from macOS Keychain into .env.claude
# for Docker container authentication. Called automatically by `make start`/`make up`.
#
# On non-macOS or when no Keychain entry exists, exits silently (no .env.claude written).
set -euo pipefail

ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env.claude"

# Only works on macOS with the `security` CLI
if ! command -v security &>/dev/null; then
    exit 0
fi

RAW=$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null) || exit 0

python3 -c "
import json, sys

data = json.loads(sys.argv[1])
oauth = data.get('claudeAiOauth')
if not oauth or 'accessToken' not in oauth:
    sys.exit(0)

lines = [
    f'CLAUDE_CODE_OAUTH_TOKEN={oauth[\"accessToken\"]}',
    f'CLAUDE_CODE_OAUTH_REFRESH_TOKEN={oauth[\"refreshToken\"]}',
    f'CLAUDE_CODE_OAUTH_SCOPES={\",\".join(oauth.get(\"scopes\", []))}',
]
print('\n'.join(lines))
" "$RAW" > "$ENV_FILE"
