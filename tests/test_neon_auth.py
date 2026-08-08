import time
import types
import uuid
from unittest.mock import MagicMock

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
import jwt as pyjwt

from backend import security

ISS = "https://neon.example/neondb/auth"
KID = "test-kid-1"


@pytest.fixture(autouse=True)
def _config(monkeypatch):
    # settings is a frozen dataclass; swap in a mutable stand-in so individual
    # tests can vary neon_auth_audience.
    monkeypatch.setattr(
        security, "settings", types.SimpleNamespace(neon_auth_url=ISS, neon_auth_audience="")
    )


@pytest.fixture
def keypair():
    priv = Ed25519PrivateKey.generate()
    return priv, priv.public_key()


def _mint(priv, *, kid=KID, iss=ISS, sub="user-123", exp_delta=3600, aud=None, alg="EdDSA", extra=None):
    headers = {"kid": kid}
    payload = {"iss": iss, "sub": sub, "exp": int(time.time()) + exp_delta}
    if aud is not None:
        payload["aud"] = aud
    if extra:
        payload.update(extra)
    return pyjwt.encode(payload, priv, algorithm=alg, headers=headers)


@pytest.fixture
def patch_jwks(monkeypatch, keypair):
    priv, pub = keypair

    class _Key:  # mimics PyJWK
        key = pub

    def _get(token):
        return _Key()

    monkeypatch.setattr(security, "_get_signing_key", _get)
    return priv


def test_valid_token_maps_claims(patch_jwks):
    token = _mint(patch_jwks, extra={"email": "a@b.com", "name": "A B", "picture": "http://p"})
    ident = security.verify_neon_auth_token(token)
    assert ident.subject == "user-123"
    assert ident.issuer == ISS
    assert ident.email == "a@b.com"


def test_missing_token_rejected(patch_jwks):
    with pytest.raises(security.InvalidNeonToken):
        security.verify_neon_auth_token("")


def test_expired_token_rejected(patch_jwks):
    with pytest.raises(security.InvalidNeonToken):
        security.verify_neon_auth_token(_mint(patch_jwks, exp_delta=-10))


def test_bad_signature_rejected(patch_jwks, keypair):
    other = Ed25519PrivateKey.generate()
    with pytest.raises(security.InvalidNeonToken):
        security.verify_neon_auth_token(_mint(other))  # signed by wrong key


def test_wrong_issuer_rejected(patch_jwks):
    with pytest.raises(security.InvalidNeonToken):
        security.verify_neon_auth_token(_mint(patch_jwks, iss="https://evil/auth"))


def test_wrong_audience_rejected(patch_jwks, monkeypatch):
    monkeypatch.setattr(security.settings, "neon_auth_audience", "expected-aud", raising=False)
    with pytest.raises(security.InvalidNeonToken):
        security.verify_neon_auth_token(_mint(patch_jwks, aud="other-aud"))


def test_correct_audience_accepted(patch_jwks, monkeypatch):
    monkeypatch.setattr(security.settings, "neon_auth_audience", "expected-aud", raising=False)
    ident = security.verify_neon_auth_token(_mint(patch_jwks, aud="expected-aud"))
    assert ident.subject == "user-123"


def test_unsupported_algorithm_rejected(patch_jwks):
    # HS256 token must be rejected — alg allow-list is EdDSA only
    hs = pyjwt.encode(
        {"iss": ISS, "sub": "x", "exp": int(time.time()) + 60},
        "secret",
        algorithm="HS256",
        headers={"kid": KID},
    )
    with pytest.raises(security.InvalidNeonToken):
        security.verify_neon_auth_token(hs)


def test_missing_subject_rejected(patch_jwks, keypair):
    priv, _ = keypair
    tok = pyjwt.encode(
        {"iss": ISS, "exp": int(time.time()) + 60}, priv, algorithm="EdDSA", headers={"kid": KID}
    )
    with pytest.raises(security.InvalidNeonToken):
        security.verify_neon_auth_token(tok)


def test_gp_session_string_rejected(patch_jwks):
    with pytest.raises(security.InvalidNeonToken):
        security.verify_neon_auth_token("gp_session_abc123")


def test_unknown_kid_triggers_single_refresh(monkeypatch, keypair):
    priv, pub = keypair
    calls = {"n": 0}

    class _Key:
        key = pub

    def _get(token):
        calls["n"] += 1
        if calls["n"] == 1:
            raise pyjwt.exceptions.PyJWKClientError("kid not found")
        return _Key()

    reset = {"n": 0}
    monkeypatch.setattr(security, "_get_signing_key", _get)
    monkeypatch.setattr(security, "_reset_jwks_client", lambda: reset.__setitem__("n", reset["n"] + 1))
    ident = security.verify_neon_auth_token(_mint(priv))
    assert ident.subject == "user-123"
    assert calls["n"] == 2 and reset["n"] == 1  # refreshed once, retried once


def test_late_ticket_reconciliation_uses_verified_canonical_email():
    db = MagicMock()
    user = types.SimpleNamespace(
        id=uuid.uuid4(),
        email="  Attendee.Person@Example.COM  ",
    )

    security._reconcile_ticket_assignments(db, user)

    statement, params = db.execute.call_args.args
    sql = str(statement)
    assert "INSERT INTO scanner.ticket_assignments" in sql
    assert "JOIN scanner.ticket_entitlements" in sql
    assert "NOT EXISTS" in sql
    assert params == {
        "user_id": str(user.id),
        "email": "attendee.person@example.com",
    }


def test_every_verified_login_reconciles_late_ticket_assignments(monkeypatch):
    identity = security.NeonAuthIdentity(
        issuer=ISS,
        subject="user-123",
        email="Attendee@Example.COM",
        name="Attendee",
        picture=None,
    )
    user = types.SimpleNamespace(
        id=uuid.uuid4(),
        email="attendee@example.com",
        display_name="Attendee",
        photo_url=None,
        status="active",
    )
    db = MagicMock()
    db.query.return_value.filter_by.return_value.one_or_none.return_value = user
    reconciled = []
    monkeypatch.setattr(security, "verify_neon_auth_token", lambda _token: identity)
    monkeypatch.setattr(
        security,
        "_reconcile_ticket_assignments",
        lambda session, current_user: reconciled.append((session, current_user)),
    )

    result = security.get_current_user("Bearer valid-token", db)

    assert result is user
    assert reconciled == [(db, user)]
    db.commit.assert_called_once_with()
