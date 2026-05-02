import { describe, expect, it } from "vitest";

import {
  assertProviderType,
  jsonToString,
  toEpochMs,
} from "../../scripts/migration/transform";
import { decryptProviderKey, encryptProviderKey } from "../../scripts/migration/encrypt-provider-keys";

describe("migration transforms", () => {
  it("converts timestamptz strings to epoch milliseconds", () => {
    expect(toEpochMs("2026-05-02T00:00:00.000Z")).toBe(1_777_680_000_000);
  });

  it("serializes JSON values for D1 TEXT storage", () => {
    expect(jsonToString({ a: 1 })).toBe("{\"a\":1}");
    expect(jsonToString(null)).toBeNull();
  });

  it("rejects unsupported provider types", () => {
    expect(assertProviderType("openai")).toBe("openai");
    expect(() => assertProviderType("other")).toThrow("Unsupported provider type");
  });

  it("encrypts provider keys without returning plaintext", async () => {
    const encrypted = await encryptProviderKey(
      "sk-test",
      "0123456789abcdef0123456789abcdef"
    );

    expect(encrypted.ciphertext).not.toContain("sk-test");
    await expect(
      decryptProviderKey(encrypted, "0123456789abcdef0123456789abcdef")
    ).resolves.toBe("sk-test");
  });
});
