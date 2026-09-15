import { db } from "./db";
import { getUserPlan } from "./auth";
import { AI_DAILY_LIMIT } from "./plans";

function utcDay(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export async function consumeAiQuota(
  userId: string
): Promise<{ ok: true } | { ok: false; error: string; code: "AI_LIMIT_REACHED" }> {
  const plan = await getUserPlan(userId);
  const limit = plan === "pro" ? AI_DAILY_LIMIT.pro : AI_DAILY_LIMIT.free;
  const today = utcDay();

  await db.user.updateMany({
    where: { id: userId, OR: [{ aiCallsDate: null }, { aiCallsDate: { lt: today } }] },
    data: { aiCallsToday: 0, aiCallsDate: today },
  });
  const reserved = await db.user.updateMany({
    where: { id: userId, aiCallsToday: { lt: limit } },
    data: { aiCallsToday: { increment: 1 } },
  });
  if (reserved.count === 0) {
    return {
      ok: false,
      code: "AI_LIMIT_REACHED",
      error:
        plan === "pro"
          ? `Дневной лимит AI-запросов (${limit}) исчерпан. Лимит обновится завтра.`
          : `Дневной лимит AI-запросов для Free (${limit}) исчерпан. Pro даёт ${AI_DAILY_LIMIT.pro} в день.`,
    };
  }
  return { ok: true };
}

export async function refundAiQuota(userId: string) {
  await db.user
    .updateMany({
      where: { id: userId, aiCallsToday: { gt: 0 } },
      data: { aiCallsToday: { decrement: 1 } },
    })
    .catch((e) => console.error("AI quota refund failed", e));
}
