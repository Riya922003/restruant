from app.core.database import fetch_all
from app.core.serialize import to_num
from app.services._recommend import ask_grok

MAX_ITEMS = 60

SYSTEM = (
    "You are a kitchen operations analyst. You receive JSON with menu items, each "
    "with existing_prep_time_minutes (may be null), yield_servings, ingredient_count, "
    "total_ingredient_qty, and instructions_length. Estimate the preparation time in "
    "minutes from recipe complexity. Where an existing prep time is present, treat it "
    "as a prior and reconcile. Reason ONLY from the supplied numbers. Return STRICT "
    'JSON: {"estimates":[{"menu_item_id":int,"name":str,'
    '"existing_prep_time_minutes":int|null,"estimated_prep_time_minutes":int,'
    '"confidence":"low"|"medium"|"high","ingredient_count":int,"drivers":str}]}.'
)


async def estimate(menu_item_id: int | None) -> dict:
    params: dict = {"limit": MAX_ITEMS}
    where = "mi.is_active = true"
    if menu_item_id is not None:
        where += " AND mi.id = %(id)s"
        params["id"] = menu_item_id

    rows = await fetch_all(
        f"""
        SELECT mi.id, mi.name, mi.prep_time_minutes AS existing_prep,
               r.yield_servings,
               COALESCE(char_length(r.instructions), 0) AS instructions_length,
               (SELECT COUNT(*) FROM recipe_ingredients ri WHERE ri.recipe_id = r.id) AS ingredient_count,
               (SELECT COALESCE(SUM(ri.quantity), 0) FROM recipe_ingredients ri WHERE ri.recipe_id = r.id) AS total_qty
        FROM menu_items mi
        LEFT JOIN recipes r ON r.menu_item_id = mi.id
        WHERE {where}
        ORDER BY mi.name
        LIMIT %(limit)s
        """,
        params,
    )

    items = [
        {
            "menu_item_id": r["id"],
            "name": r["name"],
            "existing_prep_time_minutes": r["existing_prep"],
            "yield_servings": r["yield_servings"],
            "ingredient_count": to_num(r["ingredient_count"]) or 0,
            "total_ingredient_qty": to_num(r["total_qty"]) or 0,
            "instructions_length": to_num(r["instructions_length"]) or 0,
        }
        for r in rows
    ]

    summary = {"menu_items": items}
    result = await ask_grok(SYSTEM, summary)
    result.setdefault("estimates", [])
    result["context"] = {"items_considered": len(items)}
    return result
