export interface Challenge {
  prompt: string;
}

export interface ValidationResult {
  valid: boolean;
}

/** 探活提示词：渠道返回了非空内容即视为可用。 */
const PROBE_PROMPT = "hi";

export function generateChallenge(): Challenge {
  return { prompt: PROBE_PROMPT };
}

export function validateResponse(response: string): ValidationResult {
  return { valid: response.trim().length > 0 };
}
