from psycopg.types.json import Jsonb

from app.core.database import fetch_all, fetch_one


async def save(feature: str, result: dict, user_id: int) -> None:
    """Upsert the latest result for a feature so the dashboard can read it back
    without re-calling the model."""
    await fetch_one(
        """
        INSERT INTO ai_insight_cache (feature, result, generated_by, generated_at)
        VALUES (%s, %s, %s, now())
        ON CONFLICT (feature) DO UPDATE
          SET result = EXCLUDED.result,
              generated_by = EXCLUDED.generated_by,
              generated_at = now()
        RETURNING feature
        """,
        [feature, Jsonb(result), user_id],
    )


async def get_many(features: list[str]) -> dict:
    if not features:
        return {}
    rows = await fetch_all(
        "SELECT feature, result, generated_at FROM ai_insight_cache WHERE feature = ANY(%s)",
        [features],
    )
    return {
        r["feature"]: {"result": r["result"], "generated_at": r["generated_at"]}
        for r in rows
    }
