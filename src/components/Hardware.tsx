import type { Locale, Reading, Severity } from "../lib/rulebook";

const SEV_COLOR: Record<Severity, string> = { ok: "#5fbf82", watch: "#e3b341", risk: "#ef6f57" };

/**
 * An illustrated cross-section of the FRIDAY Panchayat Box: the soil/temp/humidity
 * sensors feeding an Arduino + ESP32, which hands the JSON reading to a Raspberry
 * Pi 5; the Pi listens on a mic (Vosk), decides with the rulebook, and speaks on
 * the speaker (Piper). Wires animate the data flow; the LED matches the verdict;
 * the live numbers track the sliders. Decorative, so the real controls and advice
 * live elsewhere on the page.
 */
export function Hardware({
  reading,
  severity,
  locale,
  speaking,
}: {
  reading: Reading;
  severity: Severity;
  locale: Locale;
  speaking: boolean;
}) {
  const t = (hi: string, en: string) => (locale === "hi" ? hi : en);
  const led = SEV_COLOR[severity];
  const wire = "#4f8f6a";

  return (
    <div className={"hw" + (speaking ? " on" : "")}>
      <div className="hw-head">
        <h3>{t("बॉक्स के अंदर — हार्डवेयर", "Inside the box — hardware")}</h3>
        <span className="tag">{t("सेंसर → ESP32 → रास्पबेरी Pi 5 → स्पीकर", "sensors → ESP32 → Raspberry Pi 5 → speaker")}</span>
      </div>

      <svg viewBox="0 0 980 360" role="img" aria-label={t("फ्राइडे बॉक्स का हार्डवेयर चित्र", "FRIDAY box hardware diagram")}>
        {/* enclosure */}
        <rect x="8" y="8" width="964" height="344" rx="20" fill="#0e1a16" stroke="#24382f" />
        <text x="26" y="34" className="chip-t" style={{ fontSize: 13 }}>
          FRIDAY · {t("पंचायत बॉक्स", "Panchayat box")}
        </text>

        {/* wires (behind the parts) */}
        <path className="wire" d="M150 275 C 230 275, 250 215, 300 200" stroke={wire} strokeWidth="3" />
        <path className="wire" d="M150 105 C 230 120, 250 175, 300 185" stroke={wire} strokeWidth="3" />
        <path className="wire" d="M372 195 C 420 195, 440 185, 470 185" stroke="#5fbf82" strokeWidth="3.5" />
        <path className="wire" d="M700 205 C 760 220, 790 210, 815 200" stroke="#5fbf82" strokeWidth="3" />

        {/* soil + probe */}
        <rect x="40" y="250" width="150" height="92" rx="8" fill="#3a2c1c" />
        <rect x="40" y="250" width="150" height="14" fill="#4a3826" />
        <rect x="104" y="196" width="18" height="110" rx="3" fill="#1f3a2e" stroke="#2f5a44" />
        <rect x="108" y="286" width="10" height="26" fill="#9bcf8f" opacity="0.5" />
        <text x="46" y="334" className="lbl">{t("मिट्टी की जाँच", "Soil probe")}</text>
        <text x="46" y="238" className="num">{Math.round(reading.moisture)}%</text>

        {/* DHT22 */}
        <rect x="40" y="70" width="98" height="58" rx="8" fill="#e9eef0" />
        <g fill="#b9c4c7">
          <rect x="52" y="80" width="10" height="10" /><rect x="68" y="80" width="10" height="10" />
          <rect x="52" y="96" width="10" height="10" /><rect x="68" y="96" width="10" height="10" />
          <rect x="52" y="112" width="10" height="8" /><rect x="68" y="112" width="10" height="8" />
        </g>
        <text x="90" y="92" style={{ font: "700 13px Inter", fill: "#243" }}>DHT22</text>
        <text x="90" y="112" style={{ font: "800 14px Inter", fill: "#1a3b2a" }}>
          {Math.round(reading.temp_c)}° · {Math.round(reading.humidity)}%
        </text>

        {/* Arduino + ESP32 node */}
        <rect x="294" y="150" width="84" height="86" rx="8" fill="#0d2d4a" stroke="#1c4e7a" />
        <rect x="312" y="172" width="42" height="42" rx="4" fill="#0a2238" stroke="#2d6ea8" />
        <text x="318" y="198" className="chip-t" style={{ fontSize: 10, fill: "#8fc0ea" }}>ESP32</text>
        <text x="296" y="250" className="lbl">Arduino + ESP32</text>

        {/* JSON line (above the boards, clear of the Pi) */}
        <text x="300" y="92" style={{ font: "600 12px ui-monospace, monospace", fill: "#7fd0a0" }}>
          {"{ temp_c, humidity, moisture }"}
        </text>

        {/* Raspberry Pi 5 */}
        <rect x="470" y="110" width="232" height="168" rx="12" fill="#12502f" stroke="#1f7a49" />
        <rect x="470" y="110" width="232" height="26" rx="12" fill="#0f3f26" />
        {/* 40-pin header */}
        {Array.from({ length: 20 }).map((_, i) => (
          <g key={i}>
            <rect x={486 + i * 10} y="146" width="6" height="12" rx="1" fill="#e3b341" />
            <rect x={486 + i * 10} y="162" width="6" height="12" rx="1" fill="#e3b341" />
          </g>
        ))}
        {/* SoC + heatsink */}
        <rect x="548" y="188" width="78" height="70" rx="6" fill="#0c3a22" stroke="#1f7a49" />
        <g stroke="#2f9c60" strokeWidth="3">
          <line x1="558" y1="196" x2="558" y2="250" /><line x1="572" y1="196" x2="572" y2="250" />
          <line x1="586" y1="196" x2="586" y2="250" /><line x1="600" y1="196" x2="600" y2="250" />
          <line x1="614" y1="196" x2="614" y2="250" />
        </g>
        <text x="548" y="286" className="chip-t">Pi 5 SoC</text>
        {/* USB + ethernet */}
        <rect x="662" y="150" width="34" height="26" rx="3" fill="#111" />
        <rect x="662" y="182" width="34" height="26" rx="3" fill="#111" />
        <rect x="662" y="214" width="34" height="30" rx="3" fill="#1b2b22" stroke="#355" />
        <text x="484" y="128" className="chip-t" style={{ fontSize: 13 }}>Raspberry Pi 5</text>
        <text x="484" y="300" className="lbl" style={{ fill: "#9bd3af" }}>{t("सब ऑफ़लाइन · Vosk · लोकल AI · Piper", "all offline · Vosk · local AI · Piper")}</text>

        {/* mic */}
        <circle cx="742" cy="150" r="20" fill="#0e1a16" stroke="#2f5a44" />
        <g fill="#6f857a">
          <circle cx="736" cy="146" r="2" /><circle cx="742" cy="146" r="2" /><circle cx="748" cy="146" r="2" />
          <circle cx="736" cy="152" r="2" /><circle cx="742" cy="152" r="2" /><circle cx="748" cy="152" r="2" />
        </g>
        <text x="716" y="188" className="lbl">{t("माइक", "mic")}</text>

        {/* speaker + sound waves */}
        <path d="M820 165 h20 l24 -18 v72 l-24 -18 h-20 z" fill="#15271f" stroke="#356a49" />
        <g stroke={led} strokeWidth="3" fill="none">
          <path className="sndwave" style={{ animationDelay: "0s" }} d="M876 165 q10 18 0 36" />
          <path className="sndwave" style={{ animationDelay: "0.18s" }} d="M888 158 q16 25 0 50" />
          <path className="sndwave" style={{ animationDelay: "0.36s" }} d="M900 150 q22 33 0 66" />
        </g>
        <text x="812" y="232" className="lbl">{t("स्पीकर", "speaker")}</text>

        {/* button + LED */}
        <circle cx="520" cy="320" r="14" fill="#8a2d22" stroke="#c0493a" />
        <text x="500" y="348" className="lbl">{t("बटन", "button")}</text>
        <circle cx="580" cy="320" r="11" fill={led} opacity="0.95">
          <animate attributeName="opacity" values="0.55;1;0.55" dur="1.8s" repeatCount="indefinite" />
        </circle>
        <text x="600" y="325" className="lbl" style={{ fill: led }}>
          {t(severity === "ok" ? "ठीक" : severity === "watch" ? "ध्यान" : "ख़तरा", severity === "ok" ? "OK" : severity === "watch" ? "watch" : "risk")}
        </text>
      </svg>
    </div>
  );
}
