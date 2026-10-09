#!/bin/bash
# Saves this job's logs to the community-build-logs branch so they can be read without the Actions page.
# Usage: ci-publish-logs.sh <job-name>
#   LOG_DEST     where in the branch to put them (default: run-<run number>/<job-name>)
#   LATEST_NOTE  what to write in LATEST-<job-name>.txt (default: the run, job and time)
# The typecheck workflow writes to typecheck/<commit> and keeps typecheck/LATEST.txt as the commit
# it last checked, which is how it knows not to check the same commit twice.
set -u
LOG_DIR="${LOG_DIR:-$RUNNER_TEMP/logs}"
JOB="$1"
DEST="${LOG_DEST:-run-$GITHUB_RUN_NUMBER/$JOB}"
NOTE="${LATEST_NOTE:-run-$GITHUB_RUN_NUMBER $JOB $(date -u +%FT%TZ)}"
REMOTE="https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
WORK="$RUNNER_TEMP/logrepo"
for attempt in 1 2 3; do
  rm -rf "$WORK"
  if ! git clone --quiet --depth 1 --branch community-build-logs "$REMOTE" "$WORK" 2>/dev/null; then
    mkdir -p "$WORK" && git -C "$WORK" init -q -b community-build-logs && git -C "$WORK" remote add origin "$REMOTE"
  fi
  mkdir -p "$WORK/$DEST"
  cp -R "$LOG_DIR"/. "$WORK/$DEST/" 2>/dev/null
  if [ "$JOB" = typecheck ]; then
    mkdir -p "$WORK/typecheck"
    echo "$NOTE" > "$WORK/typecheck/LATEST.txt"
  else
    echo "$NOTE" > "$WORK/LATEST-$JOB.txt"
  fi
  git -C "$WORK" add -A
  git -C "$WORK" -c user.name="community-ci" -c user.email="ci@users.noreply.github.com" commit -qm "Logs: $DEST" || true
  git -C "$WORK" push -q origin community-build-logs && exit 0
  sleep 5
done
exit 0
