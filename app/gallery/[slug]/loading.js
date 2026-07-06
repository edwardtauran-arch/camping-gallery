export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Header skeleton */}
      <div>
        <div className="h-4 w-32 bg-slate-200 rounded mb-4" />
        <div className="h-8 w-72 bg-slate-200 rounded mb-2" />
        <div className="h-4 w-48 bg-slate-200 rounded" />
      </div>

      {/* Toolbar skeleton */}
      <div className="flex justify-between items-center">
        <div className="h-4 w-44 bg-slate-200 rounded" />
        <div className="flex gap-3">
          <div className="h-9 w-32 bg-slate-200 rounded-lg" />
          <div className="h-9 w-24 bg-slate-200 rounded-lg" />
        </div>
      </div>

      {/* Photo grid skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-4">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="aspect-square bg-slate-200 rounded-lg"
            style={{ animationDelay: `${i * 50}ms` }}
          />
        ))}
      </div>

      {/* Loading indicator */}
      <div className="flex flex-col items-center justify-center py-8 gap-3">
        <div className="relative flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-emerald-600 rounded-full animate-spin" />
        </div>
        <p className="text-sm font-medium text-slate-500">Memuat galeri foto...</p>
      </div>
    </div>
  );
}
