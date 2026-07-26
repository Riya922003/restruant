from fastapi import APIRouter, Depends

from app.core.envelope import ok
from app.core.security import require_role
from app.schemas.inventory_ai import ReorderRequest, ShortageRequest, WasteRequest
from app.services import reorder_suggestion, shortage_prediction, waste_analysis

router = APIRouter()


@router.post("/shortage-prediction")
async def shortage(
    body: ShortageRequest | None = None,
    _user=Depends(require_role("manager", "store_manager", "chef")),
):
    body = body or ShortageRequest()
    return ok(await shortage_prediction.predict(body.horizon_days))


@router.post("/reorder-suggestion")
async def reorder(
    body: ReorderRequest | None = None,
    _user=Depends(require_role("manager", "store_manager")),
):
    body = body or ReorderRequest()
    return ok(await reorder_suggestion.suggest(body.cover_days, body.scope))


@router.post("/waste-analysis")
async def waste(
    body: WasteRequest | None = None,
    _user=Depends(require_role("manager", "store_manager", "chef")),
):
    body = body or WasteRequest()
    return ok(await waste_analysis.analyze(body.window_days))
