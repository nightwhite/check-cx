export interface EncryptedProviderKey {
  ciphertext: string;
  nonce: string;
  version: number;
}

function toBase64(value: ArrayBuffer | Uint8Array): string {
  return Buffer.from(value instanceof Uint8Array ? value : new Uint8Array(value)).toString(
    "base64"
  );
}

function fromBase64ArrayBuffer(value: string): ArrayBuffer {
  const buffer = Buffer.from(value, "base64");
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
}

function fromBase64Bytes(value: string) {
  return new Uint8Array(fromBase64ArrayBuffer(value));
}

async function importKey(rawKey: string): Promise<CryptoKey> {
  const bytes = new TextEncoder().encode(rawKey);
  if (![16, 24, 32].includes(bytes.byteLength)) {
    throw new Error("CONFIG_ENCRYPTION_KEY must be 16, 24, or 32 bytes");
  }
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptProviderKey(
  plaintext: string,
  rawKey: string,
  version = 1
): Promise<EncryptedProviderKey> {
  const key = await importKey(rawKey);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(plaintext)
  );

  return {
    ciphertext: toBase64(ciphertext),
    nonce: toBase64(nonce),
    version,
  };
}

export async function decryptProviderKey(
  encrypted: EncryptedProviderKey,
  rawKey: string
): Promise<string> {
  const key = await importKey(rawKey);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Bytes(encrypted.nonce) },
    key,
    fromBase64ArrayBuffer(encrypted.ciphertext)
  );
  return new TextDecoder().decode(plaintext);
}
