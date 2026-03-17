import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { z } from "zod";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "../../..");

dotenv.config({ path: path.join(repoRoot, ".env") });
dotenv.config({ path: path.join(repoRoot, ".env.local"), override: true });

const envSchema = z.object({
  API_PORT: z.coerce.number().default(3000),
  JWT_SECRET: z.string().default("dev-secret-change-me"),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().default(30),
  EMAIL_VERIFICATION_TTL_MINUTES: z.coerce.number().default(30),
  CAPTCHA_ENABLED: z
    .string()
    .default("false")
    .transform((value) => value === "true"),
  ALLOW_DEV_OAUTH: z
    .string()
    .default("true")
    .transform((value) => value === "true"),
  DEV_MAILBOX_DIR: z.string().default(".runtime/dev-mailbox"),
  POSTGRES_HOST: z.string().default("127.0.0.1"),
  POSTGRES_PORT: z.coerce.number().default(5432),
  POSTGRES_USER: z.string().default("freeline"),
  POSTGRES_PASSWORD: z.string().default("freeline"),
  POSTGRES_DB: z.string().default("freeline"),
  REDIS_HOST: z.string().default("127.0.0.1"),
  REDIS_PORT: z.coerce.number().default(6379),
  PUBLIC_BASE_URL: z.string().default("http://127.0.0.1:3000"),
  TELEPHONY_PROVIDER: z.enum(["bandwidth", "twilio", "stub"]).default("stub"),
  FREE_TIER_DAILY_SMS_CAP: z.coerce.number().default(10),
  FREE_TIER_MONTHLY_SMS_CAP: z.coerce.number().default(40),
  FREE_TIER_MONTHLY_CALL_MINUTES_CAP: z.coerce.number().default(15),
  FREE_TIER_DAILY_CALL_MINUTES_CAP: z.coerce.number().default(10),
  FREE_TIER_DAILY_UNIQUE_CONTACTS_CAP: z.coerce.number().default(5),
  ELEVATED_TIER_MONTHLY_SMS_CAP: z.coerce.number().default(80),
  ELEVATED_TIER_MONTHLY_CALL_MINUTES_CAP: z.coerce.number().default(35),
  STANDARD_TIER_DAILY_SMS_CAP: z.coerce.number().default(20),
  STANDARD_TIER_DAILY_CALL_MINUTES_CAP: z.coerce.number().default(15),
  STANDARD_TIER_DAILY_UNIQUE_CONTACTS_CAP: z.coerce.number().default(10),
  ELEVATED_TIER_DAILY_SMS_CAP: z.coerce.number().default(40),
  ELEVATED_TIER_DAILY_CALL_MINUTES_CAP: z.coerce.number().default(35),
  ELEVATED_TIER_DAILY_UNIQUE_CONTACTS_CAP: z.coerce.number().default(20),
  MAX_REWARDED_CLAIMS_PER_MONTH: z.coerce.number().default(4),
  REWARDED_TEXT_EVENTS_BONUS: z.coerce.number().default(10),
  REWARDED_CALL_MINUTES_BONUS: z.coerce.number().default(5),
  GLOBAL_SMS_PER_SECOND_CAP: z.coerce.number().default(25),
  BETA_MODE: z
    .string()
    .default("false")
    .transform((value) => value === "true"),
  NUMBER_ACTIVATION_WINDOW_HOURS: z.coerce.number().default(24),
  NUMBER_INACTIVITY_WARNING_DAY_10: z.coerce.number().default(10),
  NUMBER_INACTIVITY_WARNING_DAY_13: z.coerce.number().default(13),
  NUMBER_INACTIVITY_RECLAIM_DAYS: z.coerce.number().default(14),
  NUMBER_QUARANTINE_DAYS: z.coerce.number().default(45),
  MAINTENANCE_API_KEY: z.string().default("dev-maintenance-key"),
  ADMIN_JWT_SECRET: z.string().default("dev-admin-secret-change-me"),
  ADMIN_ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().default(60 * 12),
  ADMIN_BOOTSTRAP_EMAIL: z.string().default("admin@freeline.dev"),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().default("ChangeMeAdmin123!"),
  A2P_10DLC_REGISTERED: z
    .string()
    .default("false")
    .transform((value) => value === "true"),
  COST_ALERT_THRESHOLD_USD: z.coerce.number().default(1.5),
  ESTIMATED_NUMBER_MONTHLY_COST_USD: z.coerce.number().default(0.3),
  ESTIMATED_TEXT_EVENT_COST_USD: z.coerce.number().default(0.008),
  ESTIMATED_CALL_MINUTE_COST_USD: z.coerce.number().default(0.00775),
  BANDWIDTH_ACCOUNT_ID: z.string().default(""),
  BANDWIDTH_API_TOKEN: z.string().default(""),
  BANDWIDTH_API_SECRET: z.string().default(""),
  BANDWIDTH_MESSAGING_APPLICATION_ID: z.string().default(""),
  BANDWIDTH_WEBHOOK_SECRET: z.string().default("dev-bandwidth-webhook-secret"),
  TWILIO_ACCOUNT_SID: z.string().default(""),
  TWILIO_AUTH_TOKEN: z.string().default(""),
  TWILIO_API_KEY: z.string().default(""),
  TWILIO_API_SECRET: z.string().default(""),
  TWILIO_VOICE_APP_SID: z.string().default(""),
  TWILIO_VOICE_PUSH_CREDENTIAL_SID: z.string().default(""),
  TWILIO_WEBHOOK_SECRET: z.string().default("dev-twilio-webhook-secret")
});

export type AppEnv = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
export { repoRoot };
