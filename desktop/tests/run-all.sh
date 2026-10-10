#!/bin/sh
# Every browser test on the demo build (each area keeps its own tests/<area>.test.cjs), then the
# wiring test on the wiring build. Usage: sh tests/run-all.sh http://127.0.0.1:8790/ http://127.0.0.1:8791/
DEMO=${1:-http://127.0.0.1:8790/}
WIRE=${2:-http://127.0.0.1:8791/}
status=0
for t in tests/*.test.cjs; do
  case "$t" in tests/wiring.test.cjs) continue ;; esac
  echo "== $t"
  node "$t" "$DEMO" || status=1
done
echo "== tests/wiring.test.cjs"
node tests/wiring.test.cjs "$WIRE" || status=1
exit $status
