from fastapi import APIRouter, Depends

from app.core.envelope import ok
from app.core.security import CurrentUser, get_current_user

router = APIRouter()


@router.get("/me")
async def me(user: CurrentUser = Depends(get_current_user)):
    # Proves the shared-JWT wiring: any authenticated Express token resolves here.
    return ok(
        {
            "id": user.id,
            "role": user.role,
            "email": user.email,
            "service": "restaurantos-ai",
        }
    )
