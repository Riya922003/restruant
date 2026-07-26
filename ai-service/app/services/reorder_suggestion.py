from app.core.database import fetch_all
from app.core.serialize import to_num
from app.services._recommend import ask_grok

USAGE_WINDOW_DAYS = 30
MAX_ITEMS = 60

SYSTEM = (
    "You are a purchasing assistant for a restaurant. You receive JSON with items "
    "(ingredients and/or products), each with current_stock, reorder_level, unit, "
    "avg_daily_usage, estimated_unit_cost, supplier_id, plus a cover_days target. "
    "For items that need replenishment, recommend a sensible order quantity that "
    "covers cover_days of demand above the reorder buffer, rounded to a practical "
    "unit, and the estimated cost. Skip well-stocked items. Reason ONLY from the "
    "supplied numbers. Return STRICT JSON: "
    '{"recommendations":[{"item_type":"ingredient"|"product","item_id":int,"name":str,'
    '"unit":str,"current_stock":number,"reorder_level":number,"avg_daily_usage":number,'
    '"suggested_order_qty":number,"estimated_unit_cost":number,"estimated_cost":number,'
    '"supplier_id":int|null,"reason":str}]}.'
)


async def _ingredient_items() -> list[dict]:
    rows = await fetch_all(
        """
        SELECT i.id, i.name, i.unit, i.current_stock, i.reorder_level,
               i.cost_per_unit, i.supplier_id
        FROM ingredients i
        WHERE i.is_active = true
        ORDER BY i.name
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
        {"w": USAGE_WINDOW_DAYS},
    )
    usage = {r["id"]: (to_num(r["total_used"]) or 0) for r in usage_rows}
    return [
        {
            "item_type": "ingredient",
            "item_id": r["id"],
            "name": r["name"],
            "unit": r["unit"],
            "current_stock": to_num(r["current_stock"]),
            "reorder_level": to_num(r["reorder_level"]),
            "avg_daily_usage": round((usage.get(r["id"], 0) or 0) / USAGE_WINDOW_DAYS, 3),
            "estimated_unit_cost": to_num(r["cost_per_unit"]),
            "supplier_id": r["supplier_id"],
        }
        for r in rows
    ]


async def _product_items() -> list[dict]:
    rows = await fetch_all(
        """
        SELECT p.id, p.name, p.unit, p.current_stock, p.reorder_level,
               p.cost_price, p.supplier_id
        FROM products p
        WHERE p.is_active = true
        ORDER BY p.name
        LIMIT %(limit)s
        """,
        {"limit": MAX_ITEMS},
    )
    out_rows = await fetch_all(
        """
        SELECT product_id AS id, SUM(quantity) AS total_out
        FROM stock_movements
        WHERE movement_type IN ('stock_out', 'wastage')
          AND created_at >= now() - make_interval(days => %(w)s)
        GROUP BY product_id
        """,
        {"w": USAGE_WINDOW_DAYS},
    )
    out = {r["id"]: (to_num(r["total_out"]) or 0) for r in out_rows}
    return [
        {
            "item_type": "product",
            "item_id": r["id"],
            "name": r["name"],
            "unit": r["unit"],
            "current_stock": to_num(r["current_stock"]),
            "reorder_level": to_num(r["reorder_level"]),
            "avg_daily_usage": round((out.get(r["id"], 0) or 0) / USAGE_WINDOW_DAYS, 3),
            "estimated_unit_cost": to_num(r["cost_price"]),
            "supplier_id": r["supplier_id"],
        }
        for r in rows
    ]


async def suggest(cover_days: int, scope: str) -> dict:
    items: list[dict] = []
    if scope in ("ingredients", "both"):
        items += await _ingredient_items()
    if scope in ("products", "both"):
        items += await _product_items()

    summary = {"cover_days": cover_days, "items": items}
    result = await ask_grok(SYSTEM, summary)
    result.setdefault("recommendations", [])
    result["context"] = {"scope": scope, "cover_days": cover_days, "items_considered": len(items)}
    return result
