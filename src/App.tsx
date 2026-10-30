import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  advise,
  CROPS,
  cropByKey,
  moistureBand,
  shouldAnnounce,
  spokenAdvice,
  STAGE_LABEL,
  STAGES,
  type Locale,
  type Reading,
  type Stage,
  type Verdict,
} from "./lib/rulebook";
import { Hardware } from "./components/Hardware";
import { WokwiPanel } from "./components/WokwiPanel";

/** The Pi box's per-checkout Profile (FRIDAY doc section 3.3). Stored locally; wiped on "Return box". */
type Profile = { name: string; crop: string; stage: Stage; locale: Locale };
const STORE_KEY = "friday.profile";
const DEFAULT_READING: Reading = { temp_c: 29, humidity: 62, moisture: 48 };

/** Guards stored JSON: a stale or hand-edited shape must never crash the box at render. */
function isProfile(p: unknown): p is Profile {
  if (!p || typeof p !== "object") return false;
  const o = p as Record<string, unknown>;
  return (
    typeof o.name === "string" &&
    typeof o.crop === "string" &&
    typeof o.stage === "string" &&
    (STAGES as readonly string[]).includes(o.stage) &&
    (o.locale === "hi" || o.locale === "en")
  );
}

function loadProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isProfile(parsed)) return parsed;
    localStorage.removeItem(STORE_KEY); // drop a shape this build cannot use
    return null;
  } catch {
    return null;
  }
}

/** Thin wrapper over the browser's built-in voice — the stand-in for the Pi's Piper TTS. */
function useSpeech() {
  const [supported] = useState(() => typeof window !== "undefined" && "speechSynthesis" in window);
  const [speaking, setSpeaking] = useState(false);
  const voices = useRef<SpeechSynthesisVoice[]>([]);
  // The live utterance: keeps a reference (Chrome drops onend on a GC'd utterance)
  // and lets each handler ignore events from an utterance we have moved past.
  const current = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    if (!supported) return;
    const load = () => {
      voices.current = window.speechSynthesis.getVoices();
    };
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", load);
      window.speechSynthesis.cancel();
    };
  }, [supported]);

  const speak = useCallback(
    (text: string, locale: Locale) => {
      if (!supported || !text.trim()) return false;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      current.current = u;
      const want = locale === "hi" ? "hi" : "en";
      const voice =
        voices.current.find((v) => v.lang.toLowerCase().startsWith(want + "-in")) ??
        voices.current.find((v) => v.lang.toLowerCase().startsWith(want));
      if (voice) u.voice = voice;
      u.lang = locale === "hi" ? "hi-IN" : "en-IN";
      u.rate = 0.98;
      u.onstart = () => {
        if (current.current === u) setSpeaking(true);
      };
      const done = () => {
        if (current.current === u) setSpeaking(false);
      };
      u.onend = done;
      u.onerror = done;
      window.speechSynthesis.speak(u);
      return true;
    },
    [supported],
  );

  const stop = useCallback(() => {
    current.current = null;
    if (supported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  return { supported, speaking, speak, stop };
}

const SEV_WORD: Record<Verdict["severity"], { hi: string; en: string }> = {
  ok: { hi: "ठीक", en: "OK" },
  watch: { hi: "ध्यान दें", en: "Watch" },
  risk: { hi: "ख़तरा", en: "Risk" },
};

export function App() {
  const [profile, setProfile] = useState<Profile | null>(() => loadProfile());
  const [cropKey, setCropKey] = useState<string>(() => profile?.crop ?? "paddy");
  const [stage, setStage] = useState<Stage>(() => profile?.stage ?? "Vegetative");
  const [locale, setLocale] = useState<Locale>(() => profile?.locale ?? "hi");
  const [reading, setReading] = useState<Reading>(DEFAULT_READING);
  const [auto, setAuto] = useState(false);
  const [lastSpoken, setLastSpoken] = useState("");

  const { supported, speaking, speak, stop } = useSpeech();
  const crop = cropByKey(cropKey);
  const verdict = useMemo(() => advise(crop, stage, reading), [crop, stage, reading]);
  const band = moistureBand(crop, stage);

  // The previous reading's verdict, updated every tick (announced or not) so a
  // problem that clears and returns is heard again — see shouldAnnounce().
  const lastVerdict = useRef<Verdict | null>(null);

  const announce = useCallback(
    (v: Verdict, force: boolean) => {
      const fire = force || shouldAnnounce(lastVerdict.current, v);
      lastVerdict.current = v;
      if (!fire) return;
      const text = spokenAdvice(v, locale);
      setLastSpoken(text);
      speak(text, locale);
    },
    [locale, speak],
  );

  // A new crop or stage is a new field: forget the last verdict so it re-announces.
  useEffect(() => {
    lastVerdict.current = null;
  }, [cropKey, stage]);

  // Auto mode: the box re-reads every few seconds (the soil slowly dries, the day
  // warms) and speaks only when something is wrong and has changed.
  useEffect(() => {
    if (!auto) return;
    const id = window.setInterval(() => {
      setReading((r) => ({
        temp_c: clamp(r.temp_c + rnd(-0.6, 1.1), 2, 48),
        humidity: clamp(r.humidity + rnd(-3, 3), 10, 98),
        moisture: clamp(r.moisture - rnd(0.5, 2.5), 2, 100),
      }));
    }, 3500);
    return () => window.clearInterval(id);
  }, [auto]);

  useEffect(() => {
    if (auto) announce(verdict, false);
  }, [verdict, auto, announce]);

  const saveProfile = (p: Profile) => {
    stop();
    setProfile(p);
    setCropKey(p.crop);
    setStage(p.stage);
    setLocale(p.locale);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(p));
    } catch {
      // Private-mode storage can throw; the box still works for this session.
    }
  };

  const returnBox = () => {
    stop();
    setAuto(false);
    lastVerdict.current = null;
    setLastSpoken("");
    setReading(DEFAULT_READING);
    try {
      localStorage.removeItem(STORE_KEY);
    } catch {
      /* ignore */
    }
    setProfile(null);
  };

  if (!profile) {
    return <Onboarding locale={locale} onLocale={setLocale} onDone={saveProfile} speak={speak} supported={supported} />;
  }

  const sev = verdict.severity;
  const t = (hi: string, en: string) => (locale === "hi" ? hi : en);

  return (
    <div className="wrap" lang={locale}>
      <div className="title">
        <h1>{t("फ्राइडे बॉक्स", "FRIDAY Box")}</h1>
        <p>{t("बिना इंटरनेट के, आवाज़ से खेती की सलाह — पंचायत बॉक्स का सिमुलेशन", "Offline, voice-first farm advice — a simulation of the Panchayat Box")}</p>
      </div>
      <div className="badges">
        <span className="badge offline">{t("ऑफ़लाइन", "Offline")}</span>
        <span className="badge">{t("नियम-पुस्तिका पहले, AI बाद में", "Rulebook first, AI second")}</span>
        <span className="badge">{t("हिंदी + अंग्रेज़ी आवाज़", "Hindi + English voice")}</span>
      </div>

      <Hardware reading={reading} severity={sev} locale={locale} speaking={speaking} />

      <div className="grid">
        {/* The device */}
        <div className="box">
          <div className="box-top">
            <div className="box-brand">
              <span className={"led " + sev} aria-hidden="true" />
              FRIDAY
            </div>
            <div className="seg" role="group" aria-label={t("भाषा", "Language")}>
              <button aria-pressed={locale === "hi"} className={locale === "hi" ? "on" : ""} onClick={() => setLocale("hi")}>
                हिंदी
              </button>
              <button aria-pressed={locale === "en"} className={locale === "en" ? "on" : ""} onClick={() => setLocale("en")}>
                EN
              </button>
            </div>
          </div>

          <div className="screen">
            <div className="crop">
              {t(crop.hi, crop.en)} · {t(STAGE_LABEL[stage].hi, STAGE_LABEL[stage].en)}
            </div>
            <span className={"sev " + sev}>{t(SEV_WORD[sev].hi, SEV_WORD[sev].en)}</span>
            <div className="advice" role="status" aria-atomic="true">
              {verdict.flags.length ? t(verdict.flags[0].hi, verdict.flags[0].en) : t(verdict.okLine.hi, verdict.okLine.en)}
            </div>
            <div className="speaking" aria-hidden="true">
              {speaking ? t("बोल रहा हूँ…", "Speaking…") : ""}
            </div>
          </div>

          <div className="selects">
            <div className="field">
              <label htmlFor="crop">{t("फसल", "Crop")}</label>
              <select id="crop" aria-label={t("फसल", "Crop")} value={cropKey} onChange={(e) => setCropKey(e.target.value)}>
                {CROPS.map((c) => (
                  <option key={c.key} value={c.key}>
                    {t(c.hi, c.en)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="stage">{t("अवस्था", "Stage")}</label>
              <select id="stage" aria-label={t("अवस्था", "Stage")} value={stage} onChange={(e) => setStage(toStage(e.target.value, stage))}>
                {STAGES.map((s) => (
                  <option key={s} value={s}>
                    {t(STAGE_LABEL[s].hi, STAGE_LABEL[s].en)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Slider
            idBase="moist"
            label={t("मिट्टी की नमी", "Soil moisture")}
            value={reading.moisture}
            unit="%"
            min={0}
            max={100}
            onChange={(moisture) => setReading((r) => ({ ...r, moisture }))}
            hint={t("सही दायरा " + band.dry + "–" + band.wet + "%", "ideal " + band.dry + "–" + band.wet + "%")}
          />
          <Slider
            idBase="temp"
            className="temp"
            label={t("तापमान", "Temperature")}
            value={reading.temp_c}
            unit="°C"
            min={2}
            max={48}
            onChange={(temp_c) => setReading((r) => ({ ...r, temp_c }))}
            hint={t("लू " + crop.heatCeiling + "° से ऊपर", "heat stress above " + crop.heatCeiling + "°")}
          />
          <Slider
            idBase="hum"
            className="humidity"
            label={t("हवा में नमी", "Humidity")}
            value={reading.humidity}
            unit="%"
            min={10}
            max={98}
            onChange={(humidity) => setReading((r) => ({ ...r, humidity }))}
            hint={t("85% से ऊपर रोग का ख़तरा", "disease risk above 85%")}
          />

          <div className="controls">
            <button className="btn primary" onClick={() => announce(verdict, true)}>
              {t("जाँचें और सुनें", "Check & speak")}
            </button>
            <div className="seg" role="group" aria-label={t("मोड", "Mode")}>
              <button aria-pressed={!auto} className={!auto ? "on" : ""} onClick={() => setAuto(false)}>
                {t("बटन से", "On demand")}
              </button>
              <button aria-pressed={auto} className={auto ? "on" : ""} onClick={() => setAuto(true)}>
                {t("अपने आप", "Auto")}
              </button>
            </div>
            <button className="btn ghost" onClick={returnBox}>
              {t("बॉक्स लौटाएँ", "Return box")}
            </button>
          </div>
          {!supported && <p className="band">{t("इस ब्राउज़र में आवाज़ नहीं है — सलाह स्क्रीन पर दिखेगी।", "No voice in this browser — advice shows on screen.")}</p>}
        </div>

        {/* Inside the box */}
        <div>
          <div className="card">
            <h3>{t("बॉक्स के अंदर", "Inside the box")}</h3>
            <div className="pipe">
              <PipeStep active label={t("पढ़ाई", "Reading")} value={`${Math.round(reading.temp_c)}°C · ${Math.round(reading.humidity)}% RH · ${Math.round(reading.moisture)}% ${t("नमी", "soil")}`} />
              <PipeStep active label={t("नियम-पुस्तिका", "Rulebook")} value={`${verdict.flags.length} ${t("संकेत", "flags")} · ${t(SEV_WORD[sev].hi, SEV_WORD[sev].en)}`} />
              <PipeStep active={speaking} label={t("पड़ोसी की आवाज़", "Neighbour voice")} value={t("हिंदी/अंग्रेज़ी", "Hindi/English")} />
              <PipeStep active={speaking} label={t("स्पीकर", "Speaker")} value={speaking ? t("बोल रहा है", "speaking") : t("चुप", "idle")} />
            </div>
          </div>

          <div className="card">
            <h3>{t("क्या मिला", "What the box found")}</h3>
            {verdict.flags.length === 0 ? (
              <p className="muted">{t(verdict.okLine.hi, verdict.okLine.en)}</p>
            ) : (
              <div className="flags">
                {verdict.flags.map((f) => (
                  <div key={f.id} className={"flagrow " + f.severity}>
                    <span>{t(f.hi, f.en)}</span>
                  </div>
                ))}
              </div>
            )}
            {lastSpoken && <p className="muted" style={{ marginTop: 12 }}>🔊 {lastSpoken}</p>}
          </div>

          <div className="card">
            <h3>{t("यह बॉक्स", "This box")}</h3>
            <p className="muted">
              {t("किसान", "Farmer")}: <b>{profile.name || t("मेहमान", "Guest")}</b>
              <br />
              {t("साझा बॉक्स — लौटाने पर डेटा मिट जाता है।", "Shared box — data is wiped when it is returned.")}
            </p>
          </div>
        </div>
      </div>

      <WokwiPanel reading={reading} locale={locale} />

      <p className="foot">
        {t(
          "असली बॉक्स: रास्पबेरी Pi 5, Vosk (सुनना) · छोटा लोकल AI · Piper (बोलना) — सब ऑफ़लाइन। यह ब्राउज़र सिमुलेशन उसी तर्क को दिखाता है।",
          "Real box: Raspberry Pi 5 with Vosk (listen), a small local AI, and Piper (speak) — all offline. This browser simulation runs the same logic.",
        )}
      </p>
    </div>
  );
}

function Slider(props: {
  idBase: string;
  className?: string;
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  hint: string;
  onChange: (v: number) => void;
}) {
  const hintId = props.idBase + "-hint";
  const shown = Math.round(props.value);
  return (
    <div className={"sensor " + (props.className ?? "soil")}>
      <div className="row">
        <span>{props.label}</span>
        <span className="val">
          {shown}
          {props.unit}
        </span>
      </div>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={1}
        value={shown}
        onChange={(e) => props.onChange(Number(e.target.value))}
        aria-label={props.label}
        aria-valuetext={shown + props.unit}
        aria-describedby={hintId}
      />
      <div className="band" id={hintId}>
        {props.hint}
      </div>
    </div>
  );
}

function PipeStep({ active, label, value }: { active?: boolean; label: string; value: string }) {
  return (
    <div className={"step" + (active ? " active" : "")}>
      <span className="dot" aria-hidden="true" />
      <b>{label}</b>
      <span style={{ marginLeft: "auto" }}>{value}</span>
    </div>
  );
}

function Onboarding({
  locale,
  onLocale,
  onDone,
  speak,
  supported,
}: {
  locale: Locale;
  onLocale: (l: Locale) => void;
  onDone: (p: Profile) => void;
  speak: (text: string, locale: Locale) => boolean;
  supported: boolean;
}) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [crop, setCrop] = useState("paddy");
  const [stage, setStage] = useState<Stage>("Vegetative");
  const t = (hi: string, en: string) => (locale === "hi" ? hi : en);

  const questions = [
    t("नमस्ते! मैं फ्राइडे हूँ। आपका नाम क्या है?", "Hello! I am FRIDAY. What is your name?"),
    t("आप कौन सी फसल उगा रहे हैं?", "Which crop are you growing?"),
    t("फसल किस अवस्था में है?", "What stage is the crop at?"),
  ];

  // Speak the current question (the box's spoken interview). Re-speaks on language change.
  useEffect(() => {
    if (supported) speak(questions[step], locale);
    // questions is derived from step+locale, so [step, locale] is the real trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, locale]);

  return (
    <div className="scrim" lang={locale}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="ob-title">
        <h2 id="ob-title">{t("बॉक्स शुरू करें", "Set up the box")}</h2>
        <p>{t("बॉक्स तीन छोटे सवाल पूछेगा, फिर खेत की सलाह देगा।", "The box asks three short questions, then advises your field.")}</p>
        <div className="seg" role="group" aria-label={t("भाषा", "Language")} style={{ marginBottom: 16 }}>
          <button aria-pressed={locale === "hi"} className={locale === "hi" ? "on" : ""} onClick={() => onLocale("hi")}>
            हिंदी
          </button>
          <button aria-pressed={locale === "en"} className={locale === "en" ? "on" : ""} onClick={() => onLocale("en")}>
            English
          </button>
        </div>

        <div className="q" role="status">
          🔊 {questions[step]}
        </div>

        {step === 0 && (
          <div className="field">
            <input type="text" value={name} aria-label={t("आपका नाम", "Your name")} placeholder={t("आपका नाम", "Your name")} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
        )}
        {step === 1 && (
          <div className="field">
            <select aria-label={t("फसल", "Crop")} value={crop} onChange={(e) => setCrop(e.target.value)}>
              {CROPS.map((c) => (
                <option key={c.key} value={c.key}>
                  {t(c.hi, c.en)}
                </option>
              ))}
            </select>
          </div>
        )}
        {step === 2 && (
          <div className="field">
            <select aria-label={t("अवस्था", "Stage")} value={stage} onChange={(e) => setStage(toStage(e.target.value, stage))}>
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {t(STAGE_LABEL[s].hi, STAGE_LABEL[s].en)}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="controls">
          {step < 2 ? (
            <button className="btn primary" onClick={() => setStep(step + 1)}>
              {t("आगे", "Next")}
            </button>
          ) : (
            <button className="btn primary" onClick={() => onDone({ name: name.trim(), crop, stage, locale })}>
              {t("बॉक्स शुरू करें", "Start the box")}
            </button>
          )}
          {step > 0 && (
            <button className="btn ghost" onClick={() => setStep(step - 1)}>
              {t("पीछे", "Back")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** A <select> value is always one of STAGES, but narrow it instead of casting. */
function toStage(v: string, fallback: Stage): Stage {
  return (STAGES as readonly string[]).includes(v) ? (v as Stage) : fallback;
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function rnd(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}
