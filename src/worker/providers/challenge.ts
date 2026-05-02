export interface Challenge {
  prompt: string;
  expectedAnswer: string;
}

export interface ValidationResult {
  valid: boolean;
  extractedNumbers: string[] | null;
}

function randomInt(min: number, max: number): number {
  const range = max - min + 1;
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return min + (values[0] % range);
}

function buildPrompt(question: string): string {
  return `Calculate and respond with ONLY the number, nothing else.

Q: 3 + 5 = ?
A: 8

Q: 12 - 7 = ?
A: 5

Q: ${question}
A:`;
}

export function generateChallenge(): Challenge {
  const a = randomInt(1, 50);
  const b = randomInt(1, 50);
  const useAddition = randomInt(0, 1) === 1;

  if (useAddition) {
    return {
      prompt: buildPrompt(`${a} + ${b} = ?`),
      expectedAnswer: String(a + b),
    };
  }

  const larger = Math.max(a, b);
  const smaller = Math.min(a, b);
  return {
    prompt: buildPrompt(`${larger} - ${smaller} = ?`),
    expectedAnswer: String(larger - smaller),
  };
}

export function validateResponse(
  response: string,
  expectedAnswer: string
): ValidationResult {
  if (!response || !expectedAnswer) {
    return { valid: false, extractedNumbers: null };
  }

  const extractedNumbers = response.match(/-?\d+/g);
  if (!extractedNumbers) {
    return { valid: false, extractedNumbers: null };
  }

  return {
    valid: extractedNumbers.includes(expectedAnswer),
    extractedNumbers,
  };
}
