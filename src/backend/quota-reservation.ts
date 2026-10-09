export type QuotaReservation = { ok: true; refund: () => Promise<void> };
export type QuotaFailure = { ok: false; error: string; code: string; status: number };

/** One request owns one reservation, including concurrent calls to its refund. */
export function refundable(action: () => Promise<unknown>, label: string): QuotaReservation {
  let refund: Promise<void> | undefined;
  return {
    ok: true,
    refund: () => refund ??= Promise.resolve().then(action).then(() => undefined).catch(() => {
      console.error(`${label} quota refund failed`);
    }),
  };
}
