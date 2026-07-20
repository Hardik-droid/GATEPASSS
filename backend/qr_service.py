import io
from datetime import datetime, timezone

import qrcode
from qrcode.constants import ERROR_CORRECT_H
from sqlalchemy.orm import Session

from backend.models import QrCredential, User
from backend.security import (
    build_qr_payload,
    generate_public_id,
    parse_qr_payload,
    verify_qr_signature,
)


class InvalidQrFormat(Exception):
    pass


class InvalidQrSignature(Exception):
    pass


class QrRevoked(Exception):
    pass


def ensure_user_qr(db: Session, user: User) -> QrCredential:
    credential = (
        db.query(QrCredential).filter_by(user_id=user.id, status="active").one_or_none()
    )
    if credential is not None:
        return credential
    credential = QrCredential(user_id=user.id, public_id=generate_public_id())
    db.add(credential)
    db.commit()
    db.refresh(credential)
    return credential


def get_user_qr_payload(db: Session, user: User) -> str:
    credential = ensure_user_qr(db, user)
    return build_qr_payload(credential.public_id)


def render_user_qr_png(payload: str) -> bytes:
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H, box_size=10, border=2)
    qr.add_data(payload)
    qr.make(fit=True)
    image = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def revoke_and_reissue_user_qr(db: Session, user: User) -> QrCredential:
    old = (
        db.query(QrCredential).filter_by(user_id=user.id, status="active").one_or_none()
    )
    if old is not None:
        old.status = "revoked"
        old.revoked_at = datetime.now(timezone.utc)
        db.flush()  # old must leave the partial-unique-index predicate before the new insert
    new_credential = QrCredential(user_id=user.id, public_id=generate_public_id())
    db.add(new_credential)
    db.commit()
    db.refresh(new_credential)
    return new_credential


def verify_qr_payload(db: Session, payload: str) -> QrCredential:
    parsed = parse_qr_payload(payload)
    if parsed is None:
        raise InvalidQrFormat()
    public_id, signature = parsed
    if not verify_qr_signature(public_id, signature):
        raise InvalidQrSignature()
    credential = db.query(QrCredential).filter_by(public_id=public_id).one_or_none()
    if credential is None or credential.status != "active":
        raise QrRevoked()
    return credential
