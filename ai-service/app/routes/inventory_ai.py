from fastapi import APIRouter, Depends

from app.core.envelope import ok
from app.core.security import require_role
from app.schemas.inventory_ai import ReorderRequest, ShortageRequest, WasteRequest
from app.services import insight_cache, reorder_suggestion, shortage_prediction, waste_analysis

router = APIRouter()


@router.post("/shortage-prediction")
async def shortage(
    body: ShortageRequest | None = None,
    user=Depends(require_role("manager", "store_manager", "chef")),
):
    body = body or ShortageRequest()
    result = await shortage_prediction.predict(body.horizon_days)
    await insight_cache.save("shortage_prediction", result, user.id)
    return ok(result)


@router.post("/reorder-suggestion")
async def reorder(
    body: ReorderRequest | None = None,
    user=Depends(require_role("manager", "store_manager")),
):
    body = body or ReorderRequest()
    result = await reorder_suggestion.suggest(body.cover_days, body.scope)
    await insight_cache.save("reorder_suggestion", result, user.id)
    return ok(result)


@router.post("/waste-analysis")
async def waste(
    body: WasteRequest | None = None,
    user=Depends(require_role("manager", "store_manager", "chef")),
):
    body = body or WasteRequest()
    result = await waste_analysis.analyze(body.window_days)
    await insight_cache.save("waste_analysis", result, user.id)
    return ok(result)
