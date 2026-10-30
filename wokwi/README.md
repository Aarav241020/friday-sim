# FRIDAY sensor node — Wokwi simulation

This is the hardware front-end of the FRIDAY box: the Arduino + DHT22 + soil
probe that produces the reading the Pi (or the phone over BLE) turns into
advice. It prints the exact JSON line the rest of the system expects
(`FRIDAY_Product_Models.md` section 2.2):

    {"temp_c":27.4,"humidity":61,"moisture":38}

## Run it on wokwi.com (about a minute)

1. Open https://wokwi.com and sign in (free).
2. Click **New Project** and choose **Arduino Uno**.
3. Replace the default sketch with the contents of `sketch.ino`.
4. Click the **diagram.json** tab and paste the contents of `diagram.json`
   (this wires the DHT22 to pin 2 and the soil potentiometer to A0).
5. Press **Run**. If Wokwi asks, accept installing the **DHT sensor library**
   and **Adafruit Unified Sensor**.
6. Open the **Serial Monitor**. You will see the reading line printed every two
   seconds. Drag the **potentiometer** knob and the DHT22 sliders to change the
   soil moisture, temperature and humidity, and watch the numbers follow.
7. Use **Save** to keep the project and copy its share link for the demo.

## How it connects to the box

The web box simulator in the parent folder takes the same
`{ temp_c, humidity, moisture }` reading and runs the rulebook on it, speaking
the advice. On the real product the ESP32 forwards this line to the Raspberry
Pi (Panchayat box) or, for the portable kit, to the phone over Bluetooth.
