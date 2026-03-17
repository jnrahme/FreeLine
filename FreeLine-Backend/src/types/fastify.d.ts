import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    adminUser?: {
      adminUserId: string;
      email: string;
      role: "admin";
      type: "admin_access";
    };
    authUser?: {
      email: string;
      userId: string;
    };
  }
}
