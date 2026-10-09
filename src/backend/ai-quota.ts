import { db } from "./db";
import { refundable, type QuotaReservation, type QuotaFailure } from "./quota-reservation";

function utcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function consumeAiQuota(
  userId: string
): Promise<QuotaReservation | QuotaFailure> {
  const today = utcDay();

  await db.user.updateMany({
    where: { id: userId, OR: [{ aiCallsDate: null }, { aiCallsDate: { lt: today } }] },
    data: { aiCallsToday: 0, aiCallsDate: today },
  });
  const reserved = await db.user.updateMany({
    where: { id: userId, aiCallsDate: today },
    data: { aiCallsToday: { increment: 1 } },
  });
  if (reserved.count === 0) {
    return {
      ok: false,
      code: "AUTH_REQUIRED",
      status: 401,
      error: "Требуется вход",
    };
  }
  return refundable(() => db.user.updateMany({
    where: { id: userId, aiCallsDate: today, aiCallsToday: { gt: 0 } },
    data: { aiCallsToday: { decrement: 1 } },
  }), "AI");
}
