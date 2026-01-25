import { NextResponse } from "next/server";
import {
  normalizeOptionalNumber,
  omitUndefinedFields,
  sanitizeOptionalString,
} from "../../firebase/helpers";

const CLOUD_FUNCTION_URL =
  "https://us-central1-todolist-76572.cloudfunctions.net/getTokenPrice";
const FIREBASE_CLIENT_VERSION = "fire-js/12.6.0";

type TokenPricePayload = {
  lat?: number;
  lng?: number;
  currency?: string;
  zoneId?: string;
};

const normalizeRequestPayload = (input: Record<string, unknown>): TokenPricePayload =>
  omitUndefinedFields({
    lat: normalizeOptionalNumber(input.lat),
    lng: normalizeOptionalNumber(input.lng),
    currency: sanitizeOptionalString(input.currency),
    zoneId: sanitizeOptionalString(input.zoneId),
  });

const buildFunctionHeaders = (authorization: string | null) => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Firebase-Client": FIREBASE_CLIENT_VERSION,
    "X-Firebase-Client-Version": FIREBASE_CLIENT_VERSION,
  };
  if (authorization) {
    headers.Authorization = authorization;
  }
  return headers;
};

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) ?? {};
  } catch (error) {
    console.warn("Impossible de parser le corps de la requête token-price", error);
  }

  const payload = normalizeRequestPayload(body);

  let functionResponse: Response;
  try {
    functionResponse = await fetch(CLOUD_FUNCTION_URL, {
      method: "POST",
      headers: buildFunctionHeaders(request.headers.get("authorization")),
      body: JSON.stringify({ data: payload }),
    });
  } catch (error) {
    console.error("Erreur lors de la redirection vers getTokenPrice", error);
    return NextResponse.json(
      {
        error: "Impossible de joindre le service de tarification dynamique.",
      },
      { status: 502 }
    );
  }

  if (!functionResponse.ok) {
    const details = await functionResponse.text().catch(() => functionResponse.statusText);
    return NextResponse.json(
      {
        error: "Le service de tarification dynamique a répondu avec une erreur.",
        details,
      },
      { status: 502 }
    );
  }

  const forwardedBody = (await functionResponse.json().catch(() => null)) as
    | Record<string, unknown>
    | null;
  const payloadData =
    (forwardedBody && typeof forwardedBody === "object" && "data" in forwardedBody
      ? forwardedBody.data
      : forwardedBody) ?? null;

  return NextResponse.json(payloadData);
}
