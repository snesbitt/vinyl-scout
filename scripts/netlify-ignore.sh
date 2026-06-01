#!/usr/bin/env bash
# netlify-ignore.sh — decide whether a push is worth a (15-credit) deploy.
#
# Netlify ignore-command contract:
#   exit 0   => SKIP the deploy (nothing user-facing changed)
#   exit !=0 => RUN the deploy
#
# Vinyl Scout is a no-build static site (netlify.toml: publish=".", no build
# command), so the SERVED files are exactly what's in the repo:
#   *.html        pages (index, about, audit, roadmap, seed)
#   *.js          app.js and any other browser/function JS
#   *.css         style.css
#   covers/**     album-cover image assets the pages reference
#   netlify/**    Netlify Functions
#   netlify.toml, robots.txt, package.json/package-lock.json
# Doc/dev-only churn skips the deploy: *.md, .gitignore, scripts/, backups/.
#
# JUDGMENT CALL: backups/ is treated as NOT served, so a backups-only commit
# skips the deploy. If backups/ is live data your site or functions read at
# runtime, change the ':(exclude)backups' line below to just  backups  so
# changes there trigger a deploy instead.
#
# Referenced from netlify.toml:  [build] ignore = "bash scripts/netlify-ignore.sh"

set -u

# No previous build to diff against (first build, cache cleared) -> build, to be safe.
if [ -z "${CACHED_COMMIT_REF:-}" ]; then
  echo "netlify-ignore: no cached commit ref; building."
  exit 1
fi

# git diff --quiet exits 0 when the listed paths are unchanged (-> skip),
# non-zero when they changed or refs can't be compared (-> build).
if git diff --quiet "$CACHED_COMMIT_REF" "$COMMIT_REF" -- \
  '*.html' \
  '*.js' \
  '*.css' \
  covers \
  netlify \
  netlify.toml \
  robots.txt \
  package.json package-lock.json \
  ':(exclude)backups'
then
  echo "netlify-ignore: no user-facing changes; skipping deploy."
  exit 0
else
  echo "netlify-ignore: user-facing changes detected; building."
  exit 1
fi
