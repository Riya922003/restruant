import pytest


@pytest.mark.asyncio
async def test_ai_routes_require_auth(client):
    res = await client.get("/ai/me")

    assert res.status_code == 401
    assert res.json()["message"] == "Authentication required"


@pytest.mark.asyncio
async def test_me_returns_express_jwt_user(client, auth):
    res = await client.get("/ai/me", headers=auth("chef", user_id=12))

    assert res.status_code == 200
    assert res.json()["data"] == {
        "id": 12,
        "role": "chef",
        "email": "chef@restaurantos.test",
        "service": "restaurantos-ai",
    }


@pytest.mark.asyncio
async def test_invoice_upload_rejects_unauthorized_role(client, auth):
    res = await client.post(
        "/ai/invoices/upload",
        headers=auth("waiter"),
        files=[("files", ("invoice.jpg", b"fake-image", "image/jpeg"))],
    )

    assert res.status_code == 403
    assert res.json()["message"] == "You do not have access to this resource"


@pytest.mark.asyncio
async def test_owner_bypasses_route_role_checks(client, auth, monkeypatch):
    from app.services import invoice_service

    async def fake_list_imports(status, batch_id, page, limit):
        return [{"id": 1, "status": "queued"}], {
            "page": page,
            "limit": limit,
            "total": 1,
            "totalPages": 1,
        }

    monkeypatch.setattr(invoice_service, "list_imports", fake_list_imports)

    res = await client.get("/ai/invoices/imports?limit=100", headers=auth("owner"))

    assert res.status_code == 200
    assert res.json()["data"][0]["status"] == "queued"
