import type { AvailableNumber } from "./telephony-provider.js";

const DEFAULT_LOCALITY = "San Francisco";
const DEFAULT_REGION = "CA";

export function buildDevNumbers(
  areaCode: string,
  provider: AvailableNumber["provider"]
): AvailableNumber[] {
  const safeAreaCode = /^\d{3}$/.test(areaCode) ? areaCode : "415";

  return Array.from({ length: 10 }, (_, index) => {
    const suffix = String(101 + index).padStart(4, "0");

    return {
      phoneNumber: `+1${safeAreaCode}555${suffix}`,
      nationalFormat: `(${safeAreaCode}) 555-${suffix}`,
      locality: DEFAULT_LOCALITY,
      provider,
      region: DEFAULT_REGION
    };
  });
}

export function formatUsNationalNumber(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 11)}`;
  }

  return phoneNumber;
}
