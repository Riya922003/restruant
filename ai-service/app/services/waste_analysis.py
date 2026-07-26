from app.core.database import fetch_all
from app.core.serialize import to_num
from app.services._recommend import ask_grok

MAX_ITEMS = 50

SYSTEM = (
    "You are a waste-reduction analyst for a restaurant. You receive JSON with the "
    "biggest wasted products over a window, each with wasted_qty, wasted_value, "
    "waste_pct_of_usage, unit, and observed reasons. Identify the largest waste "
    "contributors by value, infer likely causes, and give actionable, specific "
    "recommendations (par levels, FIFO, portion control, pack sizes). Reason ONLY "
    "from the supplied data. Return STRICT JSON: "
    '{"total_waste_value":number,"top_waste":[{"item_type":"product","item_id":int,'
    '"name":str,"unit":str,"wasted_qty":number,"wasted_value":number,'
    '"waste_pct_of_usage":number|null,"likely_cause":str,"recommendation":str}]}.'
)


async def analyze(window_days: int) -> dict:
    waste_rows = await fetch_all(
        """
        SELECT p.id, p.name, p.unit,
               SUM(sm.quantity)                                        AS wasted_qty,
               SUM(sm.quantity * COALESCE(sm.unit_cost, p.cost_price)) AS wasted_value,
               COUNT(*)                                                AS events,
               array_agg(DISTINCT sm.reason) FILTER (WHERE sm.reason IS NOT NULL) AS reasons
        FROM stock_movements sm
        JOIN products p ON p.id = sm.product_id
        WHERE sm.movement_type = 'wastage'
          AND sm.created_at >= now() - make_interval(days => %(w)s)
        GROUP BY p.id, p.name, p.unit
        ORDER BY wasted_value DESC
        LIMIT %(limit)s
        """,
        {"w": window_days, "limit": MAX_ITEMS},
    )
    out_rows = await fetch_all(
        """
        SELECT product_id AS id, SUM(quantity) AS out_qty
        FROM stock_movements
        WHERE movement_type = 'stock_out'
          AND created_at >= now() - make_interval(days => %(w)s)
        GROUP BY product_id
        """,
        {"w": window_days},
    )
    out = {r["id"]: (to_num(r["out_qty"]) or 0) for r in out_rows}

    items = []
    total_value = 0.0
    for r in waste_rows:
        wasted_qty = to_num(r["wasted_qty"]) or 0
        wasted_value = round(to_num(r["wasted_value"]) or 0, 2)
        total_value += wasted_value
        throughput = wasted_qty + out.get(r["id"], 0)
        waste_pct = round(100.0 * wasted_qty / throughput, 1) if throughput else None
        items.append(
            {
                "item_type": "product",
                "item_id": r["id"],
                "name": r["name"],
                "unit": r["unit"],
                "wasted_qty": wasted_qty,
                "wasted_value": wasted_value,
                "waste_pct_of_usage": waste_pct,
                "reasons": r["reasons"] or [],
            }
        )

    summary = {"window_days": window_days, "total_waste_value": round(total_value, 2), "items": items}
    result = await ask_grok(SYSTEM, summary)
    result.setdefault("top_waste", [])
    result.setdefault("total_waste_value", round(total_value, 2))
    result["context"] = {"window_days": window_days, "movements_considered": len(items)}
    return result
