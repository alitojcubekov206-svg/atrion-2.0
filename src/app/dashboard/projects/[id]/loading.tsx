export default function ProjectLoading() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-10" aria-busy="true" aria-label="Загрузка">
      <div className="skeleton h-3 w-20" />
      <div className="skeleton mt-3 h-9 w-3/4" />
      <div className="skeleton mt-4 h-24 w-full" />
      <div className="mt-8 space-y-4">
        <div className="skeleton h-28" />
        <div className="skeleton h-28" />
        <div className="skeleton h-28" />
      </div>
    </div>
  );
}
