import base64
import hashlib
import hmac
import secrets
import urllib.parse
from dataclasses import dataclass
from datetime import datetime, timezone

import jwt
from fastapi import Depends, Header, HTTPException
from jwt import PyJWKClient
from sqlalchemy.orm import Session

from backend.config import settings
from backend.db import get_db
from backend.models import Scanner, ScannerSession, User

QR_PREFIX = "gp:v1:"
ALLOWED_ALGORITHMS = ["EdDSA"]  # Neon Auth JWKS publishes Ed25519/EdDSA keys

_jwks_client: PyJWKClient | None = None


def _reset_jwks_client() -> None:
    global _jwks_client
    _jwks_client = None


def _get_signing_key(token: str):
    global _jwks_client
    if _jwks_client is None:
        jwks_url = f"{settings.neon_auth_url.rstrip('/')}/.well-known/jwks.json"
        _jwks_client = PyJWKClient(jwks_url)
    return _jwks_client.get_signing_key_from_jwt(token)


class InvalidNeonToken(Exception):
    pass


@dataclass(frozen=True)
class NeonAuthIdentity:
    issuer: str
    subject: str
    email: str
    name: str
    picture: str | None


def verify_neon_auth_token(token: str) -> NeonAuthIdentity:
    if not token or not settings.neon_auth_url:
        raise InvalidNeonToken("Neon Auth is not configured or token is missing")
    try:
        try:
            signing_key = _get_signing_key(token)
        except Exception:
            _reset_jwks_client()  # unknown kid / rotated key → refresh JWKS once
            signing_key = _get_signing_key(token)

        base_iss = settings.neon_auth_url.rstrip("/")
        parsed = urllib.parse.urlparse(base_iss)
        origin_iss = f"{parsed.scheme}://{parsed.netloc}"
        allowed_issuers = list(dict.fromkeys([base_iss, origin_iss]))

        decode_kwargs = dict(
            algorithms=ALLOWED_ALGORITHMS,
            issuer=allowed_issuers,
            options={
                "require": ["exp", "iss", "sub"],
                "verify_aud": bool(settings.neon_auth_audience),
            },
        )
        if settings.neon_auth_audience:
            decode_kwargs["audience"] = settings.neon_auth_audience
        claims = jwt.decode(token, signing_key.key, **decode_kwargs)
    except InvalidNeonToken:
        raise
    except Exception as exc:  # PyJWT errors, key errors, network — fail closed
        raise InvalidNeonToken(str(exc)) from exc

    subject = claims.get("sub")
    if not subject:
        raise InvalidNeonToken("missing subject")
    email = claims.get("email") or f"{subject}@neon.auth"
    return NeonAuthIdentity(
        issuer=claims["iss"].rstrip("/"),
        subject=subject,
        email=email,
        name=claims.get("name") or claims.get("display_name") or email,
        picture=claims.get("picture") or claims.get("image"),
    )


def get_current_user(
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
) -> User:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        identity = verify_neon_auth_token(token)
    except InvalidNeonToken as exc:
        raise HTTPException(401, f"Invalid Neon Auth token: {exc}") from exc

    user = (
        db.query(User)
        .filter_by(google_issuer=identity.issuer, google_subject=identity.subject)
        .one_or_none()
    )
    if user is None:
        user = User(
            google_issuer=identity.issuer,
            google_subject=identity.subject,
            email=identity.email,
            display_name=identity.name,
            photo_url=identity.picture,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        changed = False
        if user.email != identity.email:
            user.email = identity.email
            changed = True
        if identity.picture and user.photo_url != identity.picture:
            user.photo_url = identity.picture
            changed = True
        if changed:
            db.commit()

    if user.status != "active":
        raise HTTPException(403, "Account disabled")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.email.lower() not in settings.admin_emails:
        raise HTTPException(403, "Admin access required")
    return user


def require_scanner_session(
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
) -> Scanner:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, detail={"reason": "SCANNER_SESSION_EXPIRED"})
    token = authorization.removeprefix("Bearer ").strip()
    token_hash = hash_secret(token)
    session = db.query(ScannerSession).filter_by(token_hash=token_hash).one_or_none()
    now = datetime.now(timezone.utc)
    if session is None or session.revoked_at is not None or session.expires_at < now:
        raise HTTPException(401, detail={"reason": "SCANNER_SESSION_EXPIRED"})
    scanner = db.get(Scanner, session.scanner_id)
    if scanner is None or scanner.status != "active":
        raise HTTPException(403, detail={"reason": "SCANNER_INACTIVE"})
    session.last_seen_at = now
    db.commit()
    return scanner


def _sign(public_id: str) -> str:
    canonical = f"{QR_PREFIX}{public_id}".encode()
    digest = hmac.new(settings.qr_signing_key.encode(), canonical, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def generate_public_id() -> str:
    return secrets.token_urlsafe(16)  # 128 bits of entropy


def build_qr_payload(public_id: str) -> str:
    return f"{QR_PREFIX}{public_id}.{_sign(public_id)}"


def parse_qr_payload(payload: str) -> tuple[str, str] | None:
    if not payload.startswith(QR_PREFIX):
        return None
    remainder = payload[len(QR_PREFIX):]
    public_id, sep, signature = remainder.partition(".")
    if not sep or not public_id or not signature:
        return None
    return public_id, signature


def verify_qr_signature(public_id: str, signature: str) -> bool:
    return hmac.compare_digest(_sign(public_id), signature)


def hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def generate_pairing_code() -> tuple[str, str]:
    code = f"{secrets.randbelow(1_000_000):06d}"
    return code, hash_secret(code)


def generate_scanner_session_token() -> tuple[str, str]:
    token = secrets.token_urlsafe(32)
    return token, hash_secret(token)
