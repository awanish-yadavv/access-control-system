// =============================================================================
// NeyoFit Access Control — ESP32 + RC522 RFID
// =============================================================================
// Hardware:
//   RC522       → SDA=D5, SCK=D18, MOSI=D23, MISO=D19, RST=D22 (3.3V)
//   Lock        → D21 (HIGH=unlock relay, LOW=locked)
//   Button      → D4 to GND (INPUT_PULLUP, hold 5s for WiFi setup)
//   LED Red     → D25 (No Network / Error)
//   LED Green   → D26 (MQTT Connected)
//   LED Yellow  → D27 (Power ON — always on)
//   LED Blue    → D14 (RFID Activity)
//   Buzzer      → D33 Signal (3-pin module, VCC=3V3)
//
// Libraries (install via Arduino IDE Library Manager):
//   - WiFiManager       by tzapu           v2.0.x
//   - PubSubClient      by Nick O'Leary    v2.8.x
//   - ArduinoJson       by Benoit Blanchon v6.x
//   - MFRC522           by GithubCommunity v1.4.x
//
// NOTE: Before uploading for a clean start (clears saved WiFi + Tenant ID):
//   Tools → Erase All Flash Before Sketch Upload → All Flash Contents
// =============================================================================

#include <Arduino.h>
#include <SPI.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WiFiManager.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <MFRC522.h>
#include <Preferences.h>
#include <WebServer.h>
#include <time.h>
#include <esp_task_wdt.h>
#include <mbedtls/pk.h>
#include <mbedtls/rsa.h>
#include <mbedtls/entropy.h>
#include <mbedtls/ctr_drbg.h>
#include <mbedtls/base64.h>

// -----------------------------------------------------------------------------
// Pin Definitions
// -----------------------------------------------------------------------------
#define PIN_RFID_SDA    5
#define PIN_RFID_RST   22
#define PIN_RFID_SCK   18
#define PIN_RFID_MISO  19
#define PIN_RFID_MOSI  23
#define PIN_LOCK       21
#define PIN_SETUP_BTN   4

// Status LEDs (each with 330Ω resistor to GND)
#define PIN_LED_RED    25   // No Network / Error
#define PIN_LED_GREEN  26   // MQTT Connected
#define PIN_LED_YELLOW 27   // Power ON (always on after boot)
#define PIN_LED_BLUE   14   // RFID Activity

// Buzzer (TMB12A05 3-pin: Signal=D33, VCC=3V3, GND=GND)
#define PIN_BUZZER     33

// -----------------------------------------------------------------------------
// Server Configuration
// -----------------------------------------------------------------------------
#define MQTT_BROKER  "mqtt.neyofit.io"   // Your broker domain (used for TLS SNI)
#define MQTT_PORT    8883                 // TLS port (public, for ESP32 devices)
#define MQTT_USER    "neyofit-device"     // Must match MQTT_DEVICE_USER in mosquitto/.env
#define MQTT_PASS    ""                   // Must match MQTT_DEVICE_PASSWORD in mosquitto/.env

// Let's Encrypt ISRG Root X1 CA — valid until 2035-09-30.
// If your cert chain changes, replace this with the new root CA PEM.
// Get it from: https://letsencrypt.org/certificates/ (ISRG Root X1, PEM)
static const char ROOT_CA[] PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoBggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----
)EOF";

// -----------------------------------------------------------------------------
// Timing Constants (milliseconds)
// -----------------------------------------------------------------------------
#define SETUP_HOLD_MS      5000   // Hold button this long to enter WiFi setup
#define LOCK_OPEN_MS       5000   // How long the door stays unlocked
#define MQTT_RETRY_MS      5000   // Minimum gap between reconnect attempts
#define RFID_DEBOUNCE_MS   2000   // Ignore the same card within this window
#define ACCESS_TIMEOUT_MS  5000   // Max wait for server response after card tap
#define NTP_TIMEOUT_MS     8000   // Max wait for NTP sync on boot

// -----------------------------------------------------------------------------
// NVS Keys
// -----------------------------------------------------------------------------
#define PREFS_NAMESPACE        "acs"
#define PREFS_KEY_DEVICE_PRIV  "devPrivKey"   // RSA-2048 private key PEM (~1700 bytes)
#define PREFS_KEY_DEVICE_PUB   "devPubKey"    // RSA-2048 public key PEM  (~450 bytes)
#define PREFS_KEY_KEY_READY    "keyReady"     // bool: key pair generated

// Server RSA-2048 public key — copy from backend/server_public.pem
// Used to encrypt every card scan payload sent to the server.
static const char SERVER_PUBLIC_KEY[] PROGMEM = R"EOF(
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1VGYP0+YcYkIQJVg5Hb0
Lg6YT8BVLHFZYQpN/j3mmjuI3EBEszhMErX0XMMAFb9TmrplRC44aPiBvdv0J6c6
8a4J0ETTEOJNo7xSPYI68LaC4YHModgvLXKCC5/pE3tgiefAEe0e87/GesuQP/JO
37W2Qvvm6U5puOB397rIdTdNG14w0VUF9A7fShHiR8N2un4aLztjpmM+BYWdqbKf
5gXI2VH8USrSbyqCRYKM09CTO3yKAczypScqBufc9zf1Q4R6KY1TGCpZUAC0u4pM
KnXOR4EGgZxaqFzknMbHQru5vh9kNcmQUcP53TEaFVc1bKMmaD3xOTpIvOh0KGTp
DQIDAQAB
-----END PUBLIC KEY-----
)EOF";

// -----------------------------------------------------------------------------
// MQTT Topics
// -----------------------------------------------------------------------------
#define MQTT_PUBLISH_TOPIC  "acs/access"
#define MQTT_RESPONSE_BASE  "acs/response/"

// -----------------------------------------------------------------------------
// Buzzer Sequences (non-blocking step sequencer)
// Each entry: { duration_ms, buzzer_on }. Sequence ends when duration_ms == 0.
// -----------------------------------------------------------------------------
struct BuzzStep { uint16_t ms; bool on; };

static const BuzzStep BUZZ_GRANTED[] = { {200, true},  {0, false} };          // 1 beep — granted
static const BuzzStep BUZZ_DENIED[]  = { {200, true}, {150, false},
                                         {200, true},  {0, false} };           // 2 beeps — denied

// -----------------------------------------------------------------------------
// RFID State Machine
// -----------------------------------------------------------------------------
enum RfidState { RFID_IDLE, RFID_WAITING_RESPONSE };

// -----------------------------------------------------------------------------
// Globals
// -----------------------------------------------------------------------------
String deviceId;
String subscribedTopic;
String apName;

// Crypto
String devicePublicKeyPem = "";   // loaded from NVS — shown on web dashboard for admin to copy
bool   cryptoReady        = false;

WiFiClientSecure wifiClient;
PubSubClient     mqttClient(wifiClient);
MFRC522      rfid(PIN_RFID_SDA, PIN_RFID_RST);
Preferences  prefs;
WebServer    webServer(80);

RfidState     rfidState              = RFID_IDLE;
String        pendingUid             = "";
bool          accessResponseReceived = false;
bool          accessGrantedFlag      = false;

unsigned long lastRfidReadMs         = 0;
unsigned long lockOpenUntilMs        = 0;
unsigned long mqttLastRetryMs        = 0;
unsigned long setupBtnPressedAt      = 0;

const BuzzStep* buzzerSeq    = nullptr;
int             buzzerStep   = 0;
unsigned long   buzzerNextMs = 0;

// Status tracking for web dashboard
bool          ntpSynced        = false;
bool          rfidReady        = false;
String        lastCardUid      = "";
String        lastAccessResult = "";
unsigned long bootMs           = 0;

// =============================================================================
// Device Identity
// =============================================================================

String getMacDeviceId() {
    String mac = WiFi.macAddress(); // "AA:BB:CC:DD:EE:FF"
    mac.replace(":", "");
    mac.toUpperCase();
    return mac;
}

String buildApName() {
    return String("ACS-") + deviceId.substring(8); // last 4 hex chars of MAC
}

// =============================================================================
// Crypto — RSA-2048 Key Pair (generated once on first boot, stored in NVS)
// =============================================================================

// Ensures a device RSA key pair exists.
// First boot: generates + stores in NVS (~30 seconds, blue LED on).
// Subsequent boots: loads public key into devicePublicKeyPem for dashboard display.
void ensureKeyPair() {
    prefs.begin(PREFS_NAMESPACE, true);
    bool ready = prefs.getBool(PREFS_KEY_KEY_READY, false);
    if (ready) {
        devicePublicKeyPem = prefs.getString(PREFS_KEY_DEVICE_PUB, "");
        prefs.end();
        cryptoReady = !devicePublicKeyPem.isEmpty();
        Serial.println("[Crypto] Key pair already exists.");
        return;
    }
    prefs.end();

    Serial.println("[Crypto] Generating RSA-2048 key pair (first boot — ~30s)...");
    Serial.println("[Crypto] Blue LED on during generation. Do not power off.");
    digitalWrite(PIN_LED_BLUE, HIGH);

    mbedtls_pk_context        pk;
    mbedtls_entropy_context   entropy;
    mbedtls_ctr_drbg_context  ctr_drbg;

    mbedtls_pk_init(&pk);
    mbedtls_entropy_init(&entropy);
    mbedtls_ctr_drbg_init(&ctr_drbg);

    const char* pers = "acs_keygen";
    mbedtls_ctr_drbg_seed(&ctr_drbg, mbedtls_entropy_func, &entropy,
                           (const unsigned char*)pers, strlen(pers));
    mbedtls_pk_setup(&pk, mbedtls_pk_info_from_type(MBEDTLS_PK_RSA));
    mbedtls_rsa_gen_key(mbedtls_pk_rsa(pk), mbedtls_ctr_drbg_random, &ctr_drbg, 2048, 65537);

    // Export PEM strings (private ~1700 bytes, public ~450 bytes — both fit in NVS)
    unsigned char privBuf[2048] = {};
    unsigned char pubBuf[512]   = {};
    mbedtls_pk_write_key_pem(&pk, privBuf, sizeof(privBuf));
    mbedtls_pk_write_pubkey_pem(&pk, pubBuf, sizeof(pubBuf));

    prefs.begin(PREFS_NAMESPACE, false);
    prefs.putString(PREFS_KEY_DEVICE_PRIV, (char*)privBuf);
    prefs.putString(PREFS_KEY_DEVICE_PUB,  (char*)pubBuf);
    prefs.putBool(PREFS_KEY_KEY_READY, true);
    prefs.end();

    devicePublicKeyPem = String((char*)pubBuf);
    cryptoReady = true;

    mbedtls_pk_free(&pk);
    mbedtls_entropy_free(&entropy);
    mbedtls_ctr_drbg_free(&ctr_drbg);

    Serial.println("[Crypto] Key pair generated and saved to NVS.");
    digitalWrite(PIN_LED_BLUE, LOW);
}

// =============================================================================
// Status LEDs
// =============================================================================

// Call every loop tick — Red blink pattern reflects network state:
//   Fast blink (200ms) = No WiFi
//   Slow blink (1000ms gap) = WiFi OK but MQTT not connected
//   Red OFF + Green ON = Fully connected
void updateNetworkLeds() {
    bool wifiOk = (WiFi.status() == WL_CONNECTED);
    bool mqttOk = mqttClient.connected();

    if (mqttOk) {
        digitalWrite(PIN_LED_GREEN, HIGH);
        digitalWrite(PIN_LED_RED,   LOW);
    } else if (wifiOk) {
        // WiFi connected, MQTT not — slow blink (1s on / 1s off)
        digitalWrite(PIN_LED_GREEN, LOW);
        digitalWrite(PIN_LED_RED, (millis() % 2000) < 1000 ? HIGH : LOW);
    } else {
        // No WiFi — fast blink (200ms on / 200ms off)
        digitalWrite(PIN_LED_GREEN, LOW);
        digitalWrite(PIN_LED_RED, (millis() % 400) < 200 ? HIGH : LOW);
    }
}

// Call every loop tick — blinks Blue while waiting for RFID response.
void updateBlueLed() {
    if (rfidState == RFID_WAITING_RESPONSE) {
        digitalWrite(PIN_LED_BLUE, (millis() % 400) < 200 ? HIGH : LOW);
    } else {
        digitalWrite(PIN_LED_BLUE, LOW);
    }
}

// =============================================================================
// Buzzer (non-blocking step sequencer)
// =============================================================================

void buzzerPlay(const BuzzStep* seq) {
    buzzerSeq  = seq;
    buzzerStep = 0;
    digitalWrite(PIN_BUZZER, seq[0].on ? HIGH : LOW);
    buzzerNextMs = millis() + seq[0].ms;
}

// Call every loop tick — advances the buzzer sequence without blocking.
void updateBuzzer() {
    if (!buzzerSeq) return;
    if (millis() < buzzerNextMs) return;

    buzzerStep++;
    if (buzzerSeq[buzzerStep].ms == 0) {
        digitalWrite(PIN_BUZZER, LOW);
        buzzerSeq = nullptr;
        return;
    }
    digitalWrite(PIN_BUZZER, buzzerSeq[buzzerStep].on ? HIGH : LOW);
    buzzerNextMs = millis() + buzzerSeq[buzzerStep].ms;
}

// =============================================================================
// WiFi Setup — Captive Portal
// =============================================================================

// Enters WiFi setup mode. Opens an AP + captive portal, then restarts.
// Triggered on first boot (no saved WiFi) or by 5-second button hold.
void startWiFiSetup() {
    Serial.println("[Setup] Entering WiFi setup mode...");
    digitalWrite(PIN_LED_BLUE, HIGH); // Blue ON = setup mode active

    WiFiManager wm;
    wm.setConfigPortalTimeout(0); // Never auto-close

    Serial.printf("[Setup] AP: '%s'  → connect and open 192.168.4.1\n", apName.c_str());
    wm.startConfigPortal(apName.c_str()); // Blocks until user submits form

    Serial.println("[Setup] WiFi credentials saved. Restarting...");
    delay(500);
    ESP.restart();
}

// =============================================================================
// MQTT
// =============================================================================

void mqttCallback(char* topic, byte* payload, unsigned int length) {
    // Encrypted response wire format: { "ct": "<base64 RSA-OAEP ciphertext>" }
    if (length > 600) length = 600;
    char buf[601];
    memcpy(buf, payload, length);
    buf[length] = '\0';

    Serial.printf("[MQTT] ← %s (encrypted response received)\n", topic);

    // Parse outer envelope
    StaticJsonDocument<512> outer;
    if (deserializeJson(outer, buf) != DeserializationError::Ok) {
        Serial.println("[MQTT] JSON parse error on response");
        return;
    }
    const char* ct = outer["ct"] | nullptr;
    if (!ct) { Serial.println("[MQTT] Missing ct field in response"); return; }

    // Base64-decode ciphertext
    unsigned char ciphertext[256];
    size_t cipherLen = 0;
    if (mbedtls_base64_decode(ciphertext, sizeof(ciphertext), &cipherLen,
                              (const unsigned char*)ct, strlen(ct)) != 0) {
        Serial.println("[MQTT] Base64 decode failed");
        return;
    }

    // Load device private key from NVS
    prefs.begin(PREFS_NAMESPACE, true);
    String privKeyPem = prefs.getString(PREFS_KEY_DEVICE_PRIV, "");
    prefs.end();
    if (privKeyPem.isEmpty()) { Serial.println("[MQTT] No private key in NVS"); return; }

    // RSA-OAEP decrypt response
    mbedtls_pk_context        pk;
    mbedtls_entropy_context   entropy;
    mbedtls_ctr_drbg_context  ctr_drbg;

    mbedtls_pk_init(&pk);
    mbedtls_entropy_init(&entropy);
    mbedtls_ctr_drbg_init(&ctr_drbg);

    const char* pers = "acs_dec";
    mbedtls_ctr_drbg_seed(&ctr_drbg, mbedtls_entropy_func, &entropy,
                           (const unsigned char*)pers, strlen(pers));
    mbedtls_pk_parse_key(&pk,
        (const unsigned char*)privKeyPem.c_str(), privKeyPem.length() + 1,
        nullptr, 0, mbedtls_ctr_drbg_random, &ctr_drbg);

    unsigned char plaintext[256];
    size_t plainLen = 0;
    int rc = mbedtls_pk_decrypt(&pk,
        ciphertext, cipherLen,
        plaintext, &plainLen, sizeof(plaintext),
        mbedtls_ctr_drbg_random, &ctr_drbg);

    mbedtls_pk_free(&pk);
    mbedtls_entropy_free(&entropy);
    mbedtls_ctr_drbg_free(&ctr_drbg);

    if (rc != 0) {
        Serial.printf("[MQTT] RSA decrypt failed: -0x%04X\n", (unsigned int)-rc);
        return;
    }
    plaintext[plainLen] = '\0';

    // Parse decrypted JSON: { "accessGranted": bool, "reason": "...", "traceId": "..." }
    StaticJsonDocument<256> resp;
    if (deserializeJson(resp, (char*)plaintext) != DeserializationError::Ok) {
        Serial.println("[MQTT] Decrypted payload is not valid JSON");
        return;
    }

    accessGrantedFlag      = resp["accessGranted"] | false;
    accessResponseReceived = true;

    const char* reason  = resp["reason"]  | "unknown";
    const char* traceId = resp["traceId"] | "n/a";
    Serial.printf("[MQTT] Response: %s — reason: %s  traceId: %s\n",
        accessGrantedFlag ? "GRANTED" : "DENIED", reason, traceId);
}

bool mqttConnect() {
    if (mqttClient.connected()) return true;

    unsigned long now = millis();
    if (now - mqttLastRetryMs < MQTT_RETRY_MS) return false; // Throttle retries
    mqttLastRetryMs = now;

    Serial.printf("[MQTT] Connecting to %s:%d as '%s'...\n",
        MQTT_BROKER, MQTT_PORT, deviceId.c_str());

    wifiClient.setCACert(ROOT_CA);           // Verify broker TLS cert against ISRG Root X1
    mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
    mqttClient.setBufferSize(600);           // Encrypted ct field is ~380 bytes + JSON overhead
    mqttClient.setSocketTimeout(5);          // TLS handshake needs more time than plain TCP
    mqttClient.setCallback(mqttCallback);

    if (mqttClient.connect(deviceId.c_str(), MQTT_USER, MQTT_PASS)) {
        Serial.println("[MQTT] Connected.");
        mqttClient.subscribe(subscribedTopic.c_str());
        Serial.printf("[MQTT] Subscribed to: %s\n", subscribedTopic.c_str());
        return true;
    }

    Serial.printf("[MQTT] Failed (rc=%d). Retrying in %ds.\n",
        mqttClient.state(), MQTT_RETRY_MS / 1000);
    return false;
}

// =============================================================================
// RFID
// =============================================================================

// Reads a card UID as an uppercase hex string (e.g. "A3F29C01").
// Returns "" if no card is present.
String readRfidUid() {
    if (!rfid.PICC_IsNewCardPresent()) return "";
    if (!rfid.PICC_ReadCardSerial())   return "";

    String uid = "";
    for (byte i = 0; i < rfid.uid.size; i++) {
        if (rfid.uid.uidByte[i] < 0x10) uid += "0"; // Zero-pad
        uid += String(rfid.uid.uidByte[i], HEX);
    }
    uid.toUpperCase();

    // Always halt + stop crypto after read — prevents same card being returned every tick.
    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();

    return uid;
}

void publishAccessRequest(const String &uid) {
    if (!cryptoReady) {
        Serial.println("[RFID] Crypto not ready — key pair missing. Cannot publish.");
        denyAccess();
        return;
    }

    // ── 1. Build inner plaintext: { "member": "...", "exp": ... } ─────────────
    char innerBuf[128] = {};
    {
        StaticJsonDocument<128> inner;
        inner["member"] = uid;
        inner["exp"]    = (long)time(nullptr);
        serializeJson(inner, innerBuf, sizeof(innerBuf));
    }

    // ── 2. Encrypt inner payload with server's RSA public key (OAEP) ──────────
    mbedtls_pk_context        pk;
    mbedtls_entropy_context   entropy;
    mbedtls_ctr_drbg_context  ctr_drbg;

    mbedtls_pk_init(&pk);
    mbedtls_entropy_init(&entropy);
    mbedtls_ctr_drbg_init(&ctr_drbg);

    const char* pers = "acs_enc";
    mbedtls_ctr_drbg_seed(&ctr_drbg, mbedtls_entropy_func, &entropy,
                           (const unsigned char*)pers, strlen(pers));

    // Copy server public key from PROGMEM to RAM for mbedTLS
    String srvPub = String(SERVER_PUBLIC_KEY);
    mbedtls_pk_parse_public_key(&pk,
        (const unsigned char*)srvPub.c_str(), srvPub.length() + 1);

    unsigned char ciphertext[256] = {};   // RSA-2048 output is always 256 bytes
    size_t outLen = 0;
    int rc = mbedtls_pk_encrypt(&pk,
        (const unsigned char*)innerBuf, strlen(innerBuf),
        ciphertext, &outLen, sizeof(ciphertext),
        mbedtls_ctr_drbg_random, &ctr_drbg);

    mbedtls_pk_free(&pk);
    mbedtls_entropy_free(&entropy);
    mbedtls_ctr_drbg_free(&ctr_drbg);

    if (rc != 0) {
        Serial.printf("[RFID] RSA encrypt failed: -0x%04X\n", (unsigned int)-rc);
        denyAccess();
        return;
    }

    // ── 3. Base64-encode ciphertext → 344-char string ─────────────────────────
    unsigned char b64Buf[512] = {};
    size_t b64Len = 0;
    mbedtls_base64_encode(b64Buf, sizeof(b64Buf), &b64Len, ciphertext, outLen);
    b64Buf[b64Len] = '\0';

    // ── 4. Build outer wire JSON: { "device": "...", "ct": "..." } ─────────────
    // Total size: ~380 bytes — within mqttClient.setBufferSize(600)
    DynamicJsonDocument doc(600);
    doc["device"] = deviceId;
    doc["ct"]     = (char*)b64Buf;

    char wireBuf[600] = {};
    serializeJson(doc, wireBuf, sizeof(wireBuf));

    Serial.printf("[RFID] → %s (encrypted)\n", MQTT_PUBLISH_TOPIC);
    mqttClient.publish(MQTT_PUBLISH_TOPIC, wireBuf);
}

// =============================================================================
// Lock Control
// =============================================================================

void unlockDoor() {
    Serial.println("[Lock] UNLOCKED — door open for 5 seconds.");
    digitalWrite(PIN_LOCK, HIGH);
    lockOpenUntilMs = millis() + LOCK_OPEN_MS;
    buzzerPlay(BUZZ_GRANTED); // 1 beep
}

void denyAccess() {
    Serial.println("[Lock] DENIED — door stays locked.");
    digitalWrite(PIN_LOCK, LOW);
    buzzerPlay(BUZZ_DENIED); // 2 beeps
}

// Called every loop — relocks automatically after LOCK_OPEN_MS.
void checkAutoRelock() {
    if (lockOpenUntilMs > 0 && millis() >= lockOpenUntilMs) {
        Serial.println("[Lock] Auto-relocking.");
        digitalWrite(PIN_LOCK, LOW);
        lockOpenUntilMs = 0;
    }
}

// =============================================================================
// RFID State Machine
// =============================================================================

void handleRfidStateMachine() {
    switch (rfidState) {

        case RFID_IDLE: {
            String uid = readRfidUid();
            if (uid.isEmpty()) return;

            // Debounce: ignore same card tapped again within 2s
            if (uid == pendingUid && (millis() - lastRfidReadMs) < RFID_DEBOUNCE_MS) {
                return;
            }

            Serial.printf("[RFID] Card: %s\n", uid.c_str());
            lastCardUid            = uid;
            pendingUid             = uid;
            lastRfidReadMs         = millis();
            accessResponseReceived = false;
            accessGrantedFlag      = false;

            if (!mqttClient.connected()) {
                Serial.println("[RFID] No MQTT — denying.");
                denyAccess();
                return;
            }

            publishAccessRequest(uid);
            rfidState = RFID_WAITING_RESPONSE; // Blue LED blink starts in updateBlueLed()
            break;
        }

        case RFID_WAITING_RESPONSE: {
            mqttClient.loop(); // Pump MQTT receive buffer — triggers mqttCallback

            if (accessResponseReceived) {
                if (accessGrantedFlag) {
                    Serial.println("[RFID] GRANTED.");
                    lastAccessResult = "GRANTED";
                    unlockDoor();
                } else {
                    lastAccessResult = "DENIED";
                    denyAccess();
                }
                rfidState = RFID_IDLE; // Blue LED turns off in updateBlueLed()
                return;
            }

            // No server response within timeout — fail safe (deny)
            if (millis() - lastRfidReadMs > ACCESS_TIMEOUT_MS) {
                Serial.println("[RFID] Timeout — no server response.");
                lastAccessResult = "TIMEOUT";
                denyAccess();
                rfidState = RFID_IDLE;
            }
            break;
        }
    }
}

// =============================================================================
// Web Dashboard — http://<device-ip>/
// HTML is sent in small F() chunks — nothing large sits in RAM.
// Page auto-refreshes every 4 seconds.
// =============================================================================

void handleRoot() {
    // Uptime
    unsigned long secs = (millis() - bootMs) / 1000;
    unsigned long mins = secs / 60; secs %= 60;
    unsigned long hrs  = mins / 60; mins %= 60;
    char uptime[16];
    snprintf(uptime, sizeof(uptime), "%02luh %02lum %02lus", hrs, mins, secs);

    bool wifiOk = (WiFi.status() == WL_CONNECTED);
    bool mqttOk = mqttClient.connected();
    bool locked = (lockOpenUntilMs == 0);

    webServer.setContentLength(CONTENT_LENGTH_UNKNOWN);
    webServer.send(200, F("text/html"), "");

    // Head
    webServer.sendContent(F(
        "<!DOCTYPE html><html><head>"
        "<meta charset='UTF-8'>"
        "<meta http-equiv='refresh' content='4'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<title>ACS Device</title>"
        "<style>"
        "body{font-family:monospace;background:#111;color:#ddd;padding:16px;max-width:500px;margin:auto}"
        "h2{color:#4af;margin:0 0 4px}p.sub{color:#555;margin:0 0 20px;font-size:.85em}"
        "h4{color:#888;margin:14px 0 6px;text-transform:uppercase;font-size:.75em;letter-spacing:1px}"
        "table{width:100%;border-collapse:collapse;margin-bottom:8px}"
        "td{padding:5px 8px;border-bottom:1px solid #222;font-size:.9em}"
        "td:first-child{color:#666;width:45%}"
        ".ok{color:#4f4}.err{color:#f55}.warn{color:#fa4}.dim{color:#555}"
        "</style></head><body>"
    ));

    webServer.sendContent(F("<h2>Access Control Device</h2>"));
    webServer.sendContent("<p class='sub'>Auto-refresh every 4s &nbsp;|&nbsp; IP: " + WiFi.localIP().toString() + "</p>");

    // --- Boot Checklist ---
    webServer.sendContent(F("<h4>Boot Checklist</h4><table>"));
    webServer.sendContent(F("<tr><td>Power</td><td class='ok'>&#10003; ON</td></tr>"));
    webServer.sendContent(rfidReady
        ? F("<tr><td>RFID Reader</td><td class='ok'>&#10003; Ready</td></tr>")
        : F("<tr><td>RFID Reader</td><td class='err'>&#10007; Not ready</td></tr>"));
    webServer.sendContent(wifiOk
        ? F("<tr><td>WiFi</td><td class='ok'>&#10003; Connected</td></tr>")
        : F("<tr><td>WiFi</td><td class='err'>&#10007; Not connected</td></tr>"));
    webServer.sendContent(ntpSynced
        ? F("<tr><td>NTP Time</td><td class='ok'>&#10003; Synced</td></tr>")
        : F("<tr><td>NTP Time</td><td class='warn'>&#9888; Not synced</td></tr>"));
    webServer.sendContent(mqttOk
        ? F("<tr><td>MQTT Broker</td><td class='ok'>&#10003; Connected</td></tr>")
        : F("<tr><td>MQTT Broker</td><td class='err'>&#10007; Not connected</td></tr>"));
    webServer.sendContent(F("</table>"));

    // --- Device Info ---
    webServer.sendContent(F("<h4>Device Info</h4><table>"));
    webServer.sendContent("<tr><td>Device ID</td><td>" + deviceId + "</td></tr>");
    webServer.sendContent("<tr><td>Uptime</td><td>" + String(uptime) + "</td></tr>");
    webServer.sendContent(F("</table>"));

    // --- Crypto / Key Registration ---
    webServer.sendContent(F("<h4>Crypto / Registration</h4><table>"));
    if (cryptoReady) {
        webServer.sendContent(F("<tr><td>Key Status</td><td class='ok'>&#10003; Key pair ready</td></tr>"));
        webServer.sendContent(F("<tr><td>Public Key</td><td>"
            "<details><summary style='cursor:pointer;color:#4af'>Show &amp; copy to admin panel</summary>"
            "<pre style='font-size:.65em;word-break:break-all;white-space:pre-wrap;color:#aaa;margin:4px 0'>"));
        webServer.sendContent(devicePublicKeyPem);
        webServer.sendContent(F("</pre></details></td></tr>"));
    } else {
        webServer.sendContent(F("<tr><td>Key Status</td><td class='warn'>&#9888; Generating key pair... (blue LED on)</td></tr>"));
    }
    webServer.sendContent(F("</table>"));

    // --- Network ---
    webServer.sendContent(F("<h4>Network</h4><table>"));
    webServer.sendContent("<tr><td>WiFi SSID</td><td>" +
        (wifiOk ? WiFi.SSID() : String("<span class='err'>—</span>")) + "</td></tr>");
    webServer.sendContent("<tr><td>Signal</td><td>" +
        (wifiOk ? String(WiFi.RSSI()) + " dBm" : String("<span class='err'>—</span>")) + "</td></tr>");
    webServer.sendContent("<tr><td>MQTT Broker</td><td>" MQTT_BROKER ":" + String(MQTT_PORT) + "</td></tr>");
    webServer.sendContent("<tr><td>MQTT Status</td><td class='" +
        String(mqttOk ? "ok'>Connected" : "err'>Retrying (rc=") +
        String(mqttOk ? "" : String(mqttClient.state()) + ")") + "</td></tr>");
    webServer.sendContent(F("</table>"));

    // --- Last Activity ---
    webServer.sendContent(F("<h4>Last Activity</h4><table>"));
    webServer.sendContent("<tr><td>Card UID</td><td>" +
        (lastCardUid.isEmpty() ? "<span class='dim'>None yet</span>" : lastCardUid) + "</td></tr>");

    String resClass = "dim", resText = "None yet";
    if      (lastAccessResult == "GRANTED") { resClass = "ok";   resText = "&#10003; GRANTED"; }
    else if (lastAccessResult == "DENIED")  { resClass = "err";  resText = "&#10007; DENIED";  }
    else if (lastAccessResult == "TIMEOUT") { resClass = "warn"; resText = "&#9888; TIMEOUT";  }
    webServer.sendContent("<tr><td>Result</td><td class='" + resClass + "'>" + resText + "</td></tr>");
    webServer.sendContent("<tr><td>Door Lock</td><td class='" +
        String(locked ? "ok'>Locked" : "warn'>Unlocked") + "</td></tr>");
    webServer.sendContent(F("</table>"));

    webServer.sendContent(F("</body></html>"));
    webServer.sendContent(""); // Terminate chunked transfer
}

// =============================================================================
// Setup Button — Long Press (non-blocking)
// =============================================================================

void handleSetupButton() {
    bool pressed = (digitalRead(PIN_SETUP_BTN) == LOW); // LOW = pressed (INPUT_PULLUP)

    if (pressed) {
        if (setupBtnPressedAt == 0) {
            setupBtnPressedAt = millis();
        } else if (millis() - setupBtnPressedAt >= SETUP_HOLD_MS) {
            setupBtnPressedAt = 0;
            Serial.println("[Button] Long press — entering WiFi setup.");
            startWiFiSetup(); // Blocks, then restarts
        }
    } else {
        setupBtnPressedAt = 0; // Released — reset timer
    }
}

// =============================================================================
// setup()
// =============================================================================

void setup() {
    Serial.begin(115200);
    delay(100);
    Serial.println("\n==============================");
    Serial.println("  Access Control System");
    Serial.println("==============================");

    // LEDs and buzzer
    pinMode(PIN_LED_RED,    OUTPUT); digitalWrite(PIN_LED_RED,    LOW);
    pinMode(PIN_LED_GREEN,  OUTPUT); digitalWrite(PIN_LED_GREEN,  LOW);
    pinMode(PIN_LED_YELLOW, OUTPUT); digitalWrite(PIN_LED_YELLOW, HIGH); // Always ON — power indicator
    pinMode(PIN_LED_BLUE,   OUTPUT); digitalWrite(PIN_LED_BLUE,   LOW);
    pinMode(PIN_BUZZER,     OUTPUT); digitalWrite(PIN_BUZZER,     LOW);

    // Lock and setup button
    pinMode(PIN_LOCK,      OUTPUT); digitalWrite(PIN_LOCK,      LOW); // Locked on boot
    pinMode(PIN_SETUP_BTN, INPUT_PULLUP);

    // Boot beep — drive pin directly (loop() not running yet, updateBuzzer() won't fire)
    // This prevents the buzzer staying HIGH through the entire WiFi/NTP phase.
    digitalWrite(PIN_BUZZER, HIGH);
    delay(800);
    digitalWrite(PIN_BUZZER, LOW);

    // SPI + RFID
    SPI.begin(PIN_RFID_SCK, PIN_RFID_MISO, PIN_RFID_MOSI, PIN_RFID_SDA);
    rfid.PCD_Init();
    rfidReady = true;
    Serial.println("[RFID] RC522 ready.");

    // Device ID = MAC address (factory-burned, globally unique)
    WiFi.mode(WIFI_STA);
    deviceId = getMacDeviceId();
    Serial.printf("[Device] ID: %s\n", deviceId.c_str());

    apName          = buildApName();
    subscribedTopic = String(MQTT_RESPONSE_BASE) + deviceId;

    Serial.println("[WiFi] Connecting...");
    {
        WiFiManager wm;
        wm.setConfigPortalTimeout(0); // Never auto-close portal

        if (!wm.autoConnect(apName.c_str())) {
            Serial.println("[WiFi] Could not connect — restarting.");
            ESP.restart();
        }
    }
    Serial.printf("[WiFi] Connected. IP: %s\n", WiFi.localIP().toString().c_str());

    // RSA key pair — generate on first boot, load on subsequent boots
    ensureKeyPair();

    // Web server starts immediately — reachable regardless of NTP/MQTT
    webServer.on("/", handleRoot);
    webServer.begin();
    bootMs = millis();
    Serial.printf("[Web] Dashboard at http://%s/\n", WiFi.localIP().toString().c_str());

    // NTP time sync (for the 'exp' timestamp inside encrypted access requests)
    configTime(0, 0, "pool.ntp.org", "time.cloudflare.com");
    Serial.print("[NTP] Syncing");
    unsigned long ntpStart = millis();
    while (time(nullptr) < 1000000000UL) {
        if (millis() - ntpStart > NTP_TIMEOUT_MS) {
            Serial.println(" timed out (exp will be 0).");
            break;
        }
        webServer.handleClient(); // Stay responsive during NTP wait
        esp_task_wdt_reset();
        Serial.print(".");
        delay(300);
    }
    ntpSynced = (time(nullptr) >= 1000000000UL);
    if (ntpSynced) Serial.println(" synced.");

    // MQTT — non-blocking first attempt
    mqttConnect();
    Serial.printf("[NeyoFit] Ready. Device: %s\n", deviceId.c_str());
    Serial.println("Waiting for RFID card...");
}

// =============================================================================
// loop()
// =============================================================================

void loop() {
    webServer.handleClient();
    updateBuzzer();
    updateNetworkLeds(); // Runs every tick — handles Red blink pattern
    updateBlueLed();
    checkAutoRelock();
    handleSetupButton();
    if (!mqttClient.connected()) {
        mqttConnect(); // Throttled internally — tries every 5s
    } else {
        if (rfidState == RFID_IDLE) {
            mqttClient.loop(); // Pump MQTT when idle
        }
    }
    handleRfidStateMachine();
}
