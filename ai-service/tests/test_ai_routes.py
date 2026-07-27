import pytest


@pytest.mark.asyncio
async def test_shortage_prediction_uses_service_and_saves_cache(client, auth, monkeypatch):
    from app.services import insight_cache, shortage_prediction

    saved = {}

    async def fake_predict(horizon_days):
        return {"at_risk": [], "context": {"horizon_days": horizon_days}}

    async def fake_save(feature, result, user_id):
        saved.update({"feature": feature, "result": result, "user_id": user_id})

    monkeypatch.setattr(shortage_prediction, "predict", fake_predict)
    monkeypatch.setattr(insight_cache, "save", fake_save)

    res = await client.post(
        "/ai/inventory/shortage-prediction",
        headers=auth("chef", user_id=33),
        json={"horizon_days": 14},
    )

    assert res.status_code == 200
    body = res.json()
    assert body["data"]["context"]["horizon_days"] == 14
    assert saved == {"feature": "shortage_prediction", "result": body["data"], "user_id": 33}


@pytest.mark.asyncio
async def test_reorder_suggestion_blocks_chef_role(client, auth):
    res = await client.post(
        "/ai/inventory/reorder-suggestion",
        headers=auth("chef"),
        json={"cover_days": 14, "scope": "both"},
    )

    assert res.status_code == 403


@pytest.mark.asyncio
async def test_pricing_validation_matches_schema(client, auth):
    res = await client.post(
        "/ai/menu/pricing-suggestion",
        headers=auth("manager"),
        json={"target_margin_pct": 110},
    )

    assert res.status_code == 422
    assert res.json()["message"] == "Validation failed"


@pytest.mark.asyncio
async def test_dashboard_insights_are_role_scoped(client, auth, monkeypatch):
    from app.services import insight_cache

    seen = {}

    async def fake_get_many(features):
        seen["features"] = features
        return [{"feature": feature} for feature in features]

    monkeypatch.setattr(insight_cache, "get_many", fake_get_many)

    res = await client.get("/ai/insights/dashboard", headers=auth("chef"))

    assert res.status_code == 200
    assert seen["features"] == ["shortage_prediction"]
    assert res.json()["data"] == [{"feature": "shortage_prediction"}]
