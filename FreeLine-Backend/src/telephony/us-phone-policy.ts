import { parsePhoneNumberFromString } from "libphonenumber-js/max";

const SUPPORTED_COUNTRY = "US";

export function normalizeUsPhoneNumber(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const parsedPhoneNumber = parsePhoneNumberFromString(value, SUPPORTED_COUNTRY);

  if (
    !parsedPhoneNumber ||
    !parsedPhoneNumber.isValid() ||
    parsedPhoneNumber.country !== SUPPORTED_COUNTRY
  ) {
    return null;
  }

  return parsedPhoneNumber.number;
}

export function isUsPhoneNumber(value: string | undefined): boolean {
  return normalizeUsPhoneNumber(value) !== null;
}

export function getUsAreaCode(value: string | undefined): string | null {
  const phoneNumber = normalizeUsPhoneNumber(value);
  return phoneNumber ? phoneNumber.slice(2, 5) : null;
}
