import { Signer } from "@mancho.devs/authorizer";

const FINIK_PRODUCTION_URL = "https://api.acquiring.averspay.kg";
const FINIK_BETA_URL = "https://beta.api.acquiring.averspay.kg";
type RequestData = ConstructorParameters<typeof Signer>[0];

export const FINIK_PRO_PRICE_KGS = 200;
export const PRO_DURATION_DAYS = 30;

type FinikConfig = {
  apiKey: string;
  accountId: string;
  privateKey: string;
  publicKey: string;
  baseUrl: string;
  qrName: string;
};

function pem(value: string) {
  return value.replace(/\\n/g, "\n").trim();
}

function allowedBaseUrl(value: string | undefined) {
  const url = (value || FINIK_BETA_URL).replace(/\/+$/, "");
  if (url !== FINIK_BETA_URL && url !== FINIK_PRODUCTION_URL) {
    throw new Error("FINIK_BASE_URL must be an official Finik endpoint");
  }
  return url;
}

export function isFinikEnabled() {
  return process.env.FINIK_ENABLED === "true";
}

export function getFinikConfig(): FinikConfig | null {
  if (!isFinikEnabled()) return null;
  const apiKey = process.env.FINIK_API_KEY;
  const accountId = process.env.FINIK_ACCOUNT_ID;
  const privateKey = process.env.FINIK_PRIVATE_PEM;
  const publicKey = process.env.FINIK_PUBLIC_PEM;
  if (!apiKey || !accountId || !privateKey || !publicKey) {
    return null;
  }

  return {
    apiKey,
    accountId,
    privateKey: pem(privateKey),
    publicKey: pem(publicKey),
    baseUrl: allowedBaseUrl(process.env.FINIK_BASE_URL),
    qrName: process.env.FINIK_QR_NAME?.trim() || "Atrion Pro",
  };
}

export function isFinikConfigured() {
  try {
    if (getFinikConfig() === null) return false;
    if (process.env.NODE_ENV === "production") appUrl();
    return true;
  } catch {
    return false;
  }
}

export function appUrl(requestUrl?: string) {
  const configured = process.env.APP_URL;
  if (configured) {
    const url = new URL(configured);
    if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
      throw new Error("APP_URL must use HTTPS in production");
    }
    return url.origin;
  }
  if (process.env.NODE_ENV !== "production" && requestUrl) {
    return new URL(requestUrl).origin;
  }
  throw new Error("APP_URL is not configured");
}

export async function createFinikPayment(input: {
  paymentId: string;
  redirectUrl: string;
  webhookUrl: string;
}) {
  const config = getFinikConfig();
  if (!config) throw new Error("Finik is not configured");

  const timestamp = Date.now().toString();
  const host = new URL(config.baseUrl).host;
  const body = {
    Amount: FINIK_PRO_PRICE_KGS,
    CardType: "FINIK_QR",
    PaymentId: input.paymentId,
    RedirectUrl: input.redirectUrl,
    Data: {
      accountId: config.accountId,
      name_en: config.qrName,
      webhookUrl: input.webhookUrl,
    },
  };
  const requestData: RequestData = {
    httpMethod: "POST",
    path: "/v1/payment",
    headers: {
      Host: host,
      "x-api-key": config.apiKey,
      "x-api-timestamp": timestamp,
    },
    queryStringParameters: undefined,
    body,
  };
  const signature = await new Signer(requestData).sign(config.privateKey);
  const response = await fetch(`${config.baseUrl}/v1/payment`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.apiKey,
      "x-api-timestamp": timestamp,
      signature,
    },
    body: JSON.stringify(body),
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });

  const location = response.headers.get("location");
  if (response.status === 302 && location) return location;

  if (response.ok) {
    const data = (await response.json().catch(() => null)) as
      | { paymentUrl?: unknown; url?: unknown; location?: unknown }
      | null;
    const url = data?.paymentUrl ?? data?.url ?? data?.location;
    if (typeof url === "string" && /^https:\/\//.test(url)) return url;
  }

  throw new Error(`Finik create payment failed with status ${response.status}`);
}

export async function verifyFinikWebhook(input: {
  body: Record<string, unknown>;
  headers: Headers;
  host: string;
  path: string;
  signature: string;
}) {
  const config = getFinikConfig();
  if (!config) return false;

  const signedHeaders: Record<string, string> = { Host: input.host };
  input.headers.forEach((value, key) => {
    if (key.toLowerCase().startsWith("x-api-")) signedHeaders[key.toLowerCase()] = value;
  });

  const requestData: RequestData = {
    httpMethod: "POST",
    path: input.path,
    headers: signedHeaders,
    queryStringParameters: undefined,
    body: input.body,
  };
  return new Signer(requestData).verify(config.publicKey, input.signature);
}
