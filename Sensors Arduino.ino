#include <WiFi.h>
#include <PubSubClient.h>
#include "DHT.h"
#include <ArduinoJson.h>

#define DHTPIN 5
#define DHTTYPE DHT11
#define LDR_PIN 21
#define TRIG_PIN 23
#define ECHO_PIN 22

const char* ssid = "StarLink 5G";
const char* password = "Xever@2007"; // leave empty only if network truly has no password
const char* mqtt_server = "10.229.21.178"; // Replace with your broker IP

WiFiClient espClient;
PubSubClient client(espClient);
DHT dht(DHTPIN, DHTTYPE);

void setup_wifi() {
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500); Serial.print(".");
  }
  Serial.println("Connected to WiFi");
}

void setup() {
  Serial.begin(115200);
  dht.begin();
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  setup_wifi();
  client.setServer(mqtt_server, 1883);
}

float readDistanceCM() {
  digitalWrite(TRIG_PIN, LOW); delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long duration = pulseIn(ECHO_PIN, HIGH);
  return duration * 0.034 / 2;
}

void loop() {
  if (!client.connected()) {
    while (!client.connected()) {
      if (client.connect("ESP32Client")) break;
      delay(2000);
    }
  }

  float temp = dht.readTemperature();
  float hum = dht.readHumidity();
  int light = analogRead(LDR_PIN);
  float distance = readDistanceCM();

  StaticJsonDocument<200> doc;
  doc["temperature"] = temp;
  doc["humidity"] = hum;
  doc["light"] = light;
  doc["distance"] = distance;

  char buffer[256];
  serializeJson(doc, buffer);

  client.publish("esp32/21138559/data", buffer); // Use student's ID

  Serial.println("Published: ");
  Serial.println(buffer);

  delay(5000);
}