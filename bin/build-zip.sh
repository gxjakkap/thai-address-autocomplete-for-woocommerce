#!/usr/bin/env bash
# Build dist/thai-address-autocomplete-for-woocommerce-<version>.zip (installable via Plugins → Add New → Upload).
set -euo pipefail
cd "$(dirname "$0")/.."
SLUG=thai-address-autocomplete-for-woocommerce
VERSION=$(sed -n 's/^ \* Version: *//p' "$SLUG.php")
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/$SLUG" dist
rsync -a --exclude-from=.distignore ./ "$STAGE/$SLUG/"
rm -f "dist/$SLUG-$VERSION.zip"
(cd "$STAGE" && zip -qr -X - "$SLUG") > "dist/$SLUG-$VERSION.zip"
echo "dist/$SLUG-$VERSION.zip"
