export interface EncryptedProviderKey {
  ciphertext: string;
  nonce: string;
  version: number;
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function importAesKey(rawKey: string): Promise<CryptoKey> {
  const bytes = new TextEncoder().encode(rawKey);
  if (![16, 24, 32].includes(bytes.byteLength)) {
    throw new Error("CONFIG_ENCRYPTION_KEY must be 16, 24, or 32 bytes");
  }

  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, [
    "decrypt",
  ]);
}

export async function decryptProviderKey(
  encrypted: EncryptedProviderKey,
  rawKey: string
): Promise<string> {
  const key = await importAesKey(rawKey);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(encrypted.nonce) },
    key,
    fromBase64(encrypted.ciphertext)
  );

  return new TextDecoder().decode(plaintext);
}
