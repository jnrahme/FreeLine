import { env } from "../config/env.js";
import type { TelephonyProvider } from "./telephony-provider.js";
import { BandwidthProvider } from "./providers/bandwidth-provider.js";
import { TwilioProvider } from "./providers/twilio-provider.js";

export function createTelephonyProvider(): TelephonyProvider {
  if (env.TELEPHONY_PROVIDER === "twilio") {
    return new TwilioProvider();
  }

  return new BandwidthProvider();
}
