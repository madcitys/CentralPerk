import { TribeClient, type KafkaGovernedPublishResponse } from "@implementsprint/sdk";
import { config } from "./config.js";

type EventPayload = Record<string, unknown>;
type EventMetadata = Record<string, string>;

export type PublishBusinessEventInput = {
  key?: string;
  eventType: string;
  payload: EventPayload;
  eventId?: string;
  eventVersion?: number;
  occurredAt?: string;
  metadata?: EventMetadata;
};

export type PublishBusinessEventResult =
  | { status: "disabled"; accepted: false }
  | { status: "published"; accepted: true; topic: string; eventType: string }
  | { status: "failed"; accepted: false; error: string };

export type BusinessEventLogger = {
  error: (payload: unknown, message?: string) => void;
};

let apiCenterClient: TribeClient | null = null;

function readEnv(name: string) {
  return process.env[name]?.trim() || "";
}

function isKafkaPublishingEnabled() {
  return ["true", "1", "yes", "on"].includes(readEnv("APICENTER_KAFKA_ENABLED").toLowerCase());
}

function getApiCenterClient() {
  if (apiCenterClient) return apiCenterClient;

  const gatewayUrl = readEnv("APICENTER_URL");
  const tribeId = readEnv("APICENTER_TRIBE_ID");
  const secret = readEnv("APICENTER_TRIBE_SECRET");
  const missing = [
    ["APICENTER_URL", gatewayUrl],
    ["APICENTER_TRIBE_ID", tribeId],
    ["APICENTER_TRIBE_SECRET", secret],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`[${config.serviceName}] Missing API Center event config: ${missing.join(", ")}`);
  }

  apiCenterClient = new TribeClient({
    gatewayUrl,
    tribeId,
    secret,
    sourceServiceId: config.serviceName,
  });

  return apiCenterClient;
}

export async function publishBusinessEvent(
  event: PublishBusinessEventInput,
  logger?: BusinessEventLogger,
): Promise<PublishBusinessEventResult> {
  if (!isKafkaPublishingEnabled()) {
    return { status: "disabled", accepted: false };
  }

  try {
    const response: KafkaGovernedPublishResponse = await getApiCenterClient().publishTribeEvent({
      key: event.key,
      eventType: event.eventType,
      payload: event.payload,
      sourceServiceId: config.serviceName,
      metadata: {
        source: config.serviceName,
        eventVersion: String(event.eventVersion ?? 1),
        occurredAt: event.occurredAt ?? new Date().toISOString(),
        ...(event.eventId ? { eventId: event.eventId } : {}),
        ...event.metadata,
      },
    });

    return {
      status: "published",
      accepted: response.accepted,
      topic: response.topic,
      eventType: response.eventType,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown API Center publish error.";
    logger?.error({ error: message, eventType: event.eventType, key: event.key }, "Business event publish failed");
    return { status: "failed", accepted: false, error: message };
  }
}
