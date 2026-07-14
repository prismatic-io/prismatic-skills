#!/usr/bin/env bash
# Link a built Lux checkout into this eval suite.
#
# Usage:
#   LUX_DIR=/path/to/lux evals/scripts/link-lux.sh
# Defaults LUX_DIR to a sibling checkout: <parent-of-prismatic-skills>/lux
#
# Run `bun install && bun run build` in the Lux checkout first.
set -euo pipefail

EVALS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LUX_DIR="${LUX_DIR:-$(cd "$EVALS_DIR/../.." && pwd)/lux}"

if [ ! -d "$LUX_DIR/packages/lux" ]; then
  echo "error: no lux checkout at $LUX_DIR (set LUX_DIR=/path/to/lux)" >&2
  exit 1
fi
if [ ! -f "$LUX_DIR/packages/lux/lib/cli/bin.js" ]; then
  echo "error: lux is not built — run 'bun install && bun run build' in $LUX_DIR" >&2
  exit 1
fi

NM="$EVALS_DIR/node_modules/@prismatic-io"
mkdir -p "$NM"
ln -sfn "$LUX_DIR/packages/lux" "$NM/lux"

# A raw symlink to a built lib doesn't carry the executable bit npm would set
# on a published bin; set it ourselves so `.bin/lux` is directly runnable.
chmod +x "$LUX_DIR/packages/lux/lib/cli/bin.js"

mkdir -p "$EVALS_DIR/node_modules/.bin"
ln -sfn "$LUX_DIR/packages/lux/lib/cli/bin.js" "$EVALS_DIR/node_modules/.bin/lux"

echo "linked @prismatic-io/lux from $LUX_DIR into $EVALS_DIR/node_modules/@prismatic-io"
