from fastapi import APIRouter, Depends

from app.core.envelope import ok
from app.core.security import require_role
from app.schemas.pricing_ai import PrepTimeRequest, PricingRequest
from app.services import prep_time, pricing

router = APIRouter()


@router.post("/pricing-suggestion")
async def pricing_suggestion(
    body: PricingRequest | None = None,
    _user=Depends(require_role("manager")),
):
    body = body or PricingRequest()
    return ok(await pricing.suggest(body.menu_item_id, body.target_margin_pct))


@router.post("/prep-time-estimate")
async def prep_time_estimate(
    body: PrepTimeRequest | None = None,
    _user=Depends(require_role("manager", "chef")),
):
    body = body or PrepTimeRequest()
    return ok(await prep_time.estimate(body.menu_item_id))
