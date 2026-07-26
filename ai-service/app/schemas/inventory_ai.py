from typing import Literal

from pydantic import BaseModel, Field


class ShortageRequest(BaseModel):
    horizon_days: int = Field(default=7, ge=1, le=30)


class ReorderRequest(BaseModel):
    cover_days: int = Field(default=14, ge=1, le=60)
    scope: Literal["ingredients", "products", "both"] = "both"


class WasteRequest(BaseModel):
    window_days: int = Field(default=30, ge=7, le=180)
