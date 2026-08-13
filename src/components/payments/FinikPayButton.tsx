"use client";

import { useState } from "react";

export default function FinikPayButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/payments/finik/checkout", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data.url !== "string") {
        setError(data.error ?? "Не удалось открыть оплату");
        return;
      }
      window.location.assign(data.url);
    } catch {
      setError("Нет соединения. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={pay}
        disabled={loading}
        className="btn-primary block w-full rounded-full py-3 text-center font-semibold text-white disabled:opacity-60"
      >
        {loading ? "Открываем Finik…" : "Оплатить 200 сом через Finik"}
      </button>
      {error && <p className="mt-3 text-center text-xs text-red-400">{error}</p>}
    </div>
  );
}
