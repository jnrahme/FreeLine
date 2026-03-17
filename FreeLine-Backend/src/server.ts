import Fastify, { type FastifyInstance } from "fastify";
import formbody from "@fastify/formbody";
import websocket from "@fastify/websocket";

import { PostgresAdminStore } from "./admin/postgres-store.js";
import { PostgresAdminOpsStore } from "./admin/ops-postgres-store.js";
import { AdminService } from "./admin/service.js";
import { AdminOpsService } from "./admin/ops-service.js";
import type { AdminStore } from "./admin/types.js";
import type { AdminOpsStore } from "./admin/ops-types.js";
import { ConfigurableCaptchaVerifier } from "./auth/captcha.js";
import { DevMailboxMailer } from "./auth/dev-mailer.js";
import { DevOAuthVerifier } from "./auth/oauth.js";
import { PostgresAuthStore } from "./auth/postgres-store.js";
import { AuthService } from "./auth/service.js";
import { PostgresAbuseStore } from "./abuse/postgres-store.js";
import { RedisRateLimiter } from "./abuse/rate-limiter.js";
import { AbuseService } from "./abuse/service.js";
import type { AbuseStore, RateLimiter } from "./abuse/types.js";
import type {
  AuthStore,
  CaptchaVerifier,
  OAuthVerifier,
  VerificationMailer
} from "./auth/types.js";
import { PostgresNumberStore } from "./numbers/postgres-store.js";
import { NumberLifecycleService } from "./numbers/lifecycle-service.js";
import { NumberService } from "./numbers/service.js";
import type { NumberStore } from "./numbers/types.js";
import { PostgresMessageStore } from "./messages/postgres-store.js";
import { MessageService } from "./messages/service.js";
import type { MessageStore } from "./messages/types.js";
import { PostgresCallStore } from "./calls/postgres-store.js";
import { CallService } from "./calls/service.js";
import type { CallStore } from "./calls/types.js";
import { AnalyticsService } from "./analytics/service.js";
import { DevPushNotifier } from "./notifications/dev-push-notifier.js";
import { DevRealtimePublisher } from "./notifications/dev-realtime-publisher.js";
import { FanoutRealtimePublisher } from "./notifications/fanout-realtime-publisher.js";
import { MessageRealtimeGateway } from "./notifications/realtime-gateway.js";
import type {
  PushNotifier,
  RealtimeGateway,
  RealtimePublisher
} from "./notifications/types.js";
import { checkPostgresConnection, closePostgres } from "./services/postgres.js";
import { checkRedisConnection, closeRedis } from "./services/redis.js";
import { registerAnalyticsRoutes } from "./routes/analytics.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerNumberRoutes } from "./routes/numbers.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerAdminOpsRoutes } from "./routes/admin-ops.js";
import { registerMessageRoutes } from "./routes/messages.js";
import { registerCallRoutes } from "./routes/calls.js";
import { registerRewardRoutes } from "./routes/rewards.js";
import { registerNumberLifecycleRoutes } from "./routes/number-lifecycle.js";
import { registerSubscriptionRoutes } from "./routes/subscriptions.js";
import { InMemorySubscriptionStore } from "./subscriptions/in-memory-store.js";
import { PostgresSubscriptionStore } from "./subscriptions/postgres-store.js";
import { SubscriptionService } from "./subscriptions/service.js";
import type { SubscriptionStore } from "./subscriptions/types.js";
import { createTelephonyProvider } from "./telephony/create-provider.js";
import type { TelephonyProvider } from "./telephony/telephony-provider.js";

export interface AppDependencies {
  checkPostgres?: () => Promise<boolean>;
  checkRedis?: () => Promise<boolean>;
  telephonyProvider?: TelephonyProvider;
  abuseStore?: AbuseStore;
  rateLimiter?: RateLimiter;
  abuseService?: AbuseService;
  adminStore?: AdminStore;
  adminService?: AdminService;
  adminOpsStore?: AdminOpsStore;
  adminOpsService?: AdminOpsService;
  authStore?: AuthStore;
  numberStore?: NumberStore;
  numberLifecycleService?: NumberLifecycleService;
  messageStore?: MessageStore;
  messageService?: MessageService;
  callStore?: CallStore;
  callService?: CallService;
  analyticsService?: AnalyticsService;
  pushNotifier?: PushNotifier;
  realtimePublisher?: RealtimePublisher;
  realtimeGateway?: RealtimeGateway;
  captchaVerifier?: CaptchaVerifier;
  emailMailer?: VerificationMailer;
  appleVerifier?: OAuthVerifier;
  googleVerifier?: OAuthVerifier;
  subscriptionStore?: SubscriptionStore;
  subscriptionService?: SubscriptionService;
}

export async function buildApp(
  dependencies: AppDependencies = {}
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: process.env.NODE_ENV !== "test"
  });

  await app.register(formbody);
  await app.register(websocket);

  const telephonyProvider =
    dependencies.telephonyProvider ?? createTelephonyProvider();
  const abuseStore = dependencies.abuseStore ?? new PostgresAbuseStore();
  const rateLimiter = dependencies.rateLimiter ?? new RedisRateLimiter();
  const adminStore = dependencies.adminStore ?? new PostgresAdminStore();
  const adminOpsStore = dependencies.adminOpsStore ?? new PostgresAdminOpsStore();
  const authStore = dependencies.authStore ?? new PostgresAuthStore();
  const numberStore = dependencies.numberStore ?? new PostgresNumberStore();
  const messageStore = dependencies.messageStore ?? new PostgresMessageStore();
  const callStore = dependencies.callStore ?? new PostgresCallStore();
  const subscriptionStore =
    dependencies.subscriptionStore ??
    (process.env.NODE_ENV === "test"
      ? new InMemorySubscriptionStore()
      : new PostgresSubscriptionStore());
  const pushNotifier = dependencies.pushNotifier ?? new DevPushNotifier();
  const realtimeGateway =
    dependencies.realtimeGateway ?? new MessageRealtimeGateway();
  const realtimePublisher =
    dependencies.realtimePublisher ??
    new FanoutRealtimePublisher([new DevRealtimePublisher(), realtimeGateway]);
  const subscriptionService =
    dependencies.subscriptionService ?? new SubscriptionService(subscriptionStore);
  const analyticsService =
    dependencies.analyticsService ?? new AnalyticsService();
  const abuseService =
    dependencies.abuseService ??
    new AbuseService({
      authStore,
      callStore,
      messageStore,
      rateLimiter,
      store: abuseStore,
      subscriptionAccess: subscriptionService
    });
  const adminService =
    dependencies.adminService ?? new AdminService(adminStore);
  const authService = new AuthService({
    adminService,
    abuseService,
    appleVerifier: dependencies.appleVerifier ?? new DevOAuthVerifier(),
    captchaVerifier:
      dependencies.captchaVerifier ?? new ConfigurableCaptchaVerifier(),
    emailMailer: dependencies.emailMailer ?? new DevMailboxMailer(),
    googleVerifier: dependencies.googleVerifier ?? new DevOAuthVerifier(),
    store: authStore
  });
  const numberService = new NumberService(numberStore, telephonyProvider);
  const numberLifecycleService =
    dependencies.numberLifecycleService ??
    new NumberLifecycleService(numberStore, telephonyProvider, pushNotifier, {
      subscriptionAccess: subscriptionService
    });
  const adminOpsService =
    dependencies.adminOpsService ??
    new AdminOpsService(
      adminOpsStore,
      authStore,
      abuseStore,
      abuseService,
      numberStore,
      numberLifecycleService
    );
  const messageService =
    dependencies.messageService ??
    new MessageService(
      messageStore,
      numberStore,
      telephonyProvider,
      pushNotifier,
      realtimePublisher,
      {
        abuseService
      }
    );
  const callService =
    dependencies.callService ??
    new CallService(callStore, numberStore, telephonyProvider, pushNotifier, {
      abuseService
    });

  await registerHealthRoutes(app, {
    checkPostgres: dependencies.checkPostgres ?? checkPostgresConnection,
    checkRedis: dependencies.checkRedis ?? checkRedisConnection
  });

  await registerAuthRoutes(app, authService);
  await registerAdminRoutes(app, adminService);
  await registerAdminOpsRoutes(app, adminOpsService);
  await registerNumberRoutes(app, numberService);
  await registerNumberLifecycleRoutes(app, numberLifecycleService);
  await registerMessageRoutes(app, messageService, realtimeGateway);
  await registerCallRoutes(app, callService, numberStore);
  await registerRewardRoutes(app, abuseService);
  await registerSubscriptionRoutes(app, subscriptionService, abuseService);
  await registerAnalyticsRoutes(app, analyticsService);

  app.addHook("onClose", async () => {
    await Promise.all([closePostgres(), closeRedis()]);
  });

  return app;
}
