export interface Challenge {
  prompt: string;
}

export interface ValidationResult {
  valid: boolean;
}

/**
 * 探活提示词：要求模型精确回复 OK，指令明确、输出极短，便于探活。
 * 判定仍以「返回非空内容」为准（推理模型可能带前后缀，不强制等于 OK）。
 */
const PROBE_PROMPT = "Reply with exactly: OK";

export function generateChallenge(): Challenge {
  return { prompt: PROBE_PROMPT };
}

export function validateResponse(response: string): ValidationResult {
  return { valid: response.trim().length > 0 };
}
