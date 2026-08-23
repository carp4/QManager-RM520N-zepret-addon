#!/bin/sh
# =============================================================================
# package-addon.sh — assemble the add-on payload tarball
# -----------------------------------------------------------------------------
# Stages addon/ (backend overlay + uninstaller + seeds) plus the built frontend
# (out/) into a release tarball, prints its sha256, and pins that hash into
# zepret-installer.sh.
#
# Run from repo root AFTER `bun run build`:
#   ./package-addon.sh [version]     # default v0.1.13-zepret.5-dev.1
# =============================================================================

set -eu

VERSION="${1:-v0.1.13-zepret.5-dev.1}"
TARBALL="qmanager-zepret-addon-${VERSION}.tar.gz"
STAGE="$(mktemp -d /tmp/zepret_pkg.XXXXXX)"
DIST="dist"

[ -d out ] || { echo "ERROR: out/ missing — run the frontend build first"; exit 1; }

mkdir -p "$STAGE/addon/usr/bin" \
         "$STAGE/addon/usr/lib/qmanager" \
         "$STAGE/addon/lib/systemd/system" \
         "$STAGE/addon/etc" \
         "$STAGE/addon/www/cgi-bin/quecmanager/network" \
         "$DIST"

# Backend overlay
cp scripts/usr/bin/qmanager_dpi_install scripts/usr/bin/qmanager_dpi_run scripts/usr/bin/qmanager_dpi_verify "$STAGE/addon/usr/bin/"
cp scripts/usr/lib/qmanager/dpi_state.sh scripts/usr/lib/qmanager/config.sh "$STAGE/addon/usr/lib/qmanager/"
cp scripts/usr/bin/qmanager_setup "$STAGE/addon/usr/bin/"
cp scripts/etc/systemd/system/qmanager-dpi.service \
   scripts/etc/systemd/system/qmanager-dpi-ensure.service \
   scripts/etc/systemd/system/qmanager-dpi-ensure.timer "$STAGE/addon/lib/systemd/system/"
cp addon/etc/sudoers-fragment.txt "$STAGE/addon/etc/"

# CGI + frontend export + uninstaller
cp scripts/www/cgi-bin/quecmanager/network/video_optimizer.sh "$STAGE/addon/www/cgi-bin/quecmanager/network/"
cp -r out "$STAGE/addon/out"
cp uninstall-zepret.sh "$STAGE/addon/uninstall-zepret.sh"
chmod 755 "$STAGE/addon/uninstall-zepret.sh" "$STAGE/addon/usr/bin/"*

# Default hostlist seed — extracted verbatim from our qmanager_setup heredoc
sed -n '/cat > "\$DPI_HOSTLIST"/,/^EOF$/p' scripts/usr/bin/qmanager_setup \
    | sed '1d;$d' > "$STAGE/addon/video_domains.txt"
[ "$(grep -c '^[a-z]' "$STAGE/addon/video_domains.txt")" -ge 20 ] \
    || { echo "ERROR: hostlist extraction looks wrong"; exit 1; }

tar -czf "$DIST/$TARBALL" -C "$STAGE" addon
rm -rf "$STAGE"

SUM="$(sha256sum "$DIST/$TARBALL" | awk '{print $1}')"
echo ""
echo "Packaged: $DIST/$TARBALL ($(du -h "$DIST/$TARBALL" | cut -f1))"
echo "sha256:   $SUM"

# Pin the hash into the installer so installs verify the download.
# (Only touches SHA256 — RELEASE_BASE must keep its ZEPRET_RELEASE_BASE
# env-override wrapper for offline/local staging.)
if grep -q '^SHA256=' zepret-installer.sh; then
    sed -i "s|^SHA256=.*|SHA256=\"$SUM\"|" zepret-installer.sh
    echo "Pinned sha256 into zepret-installer.sh"
fi

# Dev builds: commit the tarball onto the development branch so the dev
# one-liner (raw development installer) can fetch its payload with the same
# sha256 pin enforcement as a release install. Release builds (-dev absent)
# skip this — their payload lives in GitHub Releases instead.
case "$VERSION" in
    *-dev*)
        # dist/ is gitignored by convention; the dev payload is the one
        # deliberate exception tracked on this branch.
        git add zepret-installer.sh
        git add -f dist/"$TARBALL"
        git commit -m "package: ${TARBALL} for development-branch installs (sha ${SUM%%\ *})" \
            && echo "Committed payload to the branch — push 'development' to publish the dev build" \
            || echo "Nothing to commit (payload unchanged?)"
        ;;
esac
