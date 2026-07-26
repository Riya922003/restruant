import logging
import re
from datetime import datetime
from decimal import Decimal, InvalidOperation

from app.clients import veryfi_client
from app.core.config import get_settings

logger = logging.getLogger("ai-service")


def extract(file_bytes: bytes, filename: str, mime_type: str) -> dict:
    """Return normalized invoice data. Uses Veryfi when configured, otherwise a
    clearly-labeled stub so the pipeline is demoable without OCR credentials."""
    settings = get_settings()
    if settings.veryfi_api_key:
        raw = veryfi_client.process_document(file_bytes, filename, mime_type)
        data = _map_veryfi(raw)
        data["raw"] = raw
    else:
        logger.warning("Veryfi not configured; using stub extraction for %s", filename)
        data = _stub(filename)
    return _normalize(data)


def _map_veryfi(raw: dict) -> dict:
    vendor = raw.get("vendor") or {}
    line_items = [
        {
            "description": li.get("description"),
            "quantity": li.get("quantity"),
            "unit_price": li.get("price"),
            "line_total": li.get("total"),
        }
        for li in (raw.get("line_items") or [])
    ]
    return {
        "supplier_name": vendor.get("name"),
        "invoice_number": raw.get("invoice_number"),
        "invoice_date": raw.get("date"),
        "due_date": raw.get("due_date"),
        "currency": raw.get("currency_code"),
        "line_items": line_items,
        "subtotal": raw.get("subtotal"),
        "tax": raw.get("tax"),
        "total": raw.get("total"),
        "confidence": raw.get("confidence"),
        "notes": None,
    }


def _stub(filename: str) -> dict:
    base = re.sub(r"\.[^.]+$", "", filename)
    number = "INV-" + (re.sub(r"[^A-Za-z0-9]", "", base)[:12].upper() or "SAMPLE")
    return {
        "supplier_name": None,
        "invoice_number": number,
        "invoice_date": None,
        "due_date": None,
        "currency": None,
        "line_items": [
            {"description": "Sample item A", "quantity": 2, "unit_price": 100, "line_total": 200},
            {"description": "Sample item B", "quantity": 1, "unit_price": 150, "line_total": 150},
        ],
        "subtotal": 350,
        "tax": 17.5,
        "total": 367.5,
        "confidence": 20,
        "notes": "Stub extraction (Veryfi not configured). Verify every field before approval.",
    }


def _to_money(value) -> float | None:
    if value is None:
        return None
    try:
        cleaned = re.sub(r"[^0-9.\-]", "", str(value))
        if cleaned in ("", "-", ".", "-."):
            return None
        return float(round(Decimal(cleaned), 2))
    except (InvalidOperation, ValueError):
        return None


_DATE_FORMATS = (
    "%Y-%m-%d", "%Y/%m/%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y",
    "%d %b %Y", "%d %B %Y", "%b %d, %Y", "%B %d, %Y",
)


def _to_date(value) -> str | None:
    if not value:
        return None
    s = str(value).strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s[:19], fmt).date().isoformat()
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(s[:19]).date().isoformat()
    except ValueError:
        return None


def _normalize(data: dict) -> dict:
    items = []
    for li in data.get("line_items") or []:
        qty = _to_money(li.get("quantity"))
        unit = _to_money(li.get("unit_price"))
        total = _to_money(li.get("line_total"))
        if total is None and qty is not None and unit is not None:
            total = round(qty * unit, 2)
        items.append(
            {
                "description": (li.get("description") or "").strip() or "Item",
                "quantity": qty,
                "unit_price": unit,
                "line_total": total,
            }
        )

    subtotal = _to_money(data.get("subtotal"))
    tax = _to_money(data.get("tax"))
    total = _to_money(data.get("total"))
    notes = data.get("notes")
    confidence = data.get("confidence")
    try:
        confidence = max(0.0, min(100.0, float(confidence))) if confidence is not None else None
    except (TypeError, ValueError):
        confidence = None

    # Cross-check the line-item sum against the stated total; flag drift, do not
    # silently "fix" it, and lower confidence so the reviewer looks closer.
    line_sum = round(sum(i["line_total"] for i in items if i["line_total"]), 2)
    if total is not None and line_sum and abs(line_sum - total) > max(1.0, 0.02 * total):
        drift = f"Line-item sum {line_sum} differs from stated total {total}."
        notes = f"{notes} {drift}".strip() if notes else drift
        confidence = min(confidence, 40.0) if confidence is not None else 40.0

    normalized = {
        "supplier_name": (data.get("supplier_name") or None),
        "invoice_number": (data.get("invoice_number") or None),
        "invoice_date": _to_date(data.get("invoice_date")),
        "due_date": _to_date(data.get("due_date")),
        "currency": (data.get("currency") or None),
        "line_items": items,
        "subtotal": subtotal,
        "tax": tax,
        "total": total,
        "confidence": confidence,
        "notes": notes,
    }
    if "raw" in data:
        normalized["raw"] = data["raw"]
    return normalized
