/**
 * FRIDAY box rulebook — the brain of the Panchayat Box, ported to the browser.
 *
 * Mirrors the real device pipeline (FRIDAY_Product_Models.md sections 2.3, 3.3):
 *   reading  ->  rules (truth)  ->  severity + warm advice  ->  neighbour voice
 * On the Pi this is advice/rules.py -> advisor.py -> persona.py, re-worded by a
 * small local LLM and spoken by Piper. Here the rules and the warm advice live
 * in this one file; the neighbour rewording is persona() templates.
 *
 * HONESTY NOTE: the exact threshold numbers and Hindi strings live in the Pi
 * rules.py (on a drive not present on this laptop). The thresholds below are a
 * documented demo stand-in with the SAME STRUCTURE, derived from the crop table
 * and heat thresholds in the mobile app (src/lib/agronomy.ts) and the severity
 * deltas in src/lib/health.ts. Swap this one table for the real rules.py numbers
 * when available — nothing else needs to change.
 */

export type Locale = "hi" | "en";

/** The canonical sensor line the Arduino-to-ESP32 emits (FRIDAY doc section 2.2). */
export type Reading = { temp_c: number; humidity: number; moisture: number };

export type Severity = "ok" | "watch" | "risk";

/** Five growth stages, from src/lib/agronomy.ts. */
export const STAGES = ["Germination", "Seedling", "Vegetative", "Flowering", "Maturity"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, { hi: string; en: string }> = {
  Germination: { hi: "अंकुरण", en: "Germination" },
  Seedling: { hi: "पौध", en: "Seedling" },
  Vegetative: { hi: "बढ़वार", en: "Vegetative" },
  Flowering: { hi: "फूल", en: "Flowering" },
  Maturity: { hi: "पकाई", en: "Maturity" },
};

export type Crop = {
  key: string;
  hi: string;
  en: string;
  /** Short name for speech (no bracketed gloss). */
  short: string;
  /** Needs standing or plentiful water (paddy, sugarcane): raises the moisture floor. */
  waterHeavy: boolean;
  /** Celsius at or above which heat stress begins — from agronomy.ts heatThreshold. */
  heatCeiling: number;
};

/** Demo subset of the app CROP_TABLE (src/lib/agronomy.ts). "other" = generic fallback. */
export const CROPS: Crop[] = [
  { key: "paddy", en: "Paddy (rice)", short: "Paddy", hi: "धान", waterHeavy: true, heatCeiling: 37 },
  { key: "wheat", en: "Wheat", short: "Wheat", hi: "गेहूँ", waterHeavy: false, heatCeiling: 33 },
  { key: "maize", en: "Maize", short: "Maize", hi: "मक्का", waterHeavy: false, heatCeiling: 38 },
  { key: "cotton", en: "Cotton", short: "Cotton", hi: "कपास", waterHeavy: false, heatCeiling: 40 },
  { key: "tomato", en: "Tomato", short: "Tomato", hi: "टमाटर", waterHeavy: false, heatCeiling: 35 },
  { key: "onion", en: "Onion", short: "Onion", hi: "प्याज़", waterHeavy: false, heatCeiling: 36 },
  { key: "groundnut", en: "Groundnut", short: "Groundnut", hi: "मूँगफली", waterHeavy: false, heatCeiling: 38 },
  { key: "sugarcane", en: "Sugarcane", short: "Sugarcane", hi: "गन्ना", waterHeavy: true, heatCeiling: 40 },
  { key: "other", en: "Other crop", short: "The crop", hi: "फसल", waterHeavy: false, heatCeiling: 38 },
];

/** Resolves a crop key; an unknown or stale key becomes the generic "other" entry. */
export function cropByKey(key: string): Crop {
  return CROPS.find((c) => c.key === key) ?? CROPS.find((c) => c.key === "other")!;
}

export type FlagId = "soil_dry" | "waterlogged" | "heat" | "cold" | "disease";

export type Flag = {
  /** Stable id so shouldAnnounce() can tell a NEW or WORSE problem from a lingering one. */
  id: FlagId;
  severity: Severity;
  hi: string;
  en: string;
};

export type Verdict = {
  severity: Severity;
  flags: Flag[];
  /** One-line spoken summary when everything is fine. */
  okLine: { hi: string; en: string };
};

const RANK: Record<Severity, number> = { ok: 0, watch: 1, risk: 2 };
const worst = (a: Severity, b: Severity): Severity => (RANK[a] >= RANK[b] ? a : b);

/** A stage where the crop is actively growing or flowering, so stress hurts most (health.ts). */
function sensitive(stage: Stage): boolean {
  return stage === "Vegetative" || stage === "Flowering";
}

/**
 * The soil-moisture comfort band (percent), by crop and stage. THE tunable knob:
 * below `dry` the soil is too dry; above `wet` it is waterlogged. A Record keeps
 * every stage covered (no silent default) so adding a stage is a compile error.
 */
export function moistureBand(crop: Crop, stage: Stage): { dry: number; wet: number } {
  const base: Record<Stage, { dry: number; wet: number }> = crop.waterHeavy
    ? {
        Germination: { dry: 50, wet: 85 },
        Seedling: { dry: 50, wet: 85 },
        Vegetative: { dry: 55, wet: 95 },
        Flowering: { dry: 55, wet: 95 },
        Maturity: { dry: 40, wet: 80 },
      }
    : {
        Germination: { dry: 30, wet: 70 },
        Seedling: { dry: 30, wet: 70 },
        Vegetative: { dry: 35, wet: 75 },
        Flowering: { dry: 35, wet: 75 },
        Maturity: { dry: 25, wet: 65 },
      };
  const b = base[stage];
  return sensitive(stage) ? { dry: b.dry + 5, wet: b.wet } : { ...b };
}

/** Run the rulebook on one reading. Flags are ordered worst-first. */
export function advise(crop: Crop, stage: Stage, r: Reading): Verdict {
  const flags: Flag[] = [];
  const band = moistureBand(crop, stage);
  const sens = sensitive(stage);
  const cropHi = crop.hi;
  const cropEn = crop.short;

  // 1. Soil moisture.
  if (r.moisture < band.dry) {
    const bad = sens || r.moisture < band.dry - 15;
    flags.push({
      id: "soil_dry",
      severity: bad ? "risk" : "watch",
      hi: cropHi + " की मिट्टी सूखी है (" + Math.round(r.moisture) + "%). आज सिंचाई कर दो, थोड़ा-थोड़ा पानी दो।",
      en: "Soil is dry for " + cropEn + " (" + Math.round(r.moisture) + " percent). Water the field today, little and often.",
    });
  } else if (r.moisture > band.wet) {
    // Paddy and sugarcane want standing water, so "stop watering" is wrong for
    // them — only warn about pooling; drain-the-field advice is for the rest.
    const bad = r.moisture > band.wet + 8 && !crop.waterHeavy;
    flags.push({
      id: "waterlogged",
      severity: bad ? "risk" : "watch",
      hi: crop.waterHeavy
        ? "खेत में पानी बहुत भर गया है (" + Math.round(r.moisture) + "%). ज़रूरत से ज़्यादा पानी निकाल दो ताकि जड़ें साँस ले सकें।"
        : "खेत में पानी ज़्यादा है (" + Math.round(r.moisture) + "%). पानी रोक दो और निकास की नाली खोल दो।",
      en: crop.waterHeavy
        ? "Water has pooled deep (" + Math.round(r.moisture) + " percent). Let the excess drain so the roots can breathe."
        : "The field is too wet (" + Math.round(r.moisture) + " percent). Stop watering and open the drainage channel.",
    });
  }

  // 2. Heat stress (health.ts: minus 12 when sensitive and over the crop heat threshold).
  if (r.temp_c >= crop.heatCeiling) {
    flags.push({
      id: "heat",
      severity: sens ? "risk" : "watch",
      hi: "गर्मी तेज़ है (" + Math.round(r.temp_c) + "°). " + cropHi + " को लू लग सकती है — सुबह जल्दी पानी दो और हो सके तो हल्की छाया।",
      en: "It is very hot (" + Math.round(r.temp_c) + " degrees). " + cropEn + " can take heat stress. Water early morning and give light shade if you can.",
    });
  } else if (r.temp_c < 8) {
    flags.push({
      id: "cold",
      severity: r.temp_c < 4 ? "risk" : "watch",
      hi: "बहुत ठंड है (" + Math.round(r.temp_c) + "°). पाले का ख़तरा — शाम को हल्की सिंचाई करो, इससे पाला कम मारता है।",
      en: "It is very cold (" + Math.round(r.temp_c) + " degrees). Frost risk. A light evening watering protects the crop.",
    });
  }

  // 3. Disease pressure: warm and very humid, worst at flowering or vegetative.
  if (r.humidity >= 85 && r.temp_c >= 18 && r.temp_c < crop.heatCeiling) {
    flags.push({
      id: "disease",
      severity: sens ? "risk" : "watch",
      hi: "नमी बहुत ज़्यादा है (" + Math.round(r.humidity) + "%). फफूँद-रोग का ख़तरा — पत्तों को देखो, भीड़ कम रखो, ज़रूरत हो तो दवाई का छिड़काव।",
      en: "Humidity is very high (" + Math.round(r.humidity) + " percent). Fungal disease risk. Check the leaves, keep the canopy open, spray if needed.",
    });
  }

  flags.sort((a, b) => RANK[b.severity] - RANK[a.severity]);
  const severity = flags.reduce<Severity>((s, f) => worst(s, f.severity), "ok");
  return {
    severity,
    flags,
    okLine: {
      hi: cropHi + " ठीक चल रही है। मिट्टी, गर्मी और नमी सब ठीक हैं — आज कुछ करने की ज़रूरत नहीं।",
      en: cropEn + " looks fine. Soil, heat and humidity are all okay. Nothing to do today.",
    },
  };
}

/**
 * Auto mode announces only when a problem is NEW or has got WORSE since the
 * previous reading (FRIDAY doc section 3.2, "no nagging"). Compared per flag by
 * severity, so a fresh problem id OR a watch that becomes a risk both speak,
 * while the same problem at the same level stays quiet.
 *
 * The caller must pass the PREVIOUS reading's verdict every tick (announced or
 * not); otherwise a problem that clears and returns would be mistaken for the
 * same lingering one. The on-demand button ignores this and always speaks.
 */
export function shouldAnnounce(prev: Verdict | null, curr: Verdict): boolean {
  if (curr.severity === "ok") return false;
  if (!prev) return curr.flags.length > 0;
  const prevSev = new Map<FlagId, number>(prev.flags.map((f) => [f.id, RANK[f.severity]]));
  return curr.flags.some((f) => RANK[f.severity] > (prevSev.get(f.id) ?? -1));
}

/** Picks the line to speak: the worst flag, or the all-clear. */
export function spokenAdvice(v: Verdict, locale: Locale): string {
  const base = v.flags.length ? v.flags[0][locale] : v.okLine[locale];
  return persona(base, locale, v.severity);
}

/**
 * The "talks like a neighbour, never like an AI" layer (persona.py). On the Pi a
 * 1B local model does this; here it is light templates so it stays offline and
 * predictable. Opener only when there is something to fix.
 */
export function persona(text: string, locale: Locale, severity: Severity): string {
  if (severity === "ok") {
    return (locale === "hi" ? "अरे वाह, " : "Good news. ") + text;
  }
  const open = locale === "hi" ? "सुनो भाई, " : "Listen. ";
  return open + text;
}
