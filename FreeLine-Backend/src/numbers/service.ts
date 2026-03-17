import { AppError } from "../auth/errors.js";
import { env } from "../config/env.js";
import type { AvailableNumber, TelephonyProvider } from "../telephony/telephony-provider.js";
import type { AssignedNumberRecord, NumberStore } from "./types.js";

const QUARANTINE_WINDOW_MS = env.NUMBER_QUARANTINE_DAYS * 24 * 60 * 60_000;

export interface ClaimNumberSelection {
  areaCode: string;
  locality: string;
  nationalFormat: string;
  phoneNumber: string;
  region: string;
}

export class NumberService {
  constructor(
    private readonly store: NumberStore,
    private readonly telephonyProvider: TelephonyProvider
  ) {}

  async searchNumbers(areaCode: string): Promise<AvailableNumber[]> {
    const numbers = await this.telephonyProvider.searchNumbers(areaCode);
    const unavailable = new Set(
      await this.store.findUnavailablePhoneNumbers(
        numbers.map((number) => number.phoneNumber)
      )
    );

    return numbers.filter((number) => !unavailable.has(number.phoneNumber));
  }

  async claimNumber(input: {
    selection: ClaimNumberSelection;
    userId: string;
  }): Promise<AssignedNumberRecord> {
    this.assertSelection(input.selection);

    const existingNumber = await this.store.findCurrentNumberByUser(input.userId);
    if (existingNumber) {
      throw new AppError(
        409,
        "number_already_assigned",
        "This user already has an active number."
      );
    }

    const unavailable = await this.store.findUnavailablePhoneNumbers([
      input.selection.phoneNumber
    ]);
    if (unavailable.length > 0) {
      throw new AppError(
        409,
        "number_not_available",
        "That number is no longer available."
      );
    }

    const provisionedNumber = await this.telephonyProvider.provisionNumber(
      input.selection.phoneNumber
    );

    return this.store.assignNumber({
      areaCode: input.selection.areaCode,
      locality: input.selection.locality,
      nationalFormat: input.selection.nationalFormat,
      phoneNumber: input.selection.phoneNumber,
      provisionedNumber,
      region: input.selection.region,
      userId: input.userId
    });
  }

  async getCurrentNumber(userId: string): Promise<AssignedNumberRecord | null> {
    return this.store.findCurrentNumberByUser(userId);
  }

  async releaseCurrentNumber(userId: string): Promise<AssignedNumberRecord> {
    const currentNumber = await this.store.findCurrentNumberByUser(userId);
    if (!currentNumber) {
      throw new AppError(404, "number_not_found", "No active number was found.");
    }

    const released = await this.store.releaseCurrentNumber({
      quarantineUntil: new Date(Date.now() + QUARANTINE_WINDOW_MS).toISOString(),
      releaseReason: "user_release",
      userId
    });

    if (!released) {
      throw new AppError(404, "number_not_found", "No active number was found.");
    }

    return released;
  }

  private assertSelection(selection: ClaimNumberSelection): void {
    if (!/^\d{3}$/.test(selection.areaCode)) {
      throw new AppError(400, "invalid_area_code", "Area code must be 3 digits.");
    }

    if (!/^\+1\d{10}$/.test(selection.phoneNumber)) {
      throw new AppError(
        400,
        "invalid_phone_number",
        "Phone number must be a U.S. E.164 number."
      );
    }

    if (selection.phoneNumber.slice(2, 5) !== selection.areaCode) {
      throw new AppError(
        400,
        "area_code_mismatch",
        "Phone number must match the selected area code."
      );
    }
  }
}
