import asyncio
import math
from datetime import date

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.core.database import fetch_all, fetch_one, run_txn
from app.core.errors import ApiError
from app.services.audit import write_audit, write_audit_sync

MAX_FILES = 20
MAX_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_MIME = {"application/pdf", "image/png", "image/jpeg", "image/webp"}


# --- Upload --------------------------------------------------------------------
async def upload(user, files, background_tasks) -> dict:
    if not files:
        raise ApiError(422, "No files were uploaded")
    if len(files) > MAX_FILES:
        raise ApiError(422, f"Too many files (max {MAX_FILES})")

    payloads = []
    errors = []
    for f in files:
        content = await f.read()
        if f.content_type not in ALLOWED_MIME:
            errors.append({"field": f.filename, "message": f"Unsupported type {f.content_type}"})
        elif not content:
            errors.append({"field": f.filename, "message": "File is empty"})
        elif len(content) > MAX_BYTES:
            errors.append({"field": f.filename, "message": "File exceeds 10 MB"})
        else:
            payloads.append((f.filename, f.content_type, content))
    if errors:
        raise ApiError(422, "Some files could not be accepted", errors=errors)

    batch = await fetch_one(
        "INSERT INTO invoice_import_batches (uploaded_by, file_count) VALUES (%s, %s) RETURNING id",
        [user.id, len(payloads)],
    )
    batch_id = batch["id"]

    from app.clients import storage
    from app.workers.invoice_worker import process_invoice_import
    from app.workers.queue import get_queue

    queue = get_queue()
    imports = []
    for filename, mime, content in payloads:
        row = await fetch_one(
            """
            INSERT INTO invoice_imports (batch_id, uploaded_by, original_filename, mime_type, file_size, status)
            VALUES (%s, %s, %s, %s, %s, 'uploaded') RETURNING id
            """,
            [batch_id, user.id, filename, mime, len(content)],
        )
        import_id = row["id"]
        try:
            stored = await asyncio.to_thread(storage.store_file, content, filename)
            await fetch_one(
                "UPDATE invoice_imports SET file_url=%s, cloudinary_public_id=%s, status='queued' WHERE id=%s RETURNING id",
                [stored["file_url"], stored["public_id"], import_id],
            )
            await write_audit(user.id, "invoice.uploaded", "invoice_import", import_id, {"filename": filename})
            if queue is not None:
                queue.enqueue(process_invoice_import, import_id)
            else:
                background_tasks.add_task(process_invoice_import, import_id)
            imports.append({"id": import_id, "original_filename": filename, "status": "queued"})
        except Exception as exc:
            await fetch_one(
                "UPDATE invoice_imports SET status='failed', error_message=%s WHERE id=%s RETURNING id",
                [str(exc)[:500], import_id],
            )
            imports.append({"id": import_id, "original_filename": filename, "status": "failed"})

    return {"batch_id": batch_id, "imports": imports}


# --- Reads ---------------------------------------------------------------------
async def list_imports(status: str | None, batch_id: int | None, page: int, limit: int):
    where, params = [], {}
    if status:
        where.append("i.status = %(status)s")
        params["status"] = status
    if batch_id:
        where.append("i.batch_id = %(batch_id)s")
        params["batch_id"] = batch_id
    clause = ("WHERE " + " AND ".join(where)) if where else ""

    total = (await fetch_one(f"SELECT count(*) AS c FROM invoice_imports i {clause}", params))["c"]
    params["limit"] = limit
    params["offset"] = (page - 1) * limit
    rows = await fetch_all(
        f"""
        SELECT i.id, i.batch_id, i.original_filename, i.mime_type, i.status,
               i.extraction_confidence, i.error_message, i.matched_supplier_id,
               i.created_invoice_id, i.file_url, i.created_at,
               s.name AS matched_supplier_name,
               i.extracted_data->>'supplier_name' AS extracted_supplier_name
        FROM invoice_imports i
        LEFT JOIN suppliers s ON s.id = i.matched_supplier_id
        {clause}
        ORDER BY i.created_at DESC
        LIMIT %(limit)s OFFSET %(offset)s
        """,
        params,
    )
    meta = {"page": page, "limit": limit, "total": total, "totalPages": math.ceil(total / limit) if total else 0}
    return rows, meta


async def get_import(import_id: int) -> dict:
    row = await fetch_one(
        """
        SELECT i.*, s.name AS matched_supplier_name
        FROM invoice_imports i
        LEFT JOIN suppliers s ON s.id = i.matched_supplier_id
        WHERE i.id = %s
        """,
        [import_id],
    )
    if not row:
        raise ApiError(404, "Invoice import not found")
    row.pop("cloudinary_public_id", None)  # internal storage detail, not for clients
    return row


async def get_file(import_id: int):
    row = await fetch_one(
        "SELECT original_filename, mime_type, cloudinary_public_id, file_url FROM invoice_imports WHERE id = %s",
        [import_id],
    )
    if not row:
        raise ApiError(404, "Invoice import not found")
    from app.clients import storage

    data = await asyncio.to_thread(storage.fetch_file, row["cloudinary_public_id"], row["file_url"])
    return data, row["mime_type"], row["original_filename"]


# --- Correct / reject ----------------------------------------------------------
async def patch_import(import_id: int, payload, user) -> dict:
    row = await fetch_one("SELECT status FROM invoice_imports WHERE id = %s", [import_id])
    if not row:
        raise ApiError(404, "Invoice import not found")

    changes = []
    # Renaming is just a display label, so it is allowed at any status.
    if payload.original_filename is not None:
        name = payload.original_filename.strip()
        if not name:
            raise ApiError(422, "Filename cannot be empty",
                           errors=[{"field": "original_filename", "message": "Required"}])
        await fetch_one(
            "UPDATE invoice_imports SET original_filename = %s WHERE id = %s RETURNING id",
            [name, import_id],
        )
        changes.append("renamed")
    # Editing the extraction is only valid before approval/rejection.
    if payload.extracted_data is not None:
        if row["status"] not in ("extracted", "failed"):
            raise ApiError(409, "Only extracted or failed imports can be edited")
        await fetch_one(
            "UPDATE invoice_imports SET extracted_data = %s WHERE id = %s RETURNING id",
            [Jsonb(payload.extracted_data.model_dump()), import_id],
        )
        changes.append("corrected")

    if not changes:
        raise ApiError(422, "Nothing to update")
    action = "invoice.renamed" if changes == ["renamed"] else "invoice.corrected"
    await write_audit(user.id, action, "invoice_import", import_id, {"changes": changes})
    return await get_import(import_id)


async def reject(import_id: int, user) -> dict:
    row = await fetch_one("SELECT status FROM invoice_imports WHERE id = %s", [import_id])
    if not row:
        raise ApiError(404, "Invoice import not found")
    if row["status"] in ("approved", "rejected"):
        raise ApiError(409, f"Import is already {row['status']}")
    await fetch_one("UPDATE invoice_imports SET status='rejected' WHERE id=%s RETURNING id", [import_id])
    await write_audit(user.id, "invoice.rejected", "invoice_import", import_id, None)
    return await get_import(import_id)


async def delete_import(import_id: int, user) -> dict:
    row = await fetch_one(
        "SELECT cloudinary_public_id, file_url FROM invoice_imports WHERE id = %s", [import_id]
    )
    if not row:
        raise ApiError(404, "Invoice import not found")
    from app.clients import storage

    # Best-effort removal of the stored original; never block the delete on it.
    try:
        await asyncio.to_thread(storage.delete_file, row["cloudinary_public_id"], row["file_url"])
    except Exception:
        pass
    await fetch_one("DELETE FROM invoice_imports WHERE id = %s RETURNING id", [import_id])
    await write_audit(user.id, "invoice.deleted", "invoice_import", import_id, None)
    return {"deleted": True, "id": import_id}


# --- Approve (transactional) ---------------------------------------------------
async def approve(import_id: int, req, user) -> dict:
    def _do(conn):
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute("SELECT * FROM invoice_imports WHERE id = %s", [import_id])
            imp = cur.fetchone()
            if not imp:
                raise ApiError(404, "Invoice import not found")
            if imp["status"] not in ("extracted", "failed"):
                raise ApiError(409, "Only extracted imports can be approved")

            data = imp["extracted_data"] or {}
            supplier_id = req.supplier_id or imp["matched_supplier_id"]
            if not supplier_id:
                raise ApiError(422, "A supplier must be selected",
                               errors=[{"field": "supplier_id", "message": "Required"}])
            invoice_number = (data.get("invoice_number") or "").strip()
            if not invoice_number:
                raise ApiError(422, "An invoice number is required",
                               errors=[{"field": "invoice_number", "message": "Required"}])

            cur.execute(
                "SELECT id FROM supplier_invoices WHERE supplier_id = %s AND invoice_number = %s",
                [supplier_id, invoice_number],
            )
            if cur.fetchone():
                raise ApiError(409, f"Invoice {invoice_number} already exists for this supplier")

            subtotal = data.get("subtotal") or 0
            tax = data.get("tax") or 0
            total = data.get("total") or 0
            raw = data.get("raw") or data
            cur.execute(
                """
                INSERT INTO supplier_invoices
                  (invoice_number, supplier_id, invoice_date, due_date, subtotal, tax, total,
                   status, file_url, ocr_raw, created_by)
                VALUES (%s,%s,%s,%s,%s,%s,%s,'pending',%s,%s,%s)
                RETURNING id
                """,
                [invoice_number, supplier_id, data.get("invoice_date"), data.get("due_date"),
                 subtotal, tax, total, imp["file_url"], Jsonb(raw), user.id],
            )
            invoice_id = cur.fetchone()["id"]

            for li in data.get("line_items") or []:
                qty = li.get("quantity")
                if qty is None or qty <= 0:
                    continue  # supplier_invoice_items enforces quantity > 0
                unit = li.get("unit_price") or 0
                line_total = li.get("line_total")
                if line_total is None:
                    line_total = round(qty * unit, 2)
                cur.execute(
                    """
                    INSERT INTO supplier_invoice_items (invoice_id, description, quantity, unit_price, line_total)
                    VALUES (%s,%s,%s,%s,%s)
                    """,
                    [invoice_id, (li.get("description") or "Item"), qty, unit, line_total],
                )

            if req.create_expense_record:
                category_id = _get_or_create_category(cur)
                expense_date = data.get("invoice_date") or date.today().isoformat()
                cur.execute(
                    """
                    INSERT INTO expense_records
                      (category_id, supplier_id, invoice_id, description, amount, expense_date, created_by)
                    VALUES (%s,%s,%s,%s,%s,%s,%s)
                    """,
                    [category_id, supplier_id, invoice_id, f"Invoice {invoice_number}", total, expense_date, user.id],
                )

            cur.execute(
                "UPDATE invoice_imports SET status='approved', created_invoice_id=%s, matched_supplier_id=%s WHERE id=%s",
                [invoice_id, supplier_id, import_id],
            )
            write_audit_sync(conn, user.id, "invoice.approved", "supplier_invoice", invoice_id,
                             {"import_id": import_id, "invoice_number": invoice_number})
            return {"invoice_id": invoice_id, "invoice_number": invoice_number, "supplier_id": supplier_id}

    return await run_txn(_do)


def _get_or_create_category(cur) -> int:
    cur.execute("SELECT id FROM expense_categories WHERE lower(name) = lower('Supplier Invoices') LIMIT 1")
    row = cur.fetchone()
    if row:
        return row["id"]
    cur.execute("SELECT id FROM expense_categories WHERE is_active = true ORDER BY id LIMIT 1")
    row = cur.fetchone()
    if row:
        return row["id"]
    cur.execute("INSERT INTO expense_categories (name) VALUES ('Supplier Invoices') RETURNING id")
    return cur.fetchone()["id"]


# --- Excel export --------------------------------------------------------------
async def expense_register_rows(date_from: str | None, date_to: str | None, supplier_id: int | None):
    where = ["si.status <> 'disputed'"]
    params = {}
    if date_from:
        where.append("si.invoice_date >= %(from)s")
        params["from"] = date_from
    if date_to:
        where.append("si.invoice_date <= %(to)s")
        params["to"] = date_to
    if supplier_id:
        where.append("si.supplier_id = %(sid)s")
        params["sid"] = supplier_id
    clause = "WHERE " + " AND ".join(where)
    return await fetch_all(
        f"""
        SELECT si.invoice_date, si.invoice_number, si.subtotal, si.tax, si.total, si.status,
               s.name AS supplier_name,
               (SELECT ec.name FROM expense_records er
                  JOIN expense_categories ec ON ec.id = er.category_id
                  WHERE er.invoice_id = si.id LIMIT 1) AS category_name
        FROM supplier_invoices si
        JOIN suppliers s ON s.id = si.supplier_id
        {clause}
        ORDER BY si.invoice_date NULLS LAST, si.id
        """,
        params,
    )
