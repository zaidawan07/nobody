function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function fromHex(value: string): Uint8Array {
  if (value.length % 2 || !/^[a-f0-9]*$/i.test(value))
    throw new Error("Invalid encrypted WhatsApp credential.");
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16));
}

async function encryptionKey(): Promise<CryptoKey> {
  const encoded = process.env["WHATSAPP_TOKEN_ENCRYPTION_KEY"];
  if (!encoded) throw new Error("WhatsApp token encryption is not configured.");
  const raw = fromBase64(encoded);
  if (raw.length !== 32)
    throw new Error("WhatsApp token encryption key must be 32 bytes (base64).");
  return crypto.subtle.importKey(
    "raw",
    new Uint8Array(raw).buffer as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptWhatsappToken(token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, tagLength: 128 },
      await encryptionKey(),
      new TextEncoder().encode(token),
    ),
  );
  const ciphertext = encrypted.slice(0, -16);
  const authTag = encrypted.slice(-16);
  return {
    ciphertext: `\\x${toHex(ciphertext)}`,
    iv: `\\x${toHex(iv)}`,
    auth_tag: `\\x${toHex(authTag)}`,
  };
}

export async function decryptWhatsappToken(row: {
  ciphertext: string;
  iv: string;
  auth_tag: string;
}): Promise<string> {
  const iv = fromHex(row.iv.replace(/^\\x/, ""));
  const ciphertext = fromHex(row.ciphertext.replace(/^\\x/, ""));
  const authTag = fromHex(row.auth_tag.replace(/^\\x/, ""));
  const combined = new Uint8Array(ciphertext.length + authTag.length);
  combined.set(ciphertext);
  combined.set(authTag, ciphertext.length);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(iv).buffer as ArrayBuffer, tagLength: 128 },
    await encryptionKey(),
    new Uint8Array(combined).buffer as ArrayBuffer,
  );
  return new TextDecoder().decode(plain);
}

export async function hashWhatsappSignupState(value: string): Promise<string> {
  return toHex(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
  );
}
