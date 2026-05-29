/** Extracts and parses the first JSON object from a Claude response that may include markdown fences. */
export function parseClaudeJson<T>(text: string): T {
  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1].trim() : text.trim();

  // If no fences, try to extract the first {...} block
  const jsonStart = candidate.indexOf('{');
  const jsonEnd = candidate.lastIndexOf('}');
  const jsonStr = jsonStart !== -1 && jsonEnd !== -1
    ? candidate.slice(jsonStart, jsonEnd + 1)
    : candidate;

  return JSON.parse(jsonStr) as T;
}
