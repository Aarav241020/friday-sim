// FRIDAY sensor node (Model 2B / the box front-end).
// Arduino UNO + DHT22 (temp/humidity) + a potentiometer standing in for the
// analog soil-moisture probe. It prints the canonical FRIDAY reading line that
// the ESP32/Pi parses (FRIDAY_Product_Models.md section 2.2):
//     {"temp_c":27.4,"humidity":61,"moisture":38}
// Needs the "DHT sensor library" (Adafruit) + "Adafruit Unified Sensor" —
// Wokwi offers to install them when you Run; see README.md.

#include "DHT.h"

#define DHTPIN 2
#define DHTTYPE DHT22
#define SOIL_PIN A0

DHT dht(DHTPIN, DHTTYPE);

void setup() {
  Serial.begin(115200);
  dht.begin();
}

void loop() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  int raw = analogRead(SOIL_PIN);            // 0..1023 from the soil probe
  int moisture = map(raw, 0, 1023, 0, 100);  // to percent

  Serial.print("{\"temp_c\":");
  Serial.print(t, 1);
  Serial.print(",\"humidity\":");
  Serial.print(h, 0);
  Serial.print(",\"moisture\":");
  Serial.print(moisture);
  Serial.println("}");

  delay(2000);
}
