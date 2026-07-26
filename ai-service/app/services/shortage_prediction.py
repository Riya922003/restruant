from app.core.database import fetch_all
from app.core.serialize import to_num
from app.services._recommend import ask_grok

# Baseline window used to derive average daily usage from recipe-driven consumption.
CONSUMPTION_WINDOW_DAYS = 30
MAX_ITEMS = 80

SYSTEM = (
    "You are an inventory analyst for a restaurant. You receive JSON with each "
    "ingredient's current_stock, reorder_level, unit, and avg_daily_usage over a "
    "recent window, plus a horizon in days. Identify ingredients likely to reach or "
    "fall below their reorder level (or zero) within the horizon. Reason ONLY from "
    "the supplied numbers; never invent ingredients or values. Return STRICT JSON: "
    '{"at_risk":[{"ingredient_id":int,"name":str,"unit":str,"current_stock":number,'
    '"reorder_level":number,"avg_daily_usage":number,"days_until_shortage":int|null,'
    '"risk":"low"|"medium"|"high","reason":str}],"summary":str}. '
    "Sort at_risk by risk (high first). If nothing is at risk, return an empty list."
)


async def predict(horizon_days: int) -> dict:
    ingredients = await fetch_all(
        """
        SELECT id, name, unit, current_stock, reorder_level, cost_per_unit
        FROM ingredients
        WHERE is_active = true
        ORDER BY name
        LIMIT %(limit)s
        """,
        {"limit": MAX_ITEMS},
    )
    usage_rows = await fetch_all(
        """
        SELECT ri.ingredient_id AS id,
               SUM(oi.quantity * ri.quantity / NULLIF(r.yield_servings, 0)) AS total_used
        FROM order_items oi
        JOIN orders o             ON o.id = oi.order_id
        JOIN recipes r            ON r.menu_item_id = oi.menu_item_id
        JOIN recipe_ingredients ri ON ri.recipe_id = r.id
        WHERE o.status <> 'cancelled'
          AND o.created_at >= now() - make_interval(days => %(w)s)
        GROUP BY ri.ingredient_id
        """,
        {"w": CONSUMPTION_WINDOW_DAYS},
    )
    usage = {r["id"]: (to_num(r["total_used"]) or 0) for r in usage_rows}

    items = []
    for r in ingredients:
        avg_daily = round((usage.get(r["id"], 0) or 0) / CONSUMPTION_WINDOW_DAYS, 3)
        items.append(
            {
                "ingredient_id": r["id"],
                "name": r["name"],
                "unit": r["unit"],
                "current_stock": to_num(r["current_stock"]),
                "reorder_level": to_num(r["reorder_level"]),
                "avg_daily_usage": avg_daily,
            }
        )

    summary = {
        "horizon_days": horizon_days,
        "window_days": CONSUMPTION_WINDOW_DAYS,
        "ingredients": items,
    }
    result = await ask_grok(SYSTEM, summary)
    result.setdefault("at_risk", [])
    result["context"] = {
        "horizon_days": horizon_days,
        "window_days": CONSUMPTION_WINDOW_DAYS,
        "ingredients_considered": len(items),
    }
    return result
