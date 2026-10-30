// Run: npx tsx src/lib/rulebook.test.ts
import assert from "node:assert";
import { advise, shouldAnnounce, cropByKey, moistureBand, type Reading, type Verdict } from "./rulebook";

let passed = 0;
function check(cond: boolean, msg: string): void {
  assert.ok(cond, msg);
  passed += 1;
}

const paddy = cropByKey("paddy");
const wheat = cropByKey("wheat");

// Unknown or stale crop keys fall back to the generic "other" entry, not a random crop.
check(cropByKey("rice").key === "other", "unknown crop key falls back to other");
check(cropByKey("wheat").key === "wheat", "known crop key resolves");

// Dry paddy at flowering -> risk, worst flag is soil_dry.
{
  const band = moistureBand(paddy, "Flowering");
  const v = advise(paddy, "Flowering", { temp_c: 30, humidity: 60, moisture: band.dry - 20 });
  check(v.severity === "risk", "dry paddy at flowering is risk, got " + v.severity);
  check(v.flags.length > 0 && v.flags[0].id === "soil_dry", "worst flag is soil_dry");
}

// Comfortable wheat at vegetative -> ok, and never announced in auto mode.
{
  const v = advise(wheat, "Vegetative", { temp_c: 22, humidity: 55, moisture: 55 });
  check(v.severity === "ok", "comfortable wheat is ok, got " + v.severity);
  check(shouldAnnounce(null, v) === false, "an all-ok reading is never announced");
}

// Moisture exactly at the band edges is comfortable (strict < / > in the rulebook).
{
  const band = moistureBand(wheat, "Vegetative");
  const atDry = advise(wheat, "Vegetative", { temp_c: 22, humidity: 55, moisture: band.dry });
  const atWet = advise(wheat, "Vegetative", { temp_c: 22, humidity: 55, moisture: band.wet });
  check(!atDry.flags.some((f) => f.id === "soil_dry"), "moisture exactly at dry edge is not dry");
  check(!atWet.flags.some((f) => f.id === "waterlogged"), "moisture exactly at wet edge is not waterlogged");
}

// Temp over the crop heat ceiling at flowering -> heat-stress risk.
{
  const v = advise(wheat, "Flowering", { temp_c: wheat.heatCeiling + 3, humidity: 50, moisture: 55 });
  check(v.flags.some((f) => f.id === "heat" && f.severity === "risk"), "heat stress flagged at flowering over the ceiling");
}

// Cold: watch near frost, risk below 4 degrees.
{
  const warnish = advise(wheat, "Maturity", { temp_c: 6, humidity: 50, moisture: 40 });
  const frost = advise(wheat, "Maturity", { temp_c: 2, humidity: 50, moisture: 40 });
  check(warnish.flags.some((f) => f.id === "cold" && f.severity === "watch"), "cold at 6 is a watch");
  check(frost.flags.some((f) => f.id === "cold" && f.severity === "risk"), "frost below 4 is a risk");
}

// Paddy keeps standing water: too-wet paddy gets drain-excess advice, not "stop watering".
{
  const band = moistureBand(paddy, "Vegetative");
  const v = advise(paddy, "Vegetative", { temp_c: 30, humidity: 60, moisture: band.wet + 3 });
  const line = v.flags.find((f) => f.id === "waterlogged");
  check(!!line && /drain/i.test(line.en) && !/stop watering/i.test(line.en), "waterlogged paddy is told to drain, not to stop watering");
}

// shouldAnnounce: quiet on the same problem, speaks on a NEW problem.
{
  const dry: Verdict = advise(wheat, "Flowering", { temp_c: 25, humidity: 50, moisture: 10 });
  check(shouldAnnounce(dry, dry) === false, "same problem twice is not re-announced");
  const dryAndHot: Verdict = advise(wheat, "Flowering", { temp_c: wheat.heatCeiling + 2, humidity: 50, moisture: 10 });
  check(shouldAnnounce(dry, dryAndHot) === true, "a new problem (heat) is announced");
}

// shouldAnnounce: a problem that cleared and returned is heard again (the auto-mode fix).
{
  const dry: Verdict = advise(wheat, "Flowering", { temp_c: 25, humidity: 50, moisture: 10 });
  const ok: Verdict = advise(wheat, "Flowering", { temp_c: 25, humidity: 50, moisture: 55 });
  check(shouldAnnounce(dry, ok) === false, "clearing a problem is not announced");
  check(shouldAnnounce(ok, dry) === true, "the same problem returning after ok is announced again");
}

// shouldAnnounce: a watch that becomes a risk on the same flag is announced.
{
  const watch: Verdict = advise(wheat, "Maturity", { temp_c: 22, humidity: 50, moisture: 20 }); // soil_dry watch
  const risk: Verdict = advise(wheat, "Flowering", { temp_c: 22, humidity: 50, moisture: 20 }); // soil_dry risk
  check(watch.flags[0]?.severity === "watch" && risk.flags[0]?.severity === "risk", "same flag escalates watch -> risk across stages");
  check(shouldAnnounce(watch, risk) === true, "a watch escalating to a risk is announced");
}

// High humidity + warmth below the heat ceiling at flowering -> disease risk.
{
  const v = advise(wheat, "Flowering", { temp_c: 26, humidity: 90, moisture: 60 });
  check(v.flags.some((f) => f.id === "disease"), "fungal disease risk flagged in warm, very humid air");
}

console.log("rulebook: " + passed + " checks passed");
