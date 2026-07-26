from pydantic import BaseModel, Field


class PricingRequest(BaseModel):
    menu_item_id: int | None = None
    target_margin_pct: float = Field(default=65, ge=0, le=95)


class PrepTimeRequest(BaseModel):
    menu_item_id: int | None = None
