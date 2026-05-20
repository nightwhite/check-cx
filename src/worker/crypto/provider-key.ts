export interface EncryptedProviderKey {
  ciphertext: string;
  nonce: string;
  version: number;
}

function toBase64(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function importAesKey(rawKey: string): Promise<CryptoKey> {
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
  rawKey: string
): Promise<EncryptedProviderKey> {
  const key = await importAesKey(rawKey);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    new TextEncoder().encode(plaintext)
  );

  return {
    ciphertext: toBase64(ciphertext),
    nonce: toBase64(nonce),
    version: 1,
  };
}

export async function decryptProviderKey(
  encrypted: EncryptedProviderKey,
  rawKey: string
): Promise<string> {
  const key = await importAesKey(rawKey);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(encrypted.nonce) },
    key,
    toArrayBuffer(fromBase64(encrypted.ciphertext))
  );

  return new TextDecoder().decode(plaintext);
}
