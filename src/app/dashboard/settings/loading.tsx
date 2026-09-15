export default function SettingsLoading() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10" aria-busy="true" aria-label="Загрузка">
      <div className="skeleton h-3 w-28" />
      <div className="skeleton mt-3 h-9 w-52" />
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="skeleton h-72" />
        <div className="skeleton h-72" />
      </div>
    </div>
  );
}
