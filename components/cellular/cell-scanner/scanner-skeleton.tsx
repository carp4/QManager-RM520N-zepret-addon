import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton loading state for scanner tables.
 * Shows a filter bar, table header, rows, and footer.
 *
 * @param headerCols - Number of columns in the table header skeleton
 * @param rowCols    - Number of data columns per row (excludes the leading badge)
 */
export function ScannerSkeleton({
  headerCols = 8,
  rowCols = 7,
}: {
  headerCols?: number;
  rowCols?: number;
}) {
  return (
    <div className="space-y-3">
      {/* Filter bar skeleton */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-9 w-64 rounded-md" />
        <Skeleton className="h-9 w-28 rounded-md" />
      </div>
      {/* Table skeleton */}
      <div className="rounded-lg border overflow-hidden">
        {/* Header */}
        <div className="bg-muted px-4 py-3 flex gap-4">
          {Array.from({ length: headerCols }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1 rounded" />
          ))}
        </div>
        {/* Rows */}
        {Array.from({ length: 5 }).map((_, rowIdx) => (
          <div key={rowIdx} className="px-4 py-3 flex gap-4 border-t">
            <Skeleton className="h-5 w-12 rounded-full" />
            {Array.from({ length: rowCols }).map((_, colIdx) => (
              <Skeleton key={colIdx} className="h-4 flex-1 rounded" />
            ))}
          </div>
        ))}
      </div>
      {/* Footer skeleton */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-8 w-16 rounded-md" />
        </div>
      </div>
    </div>
  );
}
