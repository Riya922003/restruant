from types import SimpleNamespace

import pytest


class FakeUploadFile:
    def __init__(self, filename, content_type, content):
        self.filename = filename
        self.content_type = content_type
        self._content = content

    async def read(self):
        return self._content


class FakeBackgroundTasks:
    def __init__(self):
        self.tasks = []

    def add_task(self, fn, *args):
        self.tasks.append((fn, args))


@pytest.mark.asyncio
async def test_upload_uses_inline_background_task_when_queue_unavailable(monkeypatch):
    from app.services import audit, invoice_service

    async def fake_fetch_one(sql, params=None):
        if "invoice_import_batches" in sql:
            return {"id": 10}
        if "invoice_imports" in sql and "INSERT" in sql:
            return {"id": 99}
        return {"id": params[-1] if params else 99}

    async def fake_write_audit(*_args, **_kwargs):
        return None

    monkeypatch.setattr(invoice_service, "fetch_one", fake_fetch_one)
    monkeypatch.setattr(audit, "write_audit", fake_write_audit)
    monkeypatch.setattr(invoice_service, "write_audit", fake_write_audit)

    from app.clients import storage
    from app.workers import queue

    monkeypatch.setattr(storage, "store_file", lambda *_args: {"file_url": "file://invoice.jpg", "public_id": "p1"})
    monkeypatch.setattr(queue, "get_queue", lambda: None)

    background = FakeBackgroundTasks()
    result = await invoice_service.upload(
        SimpleNamespace(id=7),
        [FakeUploadFile("invoice.jpg", "image/jpeg", b"fake-image")],
        background,
    )

    assert result["batch_id"] == 10
    assert result["imports"] == [{"id": 99, "original_filename": "invoice.jpg", "status": "queued"}]
    assert len(background.tasks) == 1
    assert background.tasks[0][1] == (99,)


@pytest.mark.asyncio
async def test_upload_rejects_unsupported_file_type():
    from app.core.errors import ApiError
    from app.services import invoice_service

    with pytest.raises(ApiError) as exc:
        await invoice_service.upload(
            SimpleNamespace(id=7),
            [FakeUploadFile("invoice.txt", "text/plain", b"not-an-image")],
            FakeBackgroundTasks(),
        )

    assert exc.value.status_code == 422
    assert exc.value.errors[0]["field"] == "invoice.txt"
