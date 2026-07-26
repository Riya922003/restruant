import logging

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.core.database import get_sync_connection
from app.services import ocr_service
from app.services.audit import write_audit_sync

logger = logging.getLogger("ai-service")

# Statuses from which extraction may (re)start.
_STARTABLE = ("uploaded", "queued", "processing")


def process_invoice_import(import_id: int) -> None:
    """RQ/background job: fetch the file, run OCR, persist the extraction. Runs in
    a separate process (RQ) or a background thread (inline), so it uses a
    standalone sync connection and manages its own transactions."""
    with get_sync_connection() as conn:
        row = _load(conn, import_id)
        if row is None or row["status"] not in _STARTABLE:
            return
        _update(conn, import_id, "processing")
        conn.commit()

        try:
            from app.clients import storage

            file_bytes = storage.fetch_file(row["cloudinary_public_id"], row["file_url"])
            data = ocr_service.extract(file_bytes, row["original_filename"], row["mime_type"])
            supplier_id = _match_supplier(conn, data.get("supplier_name"))
            confidence = data.get("confidence")
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE invoice_imports
                    SET extracted_data = %s, extraction_confidence = %s,
                        matched_supplier_id = %s, status = 'extracted', error_message = NULL
                    WHERE id = %s
                    """,
                    [Jsonb(data), confidence, supplier_id, import_id],
                )
            write_audit_sync(
                conn, row["uploaded_by"], "invoice.extracted", "invoice_import", import_id,
                {"confidence": confidence, "supplier_matched": supplier_id is not None},
            )
            conn.commit()
        except Exception as exc:
            conn.rollback()
            logger.exception("Extraction failed for import %s", import_id)
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE invoice_imports SET status = 'failed', error_message = %s WHERE id = %s",
                    [str(exc)[:500], import_id],
                )
            write_audit_sync(
                conn, row["uploaded_by"], "invoice.extraction_failed", "invoice_import", import_id,
                {"error": str(exc)[:200]},
            )
            conn.commit()
        finally:
            _update_batch(conn, row["batch_id"])
            conn.commit()


def _load(conn, import_id):
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT * FROM invoice_imports WHERE id = %s", [import_id])
        return cur.fetchone()


def _update(conn, import_id, status):
    with conn.cursor() as cur:
        cur.execute("UPDATE invoice_imports SET status = %s WHERE id = %s", [status, import_id])


def _match_supplier(conn, name):
    if not name:
        return None
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT id FROM suppliers WHERE lower(name) = lower(%s) LIMIT 1", [name])
        exact = cur.fetchone()
        if exact:
            return exact["id"]
        cur.execute(
            "SELECT id FROM suppliers WHERE name ILIKE %s ORDER BY length(name) LIMIT 1",
            [f"%{name}%"],
        )
        fuzzy = cur.fetchone()
        return fuzzy["id"] if fuzzy else None


def _update_batch(conn, batch_id):
    if not batch_id:
        return
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT count(*) AS total,
                   count(*) FILTER (WHERE status IN ('extracted','failed','approved','rejected')) AS done,
                   count(*) FILTER (WHERE status = 'failed') AS failed
            FROM invoice_imports WHERE batch_id = %s
            """,
            [batch_id],
        )
        s = cur.fetchone()
    if s and s["total"] == s["done"]:
        status = "partial" if s["failed"] > 0 else "complete"
        with conn.cursor() as cur:
            cur.execute("UPDATE invoice_import_batches SET status = %s WHERE id = %s", [status, batch_id])
