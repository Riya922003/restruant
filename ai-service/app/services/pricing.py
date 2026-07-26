from app.core.database import fetch_all
from app.core.serialize import to_num
from app.services._recommend import ask_grok

POPULARITY_WINDOW_DAYS = 30
MAX_ITEMS = 60

SYSTEM = (
    "You are a menu pricing analyst for a restaurant. You receive JSON with menu "
    "items, each with unit_cost, current_price, current_margin_pct, and units_sold "
    "over a recent window, plus a target_margin_pct. Suggest a price per item that "
    "moves toward the target margin while respecting demand: do not over-hike strong "
    "sellers, and flag clearly underpriced items. Reason ONLY from the supplied "
    "numbers. Return STRICT JSON: "
    '{"suggestions":[{"menu_item_id":int,"name":str,"unit_cost":number,'
    '"current_price":number,"current_margin_pct":number,"suggested_price":number,'
    '"suggested_margin_pct":number,"popularity_rank":int|null,"rationale":str}]}.'
)


async def suggest(menu_item_id: int | None, target_margin_pct: float) -> dict:
    params: dict = {"limit": MAX_ITEMS}
    where = "mi.is_active = true"
    if menu_item_id is not None:
        where += " AND mi.id = %(id)s"
        params["id"] = menu_item_id

    items_rows = await fetch_all(
        f"""
        SELECT mi.id, mi.name, mi.price, mi.cost,
               COALESCE((
                 SELECT SUM(ri.quantity * ing.cost_per_unit) / NULLIF(r.yield_servings, 0)
                 FROM recipes r
                 JOIN recipe_ingredients ri ON ri.recipe_id = r.id
                 JOIN ingredients ing       ON ing.id = ri.ingredient_id
                 WHERE r.menu_item_id = mi.id
                 GROUP BY r.yield_servings
               ), 0) AS recipe_cost
        FROM menu_items mi
        WHERE {where}
        ORDER BY mi.name
        LIMIT %(limit)s
        """,
        params,
    )
    pop_rows = await fetch_all(
        """
        SELECT oi.menu_item_id AS id, SUM(oi.quantity) AS units_sold
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE o.status <> 'cancelled'
          AND o.created_at >= now() - make_interval(days => %(w)s)
        GROUP BY oi.menu_item_id
        """,
        {"w": POPULARITY_WINDOW_DAYS},
    )
    popularity = {r["id"]: (to_num(r["units_sold"]) or 0) for r in pop_rows}

    items = []
    for r in items_rows:
        recipe_cost = to_num(r["recipe_cost"]) or 0
        unit_cost = recipe_cost if recipe_cost > 0 else (to_num(r["cost"]) or 0)
        price = to_num(r["price"]) or 0
        margin = round(100.0 * (price - unit_cost) / price, 1) if price else 0
        items.append(
            {
                "menu_item_id": r["id"],
                "name": r["name"],
                "unit_cost": round(unit_cost, 2),
                "current_price": price,
                "current_margin_pct": margin,
                "units_sold": popularity.get(r["id"], 0),
            }
        )

    summary = {"target_margin_pct": target_margin_pct, "menu_items": items}
    result = await ask_grok(SYSTEM, summary)
    result.setdefault("suggestions", [])
    result["context"] = {
        "target_margin_pct": target_margin_pct,
        "window_days": POPULARITY_WINDOW_DAYS,
        "items_considered": len(items),
    }
    return result
