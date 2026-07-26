import logging

import cloudinary
import cloudinary.uploader

from app.core.config import get_settings

logger = logging.getLogger("ai-service")

_configured = False


def configure_cloudinary() -> None:
    """Configure the Cloudinary SDK from CLOUDINARY_URL. Safe to call on startup;
    a no-op (with a warning) when unset so local dev can use the .uploads fallback."""
    global _configured
    settings = get_settings()
    if not settings.cloudinary_url:
        logger.warning("CLOUDINARY_URL not set; invoice uploads will use local fallback")
        return
    cloudinary.config(cloudinary_url=settings.cloudinary_url, secure=True)
    _configured = True
    logger.info("Cloudinary configured")


def is_configured() -> bool:
    return _configured


def upload_invoice(file_bytes: bytes, filename: str, *, public_id_prefix: str = "invoices") -> dict:
    """Upload an original invoice file as a private resource. Used by the invoice
    pipeline (spec 03). Returns the identifiers we persist on the import row."""
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
        "bytes": result.get("bytes"),
        "format": result.get("format"),
    }
