from fastapi import APIRouter, BackgroundTasks, Depends, File, Query, UploadFile
from fastapi.responses import Response

from app.core.envelope import created, ok
from app.core.security import require_role
from app.schemas.invoice import ApproveRequest, PatchImport
from app.services import invoice_service
from app.services.audit import write_audit
from app.services.expense_register import build_workbook

router = APIRouter()

# Invoice processing is limited to owner/manager/store_manager (owner via bypass).
_manager = require_role("manager", "store_manager")

_XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@router.post("/upload")
async def upload(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    user=Depends(_manager),
):
    result = await invoice_service.upload(user, files, background_tasks)
    return created(result)


@router.get("/imports")
async def list_imports(
    status: str | None = Query(default=None),
    batch_id: int | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    _user=Depends(_manager),
):
    rows, meta = await invoice_service.list_imports(status, batch_id, page, limit)
    return ok(rows, meta)


@router.get("/expense-register.xlsx")
async def export_register(
    date_from: str | None = Query(default=None, alias="from"),
    date_to: str | None = Query(default=None, alias="to"),
    supplier_id: int | None = Query(default=None),
    user=Depends(_manager),
):
    rows = await invoice_service.expense_register_rows(date_from, date_to, supplier_id)
    import asyncio

    content = await asyncio.to_thread(build_workbook, rows)
    await write_audit(
        user.id, "expense_register.exported", "expense_register", None,
        {"from": date_from, "to": date_to, "supplier_id": supplier_id, "rows": len(rows)},
    )
    filename = f"expense-register-{date_from or 'all'}-{date_to or 'all'}.xlsx"
    return Response(
        content=content,
        media_type=_XLSX_MIME,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/imports/{import_id}")
async def get_import(import_id: int, _user=Depends(_manager)):
    return ok(await invoice_service.get_import(import_id))


@router.get("/imports/{import_id}/file")
async def get_import_file(import_id: int, _user=Depends(_manager)):
    data, mime, filename = await invoice_service.get_file(import_id)
    return Response(
        content=data,
        media_type=mime,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.patch("/imports/{import_id}")
async def patch_import(import_id: int, body: PatchImport, user=Depends(_manager)):
    return ok(await invoice_service.patch_import(import_id, body, user))


@router.post("/imports/{import_id}/approve")
async def approve_import(
    import_id: int, body: ApproveRequest | None = None, user=Depends(_manager)
):
    body = body or ApproveRequest()
    return ok(await invoice_service.approve(import_id, body, user))


@router.post("/imports/{import_id}/reject")
async def reject_import(import_id: int, user=Depends(_manager)):
    return ok(await invoice_service.reject(import_id, user))


@router.delete("/imports/{import_id}")
async def delete_import(import_id: int, user=Depends(_manager)):
    return ok(await invoice_service.delete_import(import_id, user))
