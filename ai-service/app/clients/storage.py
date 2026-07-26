import logging
import re
import uuid
from pathlib import Path

import httpx

from app.clients import cloudinary_client

logger = logging.getLogger("ai-service")

# Local fallback directory (gitignored) used when Cloudinary is not configured, so
# the pipeline runs end to end in development without a Cloudinary account.
UPLOADS_DIR = Path(__file__).resolve().parents[2] / ".uploads"

_LOCAL_PREFIX = "local://"


def _safe(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]", "_", name)[:120] or "invoice"


def store_file(file_bytes: bytes, filename: str) -> dict:
    """Persist the original invoice file and return storage identifiers.

    Cloudinary (private) when configured, otherwise a local file. Returns
    { public_id, file_url }; file_url starting with local:// marks the fallback.
    """
    if cloudinary_client.is_configured():
        result = cloudinary_client.upload_invoice(file_bytes, filename)
        return {"public_id": result["public_id"], "file_url": result["secure_url"]}

    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}_{_safe(filename)}"
    path = UPLOADS_DIR / stored_name
    path.write_bytes(file_bytes)
    logger.warning("Stored invoice locally (Cloudinary not configured): %s", stored_name)
    return {"public_id": str(path), "file_url": f"{_LOCAL_PREFIX}{stored_name}"}


def is_local(file_url: str | None) -> bool:
    return bool(file_url) and file_url.startswith(_LOCAL_PREFIX)


def fetch_file(public_id: str | None, file_url: str | None) -> bytes:
    """Read the stored original back as bytes (for OCR in the worker)."""
    if is_local(file_url):
        # public_id holds the absolute local path written by store_file.
        return Path(public_id).read_bytes()

    # Cloudinary: ensure this process has credentials (the worker is separate from
    # the API), then build a signed URL for the private asset and fetch it.
    import cloudinary.utils

    cloudinary_client.ensure_configured()
    signed_url, _ = cloudinary.utils.cloudinary_url(
        public_id, resource_type="image", type="authenticated", sign_url=True
    )
    resp = httpx.get(signed_url, timeout=60)
    resp.raise_for_status()
    return resp.content
