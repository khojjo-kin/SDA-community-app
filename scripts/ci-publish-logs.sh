#!/bin/bash
# Saves this job's logs to the community-build-logs branch so they can be read without the Actions page.
# Usage: ci-publish-logs.sh <job-name>
set -u
LOG_DIR="${LOG_DIR:-$RUNNER_TEMP/logs}"
JOB="$1"
REMOTE="https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
WORK="$RUNNER_TEMP/logrepo"
for attempt in 1 2 3; do
  rm -rf "$WORK"
  if ! git clone --quiet --depth 1 --branch community-build-logs "$REMOTE" "$WORK" 2>/dev/null; then
    mkdir -p "$WORK" && git -C "$WORK" init -q -b community-build-logs && git -C "$WORK" remote add origin "$REMOTE"
  fi
  mkdir -p "$WORK/run-$GITHUB_RUN_NUMBER/$JOB"
  cp -R "$LOG_DIR"/. "$WORK/run-$GITHUB_RUN_NUMBER/$JOB/" 2>/dev/null
  echo "run-$GITHUB_RUN_NUMBER $JOB $(date -u +%FT%TZ)" > "$WORK/LATEST-$JOB.txt"
  git -C "$WORK" add -A
  git -C "$WORK" -c user.name="community-ci" -c user.email="ci@users.noreply.github.com" commit -qm "Logs: run $GITHUB_RUN_NUMBER $JOB" || true
  git -C "$WORK" push -q origin community-build-logs && exit 0
  sleep 5
done
exit 0
