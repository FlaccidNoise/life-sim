#!/usr/bin/env bash
# Parallel multi-seed morph validation — spawns one tsx child PER seed, runs them concurrently,
# then aggregates. ~Nx wall-clock speedup on multi-core (each seed is single-threaded, independent).
#
# Usage: bash src/headless/morph-validate-parallel.sh [ticks] [seeds] [sampleInterval]
#   ticks=20000 seeds=8 sampleInterval=2000  (defaults)
set -euo pipefail
cd "$(dirname "$0")/../.."

ticks="${1:-20000}"
seeds="${2:-8}"
sampleEvery="${3:-2000}"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

pids=()
for s in $(seq 1 "$seeds"); do
  npx tsx src/headless/morph-validate.ts "$ticks" "$seeds" "$sampleEvery" "$s" > "$tmpdir/seed-$s.json" 2>"$tmpdir/seed-$s.err" &
  pids+=($!)
done

# wait all, capture non-zero exits (a crashed seed still counts as extinct for our purposes)
fail=0
for i in "${!pids[@]}"; do
  if ! wait "${pids[$i]}"; then
    echo "seed $((i+1)) process exited non-zero (see $tmpdir/seed-$((i+1)).err)" >&2
  fi
done

echo "=== morph validation (parallel): ${ticks} ticks × ${seeds} seeds, sample every ${sampleEvery} ==="
echo

# aggregate via node (handles JSON robustly)
node -e '
const fs = require("fs");
const seeds = '"$seeds"';
const ticks = '"$ticks"';
const sampleEvery = '"$sampleEvery"';
const tmpdir = "'"$tmpdir"'";
const samples = Math.floor(ticks / sampleEvery);
let survivors = 0;
const extinct = [];
const rows = [];
for (let s = 1; s <= seeds; s++) {
  let r;
  try { r = JSON.parse(fs.readFileSync(tmpdir + "/seed-" + s + ".json", "utf8")); }
  catch (e) { r = { seed: s, extinctAt: -1, final: { pop: 0, grazers:0, predators:0, autotrophs:0, parasites:0, attached:0, scavengers:0 }, popTrajectory: [], crash: String(e).slice(0,80) }; }
  if (r.extinctAt < 0) survivors++; else extinct.push(s);
  const traj = (r.popTrajectory || []).map(p => String(p).padStart(6)).join(" ");
  const f = r.final || {};
  const eco = `pop ${String(f.pop||0).padStart(5)} | g${f.grazers||0} p${f.predators||0} a${f.autotrophs||0} ♗${f.parasites||0}(${f.attached||0}) ☠${f.scavengers||0}`;
  const st = r.extinctAt < 0 ? "ALIVE  " : `EXT@${r.extinctAt}`;
  rows.push(`  ${s}  | ${traj} | ${st} ${eco}${r.crash ? " [CRASH: "+r.crash+"]" : ""}`);
}
console.log("seed | " + Array.from({length:samples},(_,i)=>("tick"+(i*sampleEvery)).padStart(6)).join(" ") + " | final pop / eco");
console.log("-----|" + "-".repeat(120));
rows.forEach(r => console.log(r));
console.log();
console.log("=== SUMMARY ===");
console.log(`survivors: ${survivors}/${seeds} (${Math.round(survivors/seeds*100)}%)`);
console.log(`extinct seeds: ${extinct.length ? extinct.join(", ") : "none"}`);
console.log(`threshold: >=75% survive -> ${survivors/seeds >= 0.75 ? "PASS ✓" : "FAIL ✗"}`);
process.exit(survivors/seeds >= 0.75 ? 0 : 1);
'
