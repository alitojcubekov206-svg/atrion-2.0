"use client";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#050507",
          color: "#f3f0ff",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          textAlign: "center",
          padding: 24,
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Что-то пошло не так</h1>
          <p style={{ color: "#908a9e", marginTop: 12 }}>Попробуйте обновить страницу.</p>
          <button
            onClick={reset}
            style={{
              marginTop: 24,
              padding: "10px 24px",
              borderRadius: 999,
              border: "none",
              background: "#a78bfa",
              color: "#050507",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Попробовать снова
          </button>
        </div>
      </body>
    </html>
  );
}
