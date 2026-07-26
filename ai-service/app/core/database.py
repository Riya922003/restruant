import asyncio
import logging
from contextlib import contextmanager
from typing import Iterator

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from .config import get_settings

logger = logging.getLogger("ai-service")

# We use psycopg's SYNC pool and run queries in a threadpool (fetch_all/fetch_one
# are async wrappers via asyncio.to_thread). This is event-loop-agnostic: it works
# identically on Windows (ProactorEventLoop) and Linux (uvloop), unlike the async
# pool which cannot run on Windows' Proactor loop. AI endpoints are low-QPS so the
# threadpool hop is negligible.
_pool: ConnectionPool | None = None


def _conninfo() -> str:
    """Resolve the connection string, forcing SSL for non-local hosts (Neon).

    Mirrors the Phase 1 rule: plaintext for local Docker Postgres, SSL for hosted.
    A Neon URL usually already carries sslmode=require; we only add it if missing.
    """
    url = get_settings().database_url
    is_local = any(
        marker in url for marker in ("@localhost", "@127.0.0.1", "@host.docker.internal")
    )
    if not is_local and "sslmode=" not in url:
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}sslmode=require"
    return url


def open_pool() -> None:
    """Open the connection pool. Non-blocking (wait=False): the app boots even if
    the DB is briefly unreachable; queries fail only when actually issued."""
    global _pool
    if _pool is None:
        _pool = ConnectionPool(conninfo=_conninfo(), min_size=1, max_size=10, open=False)
    _pool.open(wait=False)
    logger.info("Database pool opened")


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None
        logger.info("Database pool closed")


def _fetch_all_sync(sql: str, params) -> list[dict]:
    assert _pool is not None, "Database pool is not initialized"
    with _pool.connection() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            return cur.fetchall()


async def fetch_all(sql: str, params=None) -> list[dict]:
    """Run a read query in a worker thread and return rows as dicts. Read-only by
    convention: this service only reads Phase 1 tables here (invoice writes are a
    separate, deliberate flow)."""
    return await asyncio.to_thread(_fetch_all_sync, sql, params)


async def fetch_one(sql: str, params=None) -> dict | None:
    rows = await fetch_all(sql, params)
    return rows[0] if rows else None


def _txn_sync(fn):
    assert _pool is not None, "Database pool is not initialized"
    # psycopg3 commits at block exit, rolls back on exception. fn gets the conn
    # and should use dict_row cursors. Used for the multi-statement approve flow.
    with _pool.connection() as conn:
        return fn(conn)


async def run_txn(fn):
    """Run fn(conn) inside one transaction in a worker thread. Commit on success,
    rollback on exception (Phase 1 invoice invariants must hold atomically)."""
    return await asyncio.to_thread(_txn_sync, fn)


@contextmanager
def get_sync_connection() -> Iterator[psycopg.Connection]:
    """Standalone synchronous connection for the RQ worker (spec 03), which runs in
    a separate process without the pool. Opens and closes per call."""
    conn = psycopg.connect(_conninfo())
    try:
        yield conn
    finally:
        conn.close()
