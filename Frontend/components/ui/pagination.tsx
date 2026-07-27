"use client";

import { Button } from "@/components/ui/primitives";

type PaginationProps = {
  page: number;
  totalPages: number;
  totalItems: number;
  start: number;
  end: number;
  onPageChange: (page: number) => void;
};

export function Pagination({
  page,
  totalPages,
  totalItems,
  start,
  end,
  onPageChange,
}: PaginationProps) {
  if (totalItems <= 10) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800">
      <span className="text-zinc-500 dark:text-zinc-400">
        Showing {start}-{end} of {totalItems}
      </span>
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          Page {page} of {totalPages}
        </span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Previous
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
