import logging

from app.core.config import get_settings

logger = logging.getLogger("ai-service")


def get_queue():
    """Return an RQ Queue if Redis is reachable, else None so the caller can fall
    back to inline processing (spec 03 section 6: RQ in production, inline for a
    simple/dev setup without Redis)."""
    try:
        from redis import Redis
        from rq import Queue

        # Short timeouts so that when Redis is not configured (e.g. a free-tier
        # deploy with no worker) we fail fast and fall back to inline processing.
        conn = Redis.from_url(get_settings().redis_url, socket_connect_timeout=3, socket_timeout=3)
        conn.ping()
        return Queue("invoices", connection=conn)
    except Exception as exc:  # redis down / not installed / bad URL
        logger.warning("Redis/RQ unavailable (%s); invoices will process inline", exc)
        return None
