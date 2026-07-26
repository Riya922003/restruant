import logging
import os
import tempfile

from app.core.config import get_settings

logger = logging.getLogger("ai-service")

_MIME_EXT = {
    "application/pdf": ".pdf",
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
}


def _client():
    # Imported lazily so the module loads even before credentials are set.
    from veryfi import Client

    settings = get_settings()
    return Client(
        client_id=settings.veryfi_client_id,
        client_secret=settings.veryfi_client_secret,
        username=settings.veryfi_username,
        api_key=settings.veryfi_api_key,
    )


def process_document(file_bytes: bytes, filename: str, mime_type: str) -> dict:
    """Send an invoice (PDF or image) to Veryfi and return its raw structured JSON.

    The SDK reads from a file path, so we stage the bytes in a temp file and remove
    it afterwards. Used by the invoice worker (spec 03). Raises on failure so the
    worker marks the import failed. Never logs credentials.
    """
    settings = get_settings()
    if not settings.veryfi_api_key:
        raise RuntimeError("Veryfi is not configured")

    suffix = os.path.splitext(filename)[1] or _MIME_EXT.get(mime_type, "")
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    try:
        tmp.write(file_bytes)
        tmp.close()  # close so Veryfi can reopen the path (required on Windows)
        return _client().process_document(tmp.name)
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass
