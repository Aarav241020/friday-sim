# FRIDAY Box — web simulation

A browser simulation of the **FRIDAY Panchayat Box**: an offline, voice-first
farm advisor for Indian farmers. It reads soil moisture, temperature and
humidity, runs a crop- and growth-stage-aware **rulebook**, and speaks the
advice in Hindi or English — the same pipeline the real Raspberry Pi 5 box runs
offline with Vosk (listen), a small local AI, and Piper (speak).

**Live:** https://friday-sim.vercel.app

## What is on the page
- **Hardware view** — an illustrated box: soil probe, DHT22, Arduino + ESP32, a
  Raspberry Pi 5, mic, speaker, button and LED, with the reading flowing through
  animated wires and the LED coloured by the verdict.
- **The box** — a device panel with sensor sliders, a crop and growth-stage
  picker, a voice onboarding interview, a Check button, and spoken advice.
- **Inside the box** — the Reading to Rulebook to Neighbour-voice to Speaker
  pipeline, and the flags the rulebook raised.
- **Sensor node (Wokwi)** — a live serial monitor streaming the real
  `{ "temp_c":.., "humidity":.., "moisture":.. }` line, with buttons to copy the
  Arduino sketch and diagram and open them on wokwi.com.

## Run locally
```
npm install
npm run dev      # dev server
npm test         # rulebook self-checks (tsx)
npm run build    # production build to dist/
```

## Layout
- `src/lib/rulebook.ts` — crops, growth stages, the threshold table, advise(),
  shouldAnnounce() and the neighbour persona. The one file to tune.
- `src/lib/rulebook.test.ts` — assert-based checks (`npm test`).
- `src/App.tsx` — the box UI and the Web Speech voice.
- `src/components/Hardware.tsx` — the illustrated Pi box.
- `src/components/WokwiPanel.tsx` — the serial monitor and Wokwi links.
- `wokwi/` — the Arduino sketch and diagram for the real hardware simulation.

## Honesty note
The exact threshold numbers and Hindi advice strings live in the Pi `rules.py`.
The table in `rulebook.ts` is a documented stand-in with the same structure,
built from the crop table and heat thresholds in the Agent Farmer mobile app.
Swap that one table for the real numbers when available.
