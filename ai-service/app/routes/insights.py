from fastapi import APIRouter, Depends

from app.core.envelope import ok
from app.core.security import CurrentUser, get_current_user
from app.services import insight_cache

router = APIRouter()

# Which cached features the dashboard surfaces, and who may see each (owner bypass).
DASHBOARD_FEATURES = {
    "shortage_prediction": ["manager", "store_manager", "chef"],
    "pricing": ["manager"],
}


@router.get("/dashboard")
async def dashboard_insights(user: CurrentUser = Depends(get_current_user)):
    """Return the latest cached insights the caller's role may see. Read-only:
    never calls the model, so it is instant and free to poll on the dashboard."""
    allowed = [
        feature
        for feature, roles in DASHBOARD_FEATURES.items()
        if user.role == "owner" or user.role in roles
    ]
    return ok(await insight_cache.get_many(allowed))
