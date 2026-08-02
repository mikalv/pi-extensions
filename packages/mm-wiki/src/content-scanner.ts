/*
 * Adapted from pi-hermes-memory's content scanner (MIT).
 * Copyright (c) 2025 Chandra Teja. See THIRD_PARTY_NOTICES.md.
 *
 * This is intentionally a narrow last line of defense. Semantic privacy rules
 * (health, protected attributes, third-party details, etc.) live in the bundled
 * memory skill because regexes cannot classify those reliably.
 */

const THREAT_PATTERNS: Array<{ pattern: RegExp; id: string }> = [
  { pattern: /ignore\s+(previous|all|above|prior)\s+instructions/i, id: "prompt_injection" },
  { pattern: /you\s+are\s+now\s+/i, id: "role_hijack" },
  { pattern: /do\s+not\s+tell\s+the\s+user/i, id: "deception_hide" },
  { pattern: /system\s+prompt\s+override/i, id: "system_prompt_override" },
  { pattern: /disregard\s+(your|all|any)\s+(instructions|rules|guidelines)/i, id: "disregard_rules" },
  { pattern: /act\s+as\s+(if|though)\s+you\s+(have\s+no|don'?t\s+have)\s+(restrictions|limits|rules)/i, id: "bypass_restrictions" },
  { pattern: /curl\s+[^\n]*\$\{?\w*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|API)/i, id: "secret_exfiltration" },
  { pattern: /wget\s+[^\n]*\$\{?\w*(KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|API)/i, id: "secret_exfiltration" },
  { pattern: /cat\s+[^\n]*(\.env|credentials|\.netrc|\.pgpass|\.npmrc|\.pypirc)/i, id: "secret_file_access" },
  { pattern: /authorized_keys/i, id: "ssh_backdoor" },
];

const SECRET_PATTERNS: Array<{ pattern: RegExp; id: string }> = [
  { pattern: /\bsk-ant-api\S{10,}\b/, id: "anthropic_api_key" },
  { pattern: /\bsk-or-v1-\S{10,}\b/, id: "openrouter_api_key" },
  { pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/, id: "openai_api_key" },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/, id: "aws_access_key" },
  { pattern: /\b(?:ghp|ghu|gho|ghs|github_pat)_\S{10,}\b/, id: "github_token" },
  { pattern: /\bxox[baprs]-\S{10,}\b/, id: "slack_token" },
  { pattern: /\bBearer\s+\S{20,}\b/i, id: "bearer_token" },
  { pattern: /-----BEGIN\s+(?:RSA\s+|EC\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/, id: "private_key" },
  { pattern: /\bpassword\s*[=:]\s*[^\s]{6,}\b/i, id: "password_assignment" },
  { pattern: /\b(?:api[_-]?key|secret|token)\s*[=:]\s*[^\s]{10,}\b/i, id: "secret_assignment" },
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/, id: "us_social_security_number" },
];

const INVISIBLE_CHARS = new Set([
  "\u200b", "\u200c", "\u200d", "\u2060", "\ufeff",
  "\u202a", "\u202b", "\u202c", "\u202d", "\u202e",
]);

export function scanMemoryContent(content: string): string | null {
  for (const char of content) {
    if (INVISIBLE_CHARS.has(char)) {
      const codepoint = char.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0");
      return `Blocked: memory contains invisible Unicode U+${codepoint}.`;
    }
  }

  for (const { pattern, id } of THREAT_PATTERNS) {
    if (pattern.test(content)) {
      return `Blocked: memory matches unsafe instruction pattern '${id}'. Stored memory is data, not executable instruction.`;
    }
  }

  for (const { pattern, id } of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      return `Blocked: memory appears to contain a credential or sensitive identifier ('${id}').`;
    }
  }

  return null;
}
