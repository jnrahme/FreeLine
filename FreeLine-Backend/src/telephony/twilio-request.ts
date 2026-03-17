import type { FastifyRequest } from "fastify";
import twilio from "twilio";

export function getHeaderValue(header: string | string[] | undefined): string | undefined {
  return Array.isArray(header) ? header[0] : header;
}

export function buildRequestUrl(request: FastifyRequest): string {
  const protocol =
    getHeaderValue(request.headers["x-forwarded-proto"]) ?? request.protocol;
  const host =
    getHeaderValue(request.headers["x-forwarded-host"]) ??
    getHeaderValue(request.headers.host) ??
    request.hostname;

  return `${protocol}://${host}${request.url}`;
}

export function getFormParams(body: unknown): Record<string, string> {
  if (!body || typeof body !== "object") {
    return {};
  }

  const params: Record<string, string> = {};

  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      if (value[0] !== undefined && value[0] !== null) {
        params[key] = String(value[0]);
      }
      continue;
    }

    if (value !== undefined && value !== null) {
      params[key] = String(value);
    }
  }

  return params;
}

export function validateTwilioRequest(input: {
  authToken: string;
  params: Record<string, string>;
  request: FastifyRequest;
}): boolean {
  const signature = getHeaderValue(input.request.headers["x-twilio-signature"]);

  if (!input.authToken || !signature) {
    return false;
  }

  return twilio.validateRequest(
    input.authToken,
    signature,
    buildRequestUrl(input.request),
    input.params
  );
}
