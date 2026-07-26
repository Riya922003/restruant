from fastapi import APIRouter, Depends

from app.core.envelope import ok
from app.core.security import require_role
from app.schemas.pricing_ai import PrepTimeRequest, PricingRequest
from app.services import insight_cache, prep_time, pricing

router = APIRouter()


@router.post("/pricing-suggestion")
async def pricing_suggestion(
    body: PricingRequest | None = None,
    user=Depends(require_role("manager")),
):
    body = body or PricingRequest()
    result = await pricing.suggest(body.menu_item_id, body.target_margin_pct)
    await insight_cache.save("pricing", result, user.id)
    return ok(result)


@router.post("/prep-time-estimate")
async def prep_time_estimate(
    body: PrepTimeRequest | None = None,
    user=Depends(require_role("manager", "chef")),
):
    body = body or PrepTimeRequest()
    result = await prep_time.estimate(body.menu_item_id)
    await insight_cache.save("prep_time", result, user.id)
    return ok(result)
