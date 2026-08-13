import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  FINIK_PRO_PRICE_KGS,
  getFinikConfig,
  PRO_DURATION_DAYS,
  verifyFinikWebhook,
} from "@/lib/finik";

function stringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(req: Request) {
  const signature = req.headers.get("signature");
  const timestamp = req.headers.get("x-api-timestamp");
  const host = req.headers.get("host");
  if (!signature || !timestamp || !host || !/^\d+$/.test(timestamp)) {
    return NextResponse.json({ error: "Missing signed headers" }, { status: 401 });
  }
  if (Math.abs(Date.now() - Number(timestamp)) > 5 * 60_000) {
    return NextResponse.json({ error: "Expired webhook" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(await req.text());
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let valid = false;
  try {
    valid = await verifyFinikWebhook({
      body,
      headers: req.headers,
      host,
      path: new URL(req.url).pathname,
      signature,
    });
  } catch (error) {
    console.error(
      "Finik webhook verification failed",
      error instanceof Error ? error.message : "Unknown error"
    );
  }
  if (!valid) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  const status = stringField(body.status)?.toLowerCase();
  if (status !== "success" && status !== "succeeded") {
    return NextResponse.json({ ok: true });
  }
  const providerTransactionId = stringField(body.transactionId) || stringField(body.id);
  const fields =
    body.fields && typeof body.fields === "object" && !Array.isArray(body.fields)
      ? (body.fields as Record<string, unknown>)
      : {};
  const data =
    body.data && typeof body.data === "object" && !Array.isArray(body.data)
      ? (body.data as Record<string, unknown>)
      : {};
  const providerPaymentId = stringField(fields.paymentId);
  const accountId = stringField(data.accountId) || stringField(body.accountId);
  const amount = typeof body.amount === "number" ? body.amount : Number(fields.amount);
  const config = getFinikConfig();
  if (
    !config ||
    !providerTransactionId ||
    !providerPaymentId ||
    accountId !== config.accountId ||
    amount !== FINIK_PRO_PRICE_KGS
  ) {
    return NextResponse.json({ error: "Invalid payment data" }, { status: 400 });
  }

  const duplicate = await db.payment.findUnique({
    where: { providerTransactionId },
    select: { id: true },
  });
  if (duplicate) return NextResponse.json({ ok: true });

  const payment = await db.payment.findUnique({
    where: { providerPaymentId },
    select: { id: true, userId: true, amount: true, currency: true },
  });
  if (!payment || payment.amount !== amount || payment.currency !== "KGS") {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  try {
    await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${payment.userId} FOR UPDATE`;
        const claimed = await tx.payment.updateMany({
          where: { id: payment.id, status: { not: "succeeded" } },
          data: {
            status: "succeeded",
            providerTransactionId,
            failureReason: null,
          },
        });
        if (claimed.count === 0) return;

        const user = await tx.user.findUnique({
          where: { id: payment.userId },
          select: { plan: true, planExpiresAt: true },
        });
        if (!user) throw new Error("Payment user not found");
        const now = new Date();
        const startsAt =
          user.plan === "pro" && user.planExpiresAt && user.planExpiresAt > now
            ? user.planExpiresAt
            : now;
        await tx.user.update({
          where: { id: payment.userId },
          data: {
            plan: "pro",
            planExpiresAt: new Date(
              startsAt.getTime() + PRO_DURATION_DAYS * 24 * 60 * 60_000
            ),
          },
        });
      },
      { isolationLevel: "Serializable" }
    );
  } catch (error) {
    console.error("Finik webhook transaction failed", error);
    return NextResponse.json({ error: "Temporary processing error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
