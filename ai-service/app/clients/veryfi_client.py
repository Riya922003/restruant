import logging

from app.core.config import get_settings

logger = logging.getLogger("ai-service")


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

    Used by the invoice worker (spec 03). Raises on failure so the worker can mark
    the import as failed. Never logs credentials.
    """
    settings = get_settings()
    if not settings.veryfi_api_key:
        raise RuntimeError("Veryfi is not configured")

    import base64

    client = _client()
    encoded = base64.b64encode(file_bytes).decode("ascii")
    return client.process_document_base64string(
        base64_encoded_string=encoded,
        file_name=filename,
    )
