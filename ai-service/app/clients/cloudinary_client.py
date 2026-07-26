import logging
from urllib.parse import urlparse

import cloudinary
import cloudinary.uploader

from app.core.config import get_settings

logger = logging.getLogger("ai-service")

_configured = False


def ensure_configured() -> bool:
    """Configure the Cloudinary SDK once per process, lazily. Safe to call from
    both the API and the RQ worker (separate processes). Returns True if
    credentials are available, False to signal the local .uploads fallback.

    We parse CLOUDINARY_URL and pass explicit credentials because the SDK only
    reads that env var at import time; setting it afterwards does not populate
    cloud_name/api_key.
    """
    global _configured
    if _configured:
        return True
    url = get_settings().cloudinary_url
    if not url:
        return False
    parsed = urlparse(url)  # cloudinary://<api_key>:<api_secret>@<cloud_name>
    cloudinary.config(
        cloud_name=parsed.hostname,
        api_key=parsed.username,
        api_secret=parsed.password,
        secure=True,
    )
    _configured = True
    return True


def configure_cloudinary() -> None:
    """Called on API startup for an early log; configuration itself is lazy."""
    if ensure_configured():
        logger.info("Cloudinary configured")
    else:
        logger.warning("CLOUDINARY_URL not set; invoice uploads will use local fallback")


def is_configured() -> bool:
    return ensure_configured()


def upload_invoice(file_bytes: bytes, filename: str, *, public_id_prefix: str = "invoices") -> dict:
    """Upload an original invoice file as a private resource. Returns the
    identifiers we persist on the import row."""
    ensure_configured()
    result = cloudinary.uploader.upload(
        file_bytes,
        folder=public_id_prefix,
        resource_type="auto",
        type="authenticated",
        use_filename=True,
        unique_filename=True,
        filename_override=filename,
    )
    return {
        "public_id": result.get("public_id"),
        "secure_url": result.get("secure_url"),
        "resource_type": result.get("resource_type"),
        "bytes": result.get("bytes"),
        "format": result.get("format"),
    }
