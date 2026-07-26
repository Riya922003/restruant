import json

from psycopg.types.json import Jsonb

from app.core.database import fetch_one


async def write_audit(actor_id, action: str, entity_type: str, entity_id, metadata: dict | None = None):
    """Append an audit_logs row (async path, used by request handlers)."""
    await fetch_one(
        """
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id
        """,
        [actor_id, action, entity_type, entity_id, Jsonb(metadata) if metadata is not None else None],
    )


def write_audit_sync(conn, actor_id, action: str, entity_type: str, entity_id, metadata: dict | None = None):
    """Append an audit_logs row on an existing connection (worker / txn path)."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
            VALUES (%s, %s, %s, %s, %s)
            """,
            [actor_id, action, entity_type, entity_id, Jsonb(metadata) if metadata is not None else None],
        )
