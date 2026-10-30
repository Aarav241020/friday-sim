import { useEffect, useRef, useState } from "react";
import type { Locale, Reading } from "../lib/rulebook";
// The real firmware + wiring, imported as text so the copy buttons hand over the
// exact files in friday-sim/wokwi/ (single source of truth).
import sketch from "../../wokwi/sketch.ino?raw";
import diagram from "../../wokwi/diagram.json?raw";

const WOKWI_NEW = "https://wokwi.com/projects/new/arduino-uno";

/**
 * The sensor node on the page: a serial monitor that streams the same
 * { temp_c, humidity, moisture } line the Arduino prints in Wokwi, driven by the
 * live reading. The buttons copy the real sketch/diagram and open wokwi.com so
 * the full hardware simulation runs with two pastes.
 */
export function WokwiPanel({ reading, locale }: { reading: Reading; locale: Locale }) {
  const t = (hi: string, en: string) => (locale === "hi" ? hi : en);
  const [lines, setLines] = useState<string[]>([]);
  const [copied, setCopied] = useState("");
  const latest = useRef(reading);
  latest.current = reading;

  // Print the reading line every 2 s, like the sketch's delay(2000).
  useEffect(() => {
    const push = () => {
      const r = latest.current;
      const line = `{"temp_c":${r.temp_c.toFixed(1)},"humidity":${Math.round(r.humidity)},"moisture":${Math.round(r.moisture)}}`;
      setLines((prev) => [...prev.slice(-7), line]);
    };
    push();
    const id = window.setInterval(push, 2000);
    return () => window.clearInterval(id);
  }, []);

  const copy = (text: string, what: string) => {
    void navigator.clipboard?.writeText(text);
    setCopied(what);
    window.setTimeout(() => setCopied(""), 2000);
  };

  return (
    <div className="wokwi">
      <div className="wokwi-head">
        <h3>{t("सेंसर नोड — Wokwi", "Sensor node — Wokwi")}</h3>
        <span className="tag">{t("Arduino + DHT22 + मिट्टी सेंसर · यही लाइन ESP32/Pi पढ़ता है", "Arduino + DHT22 + soil sensor · the line the ESP32/Pi reads")}</span>
      </div>

      <div className="serial" aria-label={t("सीरियल मॉनिटर", "Serial monitor")}>
        <div className="bar">
          <span>{t("सीरियल मॉनिटर", "Serial Monitor")}</span>
          <span>115200 baud</span>
        </div>
        {lines.map((l, i) => (
          <div className="ln" key={i}>
            {l}
          </div>
        ))}
      </div>

      <div className="row">
        <a className="btn primary" href={WOKWI_NEW} target="_blank" rel="noreferrer">
          {t("Wokwi पर खोलें", "Open in Wokwi")} ↗
        </a>
        <button className="btn" onClick={() => copy(sketch, t("स्केच", "sketch"))}>
          {t("स्केच कॉपी करें", "Copy sketch.ino")}
        </button>
        <button className="btn" onClick={() => copy(diagram, t("डायग्राम", "diagram"))}>
          {t("डायग्राम कॉपी करें", "Copy diagram.json")}
        </button>
        {copied && (
          <span className="copied" role="status">
            {t(copied + " कॉपी हो गया — Wokwi में पेस्ट करें", copied + " copied — paste into Wokwi")}
          </span>
        )}
      </div>
    </div>
  );
}
