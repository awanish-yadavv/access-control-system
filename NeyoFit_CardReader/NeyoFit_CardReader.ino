// NeyoFit Card Reader — UID provisioning tool for the access control system.
// Standalone firmware for the SAME ESP32 device hardware as NeyoFit_Access.ino.
// Flash this temporarily to harvest card UIDs, then re-flash NeyoFit_Access.ino.
//
// Hardware: identical to the production device — no rewiring needed.
//   RC522 SDA  -> GPIO 5
//   RC522 RST  -> GPIO 22
//   RC522 SCK  -> GPIO 18
//   RC522 MISO -> GPIO 19
//   RC522 MOSI -> GPIO 23
//   LED Yellow -> GPIO 27   (power on)
//   LED Blue   -> GPIO 14   (RFID activity flash)
//   LED Red    -> GPIO 25   (RC522 fault indicator)
//   LED Green  -> GPIO 26   (ready)
//   Buzzer     -> GPIO 33   (single beep on read)
//
// Required Arduino library (Library Manager):
//   - MFRC522 by GithubCommunity v1.4.x
// Board: any ESP32 dev board (e.g. "ESP32 Dev Module").
//
// Usage:
//   1. Open Tools -> Erase All Flash Before Sketch Upload -> All Flash Contents
//      (clean slate, prevents leftover state from production firmware)
//   2. Upload this sketch
//   3. Open Serial Monitor at 115200 baud
//   4. Tap cards — copy the UID into the dashboard's Add Card form
//   5. When done, set Erase All Flash again and re-upload NeyoFit_Access.ino

#include <SPI.h>
#include <MFRC522.h>

#define PIN_RFID_SDA    5
#define PIN_RFID_RST   22
#define PIN_RFID_SCK   18
#define PIN_RFID_MISO  19
#define PIN_RFID_MOSI  23

#define PIN_LED_RED    25
#define PIN_LED_GREEN  26
#define PIN_LED_YELLOW 27
#define PIN_LED_BLUE   14
#define PIN_BUZZER     33

#define DEBOUNCE_MS  2000
#define BAUD_RATE    115200

MFRC522 rfid(PIN_RFID_SDA, PIN_RFID_RST);

String        lastUid    = "";
unsigned long lastReadMs = 0;
uint32_t      cardCount  = 0;

String formatUid() {
    String uid = "";
    for (byte i = 0; i < rfid.uid.size; i++) {
        if (rfid.uid.uidByte[i] < 0x10) uid += "0";
        uid += String(rfid.uid.uidByte[i], HEX);
    }
    uid.toUpperCase();
    return uid;
}

const char* describeCardType(MFRC522::PICC_Type t) {
    switch (t) {
        case MFRC522::PICC_TYPE_MIFARE_MINI: return "MIFARE Mini (320 B)";
        case MFRC522::PICC_TYPE_MIFARE_1K:   return "MIFARE Classic 1K";
        case MFRC522::PICC_TYPE_MIFARE_4K:   return "MIFARE Classic 4K";
        case MFRC522::PICC_TYPE_MIFARE_UL:   return "MIFARE Ultralight / NTAG";
        case MFRC522::PICC_TYPE_MIFARE_PLUS: return "MIFARE Plus";
        case MFRC522::PICC_TYPE_TNP3XXX:     return "MIFARE TNP3XXX";
        case MFRC522::PICC_TYPE_ISO_14443_4: return "ISO 14443-4";
        case MFRC522::PICC_TYPE_ISO_18092:   return "ISO 18092 / NFC";
        default:                             return "Unknown";
    }
}

void beep(uint16_t ms) {
    digitalWrite(PIN_BUZZER, HIGH);
    delay(ms);
    digitalWrite(PIN_BUZZER, LOW);
}

void flashBlue(uint16_t ms) {
    digitalWrite(PIN_LED_BLUE, HIGH);
    delay(ms);
    digitalWrite(PIN_LED_BLUE, LOW);
}

void printBanner() {
    Serial.println();
    Serial.println(F("================================================================"));
    Serial.println(F(" NeyoFit Card Reader  -  UID provisioning tool  (ESP32)"));
    Serial.println(F(" Tap an RFID card on the RC522 reader."));
    Serial.println(F(" Backend expects: uppercase hex, no separators (e.g. A3F29C01)"));
    Serial.println(F("================================================================"));
    Serial.println();
}

void printCardDetails(const String &uid, MFRC522::PICC_Type type) {
    cardCount++;

    char shortLabel[16] = {};
    snprintf(shortLabel, sizeof(shortLabel), "ACS-%.4s", uid.c_str());

    Serial.println(F("----------------------------------------------------------------"));
    Serial.printf( " CARD #%lu\n", (unsigned long)cardCount);
    Serial.println(F("----------------------------------------------------------------"));
    Serial.printf( " UID (hex)        : %s\n", uid.c_str());
    Serial.printf( " UID size         : %d bytes\n", rfid.uid.size);
    Serial.printf( " Card type        : %s\n", describeCardType(type));
    Serial.printf( " SAK              : 0x%02X\n", rfid.uid.sak);
    Serial.println(F("----------------------------------------------------------------"));
    Serial.printf( " Print on card    : %s\n", uid.c_str());
    Serial.printf( " Short label      : %s\n", shortLabel);
    Serial.printf( " JSON for API     : {\"uid\":\"%s\"}\n", uid.c_str());
    Serial.printf( " curl example     : curl -X POST $API/cards \\\n"
                   "                      -H 'Authorization: Bearer $TOKEN' \\\n"
                   "                      -H 'Content-Type: application/json' \\\n"
                   "                      -d '{\"uid\":\"%s\"}'\n", uid.c_str());
    Serial.println(F("----------------------------------------------------------------"));
    Serial.println();
}

void setup() {
    Serial.begin(BAUD_RATE);
    delay(200);

    pinMode(PIN_LED_RED,    OUTPUT);
    pinMode(PIN_LED_GREEN,  OUTPUT);
    pinMode(PIN_LED_YELLOW, OUTPUT);
    pinMode(PIN_LED_BLUE,   OUTPUT);
    pinMode(PIN_BUZZER,     OUTPUT);

    digitalWrite(PIN_LED_RED,    LOW);
    digitalWrite(PIN_LED_GREEN,  LOW);
    digitalWrite(PIN_LED_BLUE,   LOW);
    digitalWrite(PIN_BUZZER,     LOW);
    digitalWrite(PIN_LED_YELLOW, HIGH);

    SPI.begin(PIN_RFID_SCK, PIN_RFID_MISO, PIN_RFID_MOSI, PIN_RFID_SDA);
    rfid.PCD_Init();

    byte v = rfid.PCD_ReadRegister(MFRC522::VersionReg);
    if (v == 0x00 || v == 0xFF) {
        Serial.println(F("[ERROR] RC522 not detected. Check SPI wiring."));
        digitalWrite(PIN_LED_RED, HIGH);
    } else {
        Serial.printf("[OK] RC522 detected. VersionReg=0x%02X\n", v);
        digitalWrite(PIN_LED_GREEN, HIGH);
    }

    printBanner();
}

void loop() {
    if (!rfid.PICC_IsNewCardPresent()) return;
    if (!rfid.PICC_ReadCardSerial())   return;

    String uid = formatUid();

    if (uid == lastUid && (millis() - lastReadMs) < DEBOUNCE_MS) {
        rfid.PICC_HaltA();
        rfid.PCD_StopCrypto1();
        return;
    }
    lastUid    = uid;
    lastReadMs = millis();

    MFRC522::PICC_Type type = rfid.PICC_GetType(rfid.uid.sak);
    printCardDetails(uid, type);

    flashBlue(80);
    beep(60);

    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
}
