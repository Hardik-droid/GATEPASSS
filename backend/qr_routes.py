from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.models import User
from backend.qr_service import (
    ensure_user_qr,
    get_user_qr_payload,
    render_user_qr_png,
    revoke_and_reissue_user_qr,
)
from backend.security import get_current_user

router = APIRouter(prefix="/api/qr", tags=["qr"])


class QrMeResponse(BaseModel):
    qr_payload: str
    status: str


@router.get("/me", response_model=QrMeResponse)
def get_my_qr(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> QrMeResponse:
    credential = ensure_user_qr(db, user)
    return QrMeResponse(qr_payload=get_user_qr_payload(db, user), status=credential.status)


@router.get("/me.png")
def get_my_qr_png(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> Response:
    payload = get_user_qr_payload(db, user)
    return Response(
        content=render_user_qr_png(payload),
        media_type="image/png",
        headers={"Cache-Control": "no-store"},
    )


@router.post("/reissue", response_model=QrMeResponse)
def reissue_my_qr(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> QrMeResponse:
    credential = revoke_and_reissue_user_qr(db, user)
    return QrMeResponse(qr_payload=get_user_qr_payload(db, user), status=credential.status)
