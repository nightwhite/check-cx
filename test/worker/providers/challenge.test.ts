import { describe, expect, it } from "vitest";

import {
  generateChallenge,
  validateResponse,
} from "../../../src/worker/providers/challenge";

describe("探活挑战", () => {
  it("提示词要求模型精确回复 OK", () => {
    expect(generateChallenge().prompt).toBe("Reply with exactly: OK");
  });

  it("非空回复视为通过", () => {
    expect(validateResponse("OK").valid).toBe(true);
    expect(validateResponse("  OK\n").valid).toBe(true);
  });

  it("空白回复视为失败", () => {
    expect(validateResponse("").valid).toBe(false);
    expect(validateResponse("   ").valid).toBe(false);
  });
});
