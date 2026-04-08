import mqtt, { MqttClient } from 'mqtt';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { AppDataSource } from '../data-source';
import { Device } from '../device/device.entity';
import { Card } from '../card/card.entity';
import { Tenant } from '../tenant/tenant.entity';
import { AccessLog } from '../access-log/access-log.entity';
import { tenantHasActiveSubscription } from './tenant-schema.service';
import { emitAccessEvent } from './socket.service';

const TOPIC_INBOUND  = 'acs/access';
const TOPIC_RESPONSE = (deviceId: string) => `acs/response/${deviceId}`;
const MAX_AGE_SECONDS = 30;

// ── Wire formats ─────────────────────────────────────────────────────────────
// Outer envelope received from device (device MAC stays cleartext for routing)
interface WirePayload {
  device: string;  // MAC without colons e.g. "AABBCCDDEEFF"
  ct:     string;  // base64(RSA-OAEP-Encrypt(serverPublicKey, InnerPayload))
}

// Inner payload decrypted from ct
interface InnerPayload {
  member: string;  // card UID uppercase hex e.g. "A3F29C01"
  exp:    number;  // Unix timestamp from NTP (replay protection)
}

interface AccessResponse {
  accessGranted: boolean;
  reason:        string;
  traceId:       string;
}

// Convert "AABBCCDDEEFF" → "AA:BB:CC:DD:EE:FF"
const normalizeMac = (raw: string): string =>
  raw.replace(/:/g, '').toUpperCase().match(/.{2}/g)!.join(':');

// ── Server RSA private key ────────────────────────────────────────────────────
let serverPrivateKey: crypto.KeyObject;

const loadServerPrivateKey = (): crypto.KeyObject => {
  const raw = process.env.SERVER_RSA_PRIVATE_KEY;
  if (!raw) throw new Error('[MQTT] SERVER_RSA_PRIVATE_KEY env var is not set');
  return crypto.createPrivateKey(raw.replace(/\\n/g, '\n'));
};

let client: MqttClient;

export const initMQTT = (): void => {
  // Load + validate server private key at startup — fail fast if missing
  serverPrivateKey = loadServerPrivateKey();
  console.log('[MQTT] Server RSA private key loaded');

  const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
  client = mqtt.connect(brokerUrl, {
    clientId: `acs-backend-${uuidv4().slice(0, 8)}`,
    clean: true,
    reconnectPeriod: 5000,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
  });

  client.on('connect', () => {
    console.log(`[MQTT] Connected to ${brokerUrl}`);
    client.subscribe(TOPIC_INBOUND, { qos: 0 }, (err) => {
      if (err) console.error('[MQTT] Subscribe error:', err);
      else console.log(`[MQTT] Subscribed to ${TOPIC_INBOUND}`);
    });
  });

  client.on('reconnect', () => console.log('[MQTT] Reconnecting...'));
  client.on('error', (err) => console.error('[MQTT] Error:', err.message));

  client.on('message', async (topic, messageBuffer) => {
    if (topic !== TOPIC_INBOUND) return;
    try {
      await handleAccessRequest(messageBuffer.toString());
    } catch (err) {
      console.error('[MQTT] Unhandled error in access handler:', err);
    }
  });

  console.log('[MQTT] MQTT service initialized');
};

async function handleAccessRequest(raw: string): Promise<void> {
  const traceId = uuidv4();

  // ── 1. Parse outer wire envelope ─────────────────────────────────────────
  let wire: WirePayload;
  try {
    wire = JSON.parse(raw);
  } catch {
    console.warn('[MQTT] Malformed JSON:', raw);
    return;
  }

  if (!wire.device || !wire.ct) {
    console.warn('[MQTT] Missing device or ct field');
    return;
  }

  const rawMac     = wire.device;
  const macAddress = normalizeMac(rawMac);

  // ── 2. Look up device — get tenantId and publicKey ────────────────────────
  const deviceRepo = AppDataSource.getRepository(Device);
  const device     = await deviceRepo.findOne({ where: { macAddress } });

  if (!device) {
    console.warn(`[MQTT] Unknown device MAC: ${macAddress}`);
    return; // Cannot send response — no public key to encrypt with
  }

  if (!device.publicKey) {
    console.warn(`[MQTT] Device ${macAddress} has no public key registered — cannot respond`);
    return;
  }

  // Mark device online
  device.status   = 'online';
  device.lastSeen = new Date();
  await deviceRepo.save(device);

  // ── 3. Decrypt inner payload with server's private key (RSA-OAEP) ─────────
  let inner: InnerPayload;
  try {
    const ciphertext = Buffer.from(wire.ct, 'base64');
    const plaintext  = crypto.privateDecrypt(
      { key: serverPrivateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
      ciphertext,
    );
    inner = JSON.parse(plaintext.toString('utf8'));
  } catch (err) {
    console.warn('[MQTT] Decryption failed:', err);
    await log(device.id, '(encrypted)', device.tenantId ?? '', null, 'denied', 'DECRYPTION_FAILED', traceId);
    return respond(rawMac, device.publicKey, false, 'DECRYPTION_FAILED', traceId);
  }

  const { member: cardUid, exp } = inner;

  // ── 4. Replay protection ──────────────────────────────────────────────────
  const ageSecs = Date.now() / 1000 - exp;
  if (ageSecs > MAX_AGE_SECONDS || ageSecs < -5) {
    return respond(rawMac, device.publicKey, false, 'EXPIRED_TIMESTAMP', traceId);
  }

  // ── 5. Resolve tenant from device record (not from payload) ──────────────
  const tenantId = device.tenantId;
  if (!tenantId) {
    await log(device.id, cardUid, '', null, 'denied', 'DEVICE_UNASSIGNED', traceId);
    return respond(rawMac, device.publicKey, false, 'DEVICE_UNASSIGNED', traceId);
  }

  // ── 6. Verify tenant exists and is active ────────────────────────────────
  const tenantRepo = AppDataSource.getRepository(Tenant);
  const tenant     = await tenantRepo.findOne({ where: { id: tenantId, status: 'active' } });
  if (!tenant) {
    await log(device.id, cardUid, tenantId, null, 'denied', 'TENANT_NOT_FOUND', traceId);
    return respond(rawMac, device.publicKey, false, 'TENANT_NOT_FOUND', traceId);
  }

  // ── 7. Verify active subscription ────────────────────────────────────────
  const hasSubscription = await tenantHasActiveSubscription(tenantId).catch(() => false);
  if (!hasSubscription) {
    await log(device.id, cardUid, tenantId, null, 'denied', 'SUBSCRIPTION_EXPIRED', traceId);
    return respond(rawMac, device.publicKey, false, 'SUBSCRIPTION_EXPIRED', traceId);
  }

  // ── 8. Look up card ───────────────────────────────────────────────────────
  const cardRepo = AppDataSource.getRepository(Card);
  const card     = await cardRepo.findOne({ where: { uid: cardUid.toUpperCase() } });
  if (!card) {
    await log(device.id, cardUid, tenantId, null, 'denied', 'UNKNOWN_CARD', traceId);
    return respond(rawMac, device.publicKey, false, 'UNKNOWN_CARD', traceId);
  }

  // ── 9. Card must belong to this tenant ───────────────────────────────────
  if (card.tenantId !== tenantId) {
    await log(device.id, cardUid, tenantId, null, 'denied', 'CARD_NOT_ASSIGNED_TO_TENANT', traceId);
    return respond(rawMac, device.publicKey, false, 'CARD_NOT_ASSIGNED_TO_TENANT', traceId);
  }

  // ── 10. Card must be active ───────────────────────────────────────────────
  if (card.status !== 'active') {
    await log(device.id, cardUid, tenantId, card.assignedToId, 'denied', 'CARD_INACTIVE', traceId);
    return respond(rawMac, device.publicKey, false, 'CARD_INACTIVE', traceId);
  }

  // ── 11. Card must be assigned to a customer ──────────────────────────────
  if (!card.assignedToId) {
    await log(device.id, cardUid, tenantId, null, 'denied', 'CARD_UNASSIGNED', traceId);
    return respond(rawMac, device.publicKey, false, 'CARD_UNASSIGNED', traceId);
  }

  // ── 12. GRANT ─────────────────────────────────────────────────────────────
  await log(device.id, cardUid, tenantId, card.assignedToId, 'granted', 'ACCESS_GRANTED', traceId);
  respond(rawMac, device.publicKey, true, 'ACCESS_GRANTED', traceId);
}

function respond(
  rawMac: string,
  devicePublicKeyPem: string | null,
  accessGranted: boolean,
  reason: string,
  traceId: string,
): void {
  const topic    = TOPIC_RESPONSE(rawMac.replace(/:/g, '').toUpperCase());
  const response: AccessResponse = { accessGranted, reason, traceId };

  if (!devicePublicKeyPem) {
    // Fallback: plain JSON (device not yet registered — should not reach production)
    client.publish(topic, JSON.stringify(response), { qos: 0 });
    console.log(`[MQTT] → ${topic} | ${accessGranted ? 'GRANTED' : 'DENIED'} | ${reason} (unencrypted) | trace:${traceId}`);
    return;
  }

  try {
    const devicePubKey  = crypto.createPublicKey(devicePublicKeyPem);
    const plaintext     = Buffer.from(JSON.stringify(response), 'utf8');
    const ciphertext    = crypto.publicEncrypt(
      { key: devicePubKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING },
      plaintext,
    );
    client.publish(topic, JSON.stringify({ ct: ciphertext.toString('base64') }), { qos: 0 });
    console.log(`[MQTT] → ${topic} | ${accessGranted ? 'GRANTED' : 'DENIED'} | ${reason} (encrypted) | trace:${traceId}`);
  } catch (err) {
    console.error('[MQTT] Failed to encrypt response:', err);
  }
}

async function log(
  deviceId: string | null | undefined,
  cardUid: string,
  tenantId: string,
  userId: string | null | undefined,
  result: 'granted' | 'denied',
  reason: string,
  traceId: string,
): Promise<void> {
  try {
    const logRepo = AppDataSource.getRepository(AccessLog);
    const entry   = logRepo.create({
      deviceId: deviceId ?? null,
      cardUid,
      tenantId,
      userId: userId ?? null,
      result,
      reason,
      traceId,
    });
    await logRepo.save(entry);

    emitAccessEvent(tenantId, {
      id: entry.id,
      deviceId: entry.deviceId,
      cardUid,
      tenantId,
      userId: entry.userId,
      result,
      reason,
      traceId,
      timestamp: entry.timestamp,
    });
  } catch (err) {
    console.error('[MQTT] Failed to write access log:', err);
  }
}
