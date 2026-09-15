export default function DashboardLoading() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10" aria-busy="true" aria-label="Загрузка">
      <div className="skeleton h-4 w-32" />
      <div className="skeleton mt-4 h-10 w-64" />
      <div className="skeleton mt-3 h-4 w-80" />
      <div className="skeleton mt-8 h-32 w-full" />
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="skeleton h-24" />
        <div className="skeleton h-24" />
        <div className="skeleton h-24" />
      </div>
      <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        <div className="skeleton h-40" />
        <div className="skeleton h-40" />
        <div className="skeleton h-40" />
      </div>
    </div>
  );
}
