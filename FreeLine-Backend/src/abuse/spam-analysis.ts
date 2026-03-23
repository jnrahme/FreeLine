import { env } from "../config/env.js";

export interface SpamAnalysisResult {
  confidence: number;
  reason: string;
}

const KNOWN_SPAM_PATTERNS: Array<{ pattern: RegExp; reason: string; weight: number }> = [
  { pattern: /\bgift\s*card\b/i, reason: "Gift card scam language", weight: 0.85 },
  { pattern: /\btelegram\b.*\b(contact|message|reach)\b/i, reason: "Telegram redirect attempt", weight: 0.80 },
  { pattern: /\bbitcoin\b|\bcrypto\b|\bethereun\b/i, reason: "Cryptocurrency solicitation", weight: 0.75 },
  { pattern: /\bclick\s+here\b/i, reason: "Suspicious link bait", weight: 0.70 },
  { pattern: /\bact\s+now\b|\burgent\s+response\b|\blimited\s+time\b/i, reason: "Urgency pressure tactic", weight: 0.80 },
  { pattern: /\bloan\s+approval\b|\bpre-?approved\b/i, reason: "Unsolicited financial offer", weight: 0.75 },
  { pattern: /\bcongratulations?\b.*\bwon\b|\bwinner\b/i, reason: "Prize/lottery scam", weight: 0.90 },
  { pattern: /\bverify\s+your\s+(account|identity|ssn|social)\b/i, reason: "Identity phishing attempt", weight: 0.92 },
  { pattern: /\bsuspended\b.*\baccount\b|\baccount\b.*\bsuspended\b/i, reason: "Account suspension phishing", weight: 0.88 },
  { pattern: /\b(IRS|FBI|DEA)\b.*\b(warrant|arrest|legal)\b/i, reason: "Government impersonation scam", weight: 0.95 },
  { pattern: /\bwire\s+transfer\b|\bwestern\s+union\b|\bmoney\s*gram\b/i, reason: "Wire transfer scam", weight: 0.85 },
  { pattern: /\bfree\s+(trial|money|iphone|cash)\b/i, reason: "Too-good-to-be-true offer", weight: 0.70 },
  { pattern: /\b(https?:\/\/|www\.)\S*(bit\.ly|tinyurl|t\.co|rb\.gy)\S*/i, reason: "Shortened URL from unknown sender", weight: 0.65 },
];

const URGENCY_MARKERS = [
  /\bimmediately\b/i,
  /\basap\b/i,
  /\bright\s+now\b/i,
  /\bdon'?t\s+delay\b/i,
  /\blast\s+chance\b/i,
  /\bexpires?\s+(today|soon|tonight)\b/i,
];

const IMPERSONATION_MARKERS = [
  /\byour\s+(bank|carrier|provider)\b/i,
  /\b(Apple|Google|Amazon|PayPal|Netflix|Venmo|Zelle)\s+(support|security|team)\b/i,
  /\bthis\s+is\s+(your|the)\s+(bank|carrier)\b/i,
];

export function analyzeMessageForSpam(input: {
  body: string;
  isFirstMessageFromSender: boolean;
  senderNumber: string;
}): SpamAnalysisResult {
  const { body, isFirstMessageFromSender } = input;

  if (!body || body.trim().length === 0) {
    return { confidence: 0, reason: "empty" };
  }

  let maxConfidence = 0;
  let primaryReason = "";
  const flags: string[] = [];

  // Check known spam patterns
  for (const { pattern, reason, weight } of KNOWN_SPAM_PATTERNS) {
    if (pattern.test(body)) {
      flags.push(reason);
      if (weight > maxConfidence) {
        maxConfidence = weight;
        primaryReason = reason;
      }
    }
  }

  // Check urgency markers (additive signal)
  let urgencyCount = 0;
  for (const marker of URGENCY_MARKERS) {
    if (marker.test(body)) {
      urgencyCount++;
    }
  }
  if (urgencyCount >= 2) {
    const urgencyBoost = Math.min(urgencyCount * 0.1, 0.25);
    maxConfidence = Math.min(maxConfidence + urgencyBoost, 0.99);
    if (!primaryReason) {
      primaryReason = "Multiple urgency pressure tactics";
    }
  }

  // Check impersonation markers
  for (const marker of IMPERSONATION_MARKERS) {
    if (marker.test(body)) {
      const impersonationWeight = 0.82;
      if (impersonationWeight > maxConfidence) {
        maxConfidence = impersonationWeight;
        primaryReason = "Brand/institution impersonation";
      }
      flags.push("Brand impersonation detected");
    }
  }

  // URL presence from unknown sender boosts confidence
  const hasUrl = /\b(?:https?:\/\/|www\.)\S+/i.test(body);
  if (hasUrl && isFirstMessageFromSender) {
    maxConfidence = Math.min(maxConfidence + 0.15, 0.99);
    if (!primaryReason) {
      primaryReason = "URL from unknown sender";
    }
  }

  // First message from unknown sender with any spam signal gets a boost
  if (isFirstMessageFromSender && flags.length > 0) {
    maxConfidence = Math.min(maxConfidence + 0.08, 0.99);
  }

  // ALL CAPS body is a mild signal
  const uppercaseRatio = body.replace(/[^a-zA-Z]/g, "").length > 0
    ? body.replace(/[^A-Z]/g, "").length / body.replace(/[^a-zA-Z]/g, "").length
    : 0;
  if (uppercaseRatio > 0.7 && body.length > 20) {
    maxConfidence = Math.min(maxConfidence + 0.1, 0.99);
    if (!primaryReason) {
      primaryReason = "Aggressive all-caps formatting";
    }
  }

  return {
    confidence: Math.round(maxConfidence * 100) / 100,
    reason: primaryReason || "clean",
  };
}
