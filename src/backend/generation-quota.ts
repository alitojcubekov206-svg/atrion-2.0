import { db } from "./db";
import { consumeAiQuota } from "./ai-quota";
import { refundable, type QuotaReservation, type QuotaFailure } from "./quota-reservation";

/** Usage accounting only. Every account has free access without plan limits. */
export async function reserveGenerationQuota(userId: string): Promise<QuotaReservation | QuotaFailure> {
  let free: QuotaReservation | undefined;
  {
    const reserved = await db.user.updateMany({
      where: {
        id: userId,
      },
      data: { threeDGenerations: { increment: 1 } },
    });
    if (reserved.count > 0) {
      free = refundable(() => db.user.updateMany({
        where: { id: userId, threeDGenerations: { gt: 0 } },
        data: { threeDGenerations: { decrement: 1 } },
      }), "3D");
    } else {
      return {
        ok: false, status: 401, code: "AUTH_REQUIRED",
        error: "Требуется вход",
      };
    }
  }
  try {
    const ai = await consumeAiQuota(userId);
    if (!ai.ok) {
      await free?.refund();
      return ai;
    }
    return refundable(() => Promise.all([ai.refund(), free?.refund()]), "Generation");
  } catch (error) {
    await free?.refund();
    throw error;
  }
}
