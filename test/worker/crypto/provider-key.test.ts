import { describe, expect, it } from "vitest";

import {
  decryptProviderKey,
  encryptProviderKey,
} from "../../../src/worker/crypto/provider-key";

describe("provider key crypto", () => {
  it("encrypts and decrypts a provider key with AES-GCM", async () => {
    const encryptionKey = "0123456789abcdef0123456789abcdef";

    const encrypted = await encryptProviderKey("sk-test", encryptionKey);

    expect(encrypted).toMatchObject({
      version: 1,
      ciphertext: expect.any(String),
      nonce: expect.any(String),
    });
    expect(encrypted.ciphertext).not.toContain("sk-test");
    await expect(decryptProviderKey(encrypted, encryptionKey)).resolves.toBe(
      "sk-test"
    );
  });

  it("uses a new nonce for each encryption", async () => {
    const encryptionKey = "0123456789abcdef0123456789abcdef";

    const first = await encryptProviderKey("sk-test", encryptionKey);
    const second = await encryptProviderKey("sk-test", encryptionKey);

    expect(first.nonce).not.toBe(second.nonce);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it("rejects invalid CONFIG_ENCRYPTION_KEY length", async () => {
    await expect(encryptProviderKey("sk-test", "short")).rejects.toThrow(
      "CONFIG_ENCRYPTION_KEY must be 16, 24, or 32 bytes"
    );
  });
});
