"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { aiApi, aiDownload, aiList, aiUpload } from "@/lib/ai-api";
import { useApi } from "@/lib/use-api";
import { formatDateTime } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/field";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
} from "@/components/ui/primitives";
import { InvoiceReview } from "@/components/ai/invoice-review";
import type { ImportRow, UploadResult } from "@/types/ai";

type Supplier = { id: number; name: string };

const STATUS_TONE: Record<string, "zinc" | "blue" | "amber" | "violet" | "red" | "green"> = {
  uploaded: "zinc",
  queued: "blue",
  processing: "amber",
  extracted: "violet",
  failed: "red",
  approved: "green",
  rejected: "zinc",
};

const ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp";

export default function InvoiceAiPage() {
  const { data, loading, error, refetch } = useApi(
    () => aiList<ImportRow>("/ai/invoices/imports?limit=100"),
    [],
  );
  const { data: suppliers } = useApi(
    () => api.list<Supplier>("/suppliers?limit=200&is_active=all"),
    [],
  );

  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  // Poll while any import is still being processed.
  useEffect(() => {
    const pending = data?.data.some((r) =>
      ["uploaded", "queued", "processing"].includes(r.status),
    );
    if (!pending) return;
    const timer = setInterval(refetch, 3000);
    return () => clearInterval(timer);
  }, [data, refetch]);

  async function doUpload() {
    if (!files.length) return;
    setUploading(true);
    setUploadError(null);
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f, f.name));
    try {
      await aiUpload<UploadResult>("/ai/invoices/upload", fd);
      setFiles([]);
      if (fileInput.current) fileInput.current.value = "";
      refetch();
    } catch (err) {
      setUploadError(
        err instanceof ApiError
          ? err.errors?.map((e) => `${e.field}: ${e.message}`).join(" · ") || err.message
          : "Upload failed",
      );
    } finally {
      setUploading(false);
    }
  }

  async function doRename(id: number, current: string) {
    const name = window.prompt("Rename file", current);
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === current) return;
    try {
      await aiApi.patch(`/ai/invoices/imports/${id}`, { original_filename: trimmed });
      refetch();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Rename failed");
    }
  }

  async function doDelete(id: number, name: string) {
    if (!confirm(`Delete "${name}"? This removes the uploaded file and its extraction.`)) return;
    try {
      await aiApi.del(`/ai/invoices/imports/${id}`);
      refetch();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  async function doExport() {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    try {
      await aiDownload(`/ai/invoices/expense-register.xlsx?${qs.toString()}`, "expense-register.xlsx");
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Export failed");
    }
  }

  if (selected != null) {
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader title="Review invoice" subtitle="Check the extracted data, then approve or reject." />
        <InvoiceReview
          importId={selected}
          suppliers={suppliers?.data ?? []}
          onClose={() => setSelected(null)}
          onChanged={refetch}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Invoice AI"
        subtitle="Upload supplier invoices — AI extracts the data for you to review and approve."
      />

      {/* Upload */}
      <Card className="mb-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={ACCEPT}
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="block text-sm text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-800"
          />
          <Button onClick={doUpload} disabled={uploading || files.length === 0}>
            {uploading ? "Uploading..." : `Upload ${files.length || ""}`.trim()}
          </Button>
          {files.length > 0 ? (
            <span className="text-xs text-zinc-500">
              {files.map((f) => f.name).join(", ")}
            </span>
          ) : (
            <span className="text-xs text-zinc-400">PDF or image · printed or handwritten · up to 20 files</span>
          )}
        </div>
        {uploadError ? <p className="mt-2 text-sm text-red-700">{uploadError}</p> : null}
      </Card>

      {/* Export */}
      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Expense register (Excel)</p>
          <div className="flex items-end gap-2">
            <label className="text-xs text-zinc-500">
              From
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-0.5" />
            </label>
            <label className="text-xs text-zinc-500">
              To
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-0.5" />
            </label>
            <Button variant="secondary" onClick={doExport}>Export .xlsx</Button>
          </div>
        </div>
      </Card>

      {/* Imports list. Only show the full loading/error states on the first load;
          during background polling we keep the table visible (row spinners show
          progress) so a refetch never flashes like an error. */}
      {loading && !data ? (
        <LoadingState />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : !data || data.data.length === 0 ? (
        <EmptyState title="No invoices yet" description="Upload one or more supplier invoices to get started." />
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-3">File</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Confidence</th>
                <th className="px-4 py-3">Supplier</th>
                <th className="px-4 py-3">Uploaded</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                  <td className="px-4 py-3 font-medium text-zinc-900">
                    <span className="inline-flex items-center gap-1.5">
                      {r.original_filename}
                      <button
                        onClick={() => doRename(r.id, r.original_filename)}
                        className="text-xs text-zinc-400 hover:text-zinc-700"
                        title="Rename file"
                        aria-label="Rename file"
                      >
                        ✎
                      </button>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5">
                      {["queued", "processing", "uploaded"].includes(r.status) ? (
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
                      ) : null}
                      <Badge tone={STATUS_TONE[r.status] ?? "zinc"}>{r.status}</Badge>
                    </span>
                    {r.status === "failed" && r.error_message ? (
                      <p className="mt-1 max-w-xs text-xs text-red-600">{r.error_message}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {r.extraction_confidence != null ? `${r.extraction_confidence}%` : "-"}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {r.matched_supplier_name ?? r.extracted_supplier_name ?? "-"}
                    {!r.matched_supplier_name && r.extracted_supplier_name ? (
                      <span className="ml-1 text-xs text-amber-600">(unmatched)</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">{formatDateTime(r.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={["queued", "processing", "uploaded"].includes(r.status)}
                        onClick={() => setSelected(r.id)}
                      >
                        {r.status === "approved" || r.status === "rejected" ? "View" : "Review"}
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => doDelete(r.id, r.original_filename)}>
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
