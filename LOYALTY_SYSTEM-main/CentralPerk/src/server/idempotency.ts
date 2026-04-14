import { createHash } from "crypto";
import { HttpError } from "./http-error";
import { readApiState, updateApiState } from "./local-store";

function hashPayload(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value ?? {})).digest("hex");
}

export async function runWithIdempotency<T>(input: {
  route: string;
  idempotencyKey?: string | null;
  payload: unknown;
  execute: () => Promise<{ body: T; statusCode?: number }>;
}) {
  const providedKey = input.idempotencyKey?.trim();
  if (!providedKey) {
    const result = await input.execute();
    return {
      body: result.body,
      statusCode: result.statusCode ?? 200,
      replayed: false,
    };
  }

  const routeKey = `${input.route}:${providedKey}`;
  const requestHash = hashPayload(input.payload);
  const existing = (await readApiState()).idempotency[routeKey];

  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw new HttpError(409, "This idempotency key was already used for a different request.");
    }

    return {
      body: existing.body as T,
      statusCode: existing.statusCode,
      replayed: true,
    };
  }

  const result = await input.execute();
  const statusCode = result.statusCode ?? 200;

  await updateApiState((state) => {
    state.idempotency[routeKey] = {
      key: providedKey,
      route: input.route,
      requestHash,
      statusCode,
      body: result.body,
      createdAt: new Date().toISOString(),
    };
  });

  return {
    body: result.body,
    statusCode,
    replayed: false,
  };
}
