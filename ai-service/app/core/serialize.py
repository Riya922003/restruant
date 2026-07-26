from decimal import Decimal
from typing import Any


def to_num(value: Any) -> Any:
    """Mirror of Phase 1's toNum: coerce numeric-ish DB values to plain numbers.

    Money comes back from psycopg as Decimal; the frontend expects fixed-2 numbers.
    None passes through. Non-numeric values are returned unchanged.
    """
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    return value
