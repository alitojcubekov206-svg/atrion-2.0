import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getSessionUserId, isProPlanActive } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  appUrl,
  createFinikPayment,
  FINIK_PRO_PRICE_KGS,
  isFinikConfigured,
} from "@/lib/finik";

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Войдите в аккаунт" }, { status: 401 });
  if (!isFinikConfigured()) {
    return NextResponse.json({ error: "Оплата Finik пока не подключена" }, { status: 503 });
  }

  const providerPaymentId = randomUUID();
  const checkout = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { plan: true, planExpiresAt: true },
    });
    if (!user) return { error: "Пользователь не найден", status: 404 } as const;
    if (isProPlanActive(user.plan, user.planExpiresAt)) {
      return { error: "У вас уже активен Pro", status: 409 } as const;
    }

    const existing = await tx.payment.findFirst({
      where: {
        userId,
        provider: "finik",
        status: "pending",
        createdAt: { gt: new Date(Date.now() - 15 * 60_000) },
      },
      orderBy: { createdAt: "desc" },
      select: { paymentUrl: true },
    });
    if (existing) {
      return existing.paymentUrl
        ? ({ url: existing.paymentUrl } as const)
        : ({ error: "Платёж уже создаётся", status: 409 } as const);
    }

    const payment = await tx.payment.create({
      data: {
        userId,
        providerPaymentId,
        amount: FINIK_PRO_PRICE_KGS,
        currency: "KGS",
      },
    });
    return { payment } as const;
  });
  if ("error" in checkout) {
    return NextResponse.json({ error: checkout.error }, { status: checkout.status });
  }
  if ("url" in checkout) return NextResponse.json({ url: checkout.url });
  const { payment } = checkout;

  try {
    const base = appUrl(req.url);
    const paymentUrl = await createFinikPayment({
      paymentId: providerPaymentId,
      redirectUrl: `${base}/pricing?payment=processing`,
      webhookUrl: `${base}/api/payments/finik/webhook`,
    });
    await db.payment.update({
      where: { id: payment.id },
      data: { paymentUrl },
    });
    return NextResponse.json({ url: paymentUrl });
  } catch (error) {
    console.error("Finik checkout failed", error instanceof Error ? error.message : "Unknown error");
    await db.payment.update({
      where: { id: payment.id },
      data: { status: "failed", failureReason: "provider_error" },
    });
    return NextResponse.json(
      { error: "Finik временно недоступен. Попробуйте WhatsApp." },
      { status: 502 }
    );
  }
}
