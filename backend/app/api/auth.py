"""Supabase JWT verification for FastAPI.

The frontend sends the logged-in user's Supabase access token as
`Authorization: Bearer <token>`. We verify its signature and expiry.

Supabase projects use one of two signing schemes:
  * Legacy  -> HS256, signed with the project's JWT secret  (SUPABASE_JWT_SECRET)
  * Current -> RS256/ES256 asymmetric keys, verified via the project's JWKS
This module supports BOTH: it reads the token's `alg` header and verifies
accordingly (JWKS keys are fetched from SUPABASE_URL and cached by PyJWT).

Safe rollout / enforcement:
  * Enforcement is ON when SUPABASE_URL is set (JWKS) and/or SUPABASE_JWT_SECRET
    is set (HS256). If NEITHER is set, verification is disabled and requests pass
    through, so nothing breaks before you configure it.
"""
import os
from typing import Optional
from fastapi import HTTPException, Request

try:
    import jwt  # PyJWT (with [crypto] extra for RS256/ES256)
    from jwt import PyJWKClient
except Exception:  # pragma: no cover
    jwt = None
    PyJWKClient = None

_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
_URL = (os.getenv("SUPABASE_URL", "") or os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")).rstrip("/")
_JWKS_URL = (_URL + "/auth/v1/.well-known/jwks.json") if _URL else ""
_ENFORCED = bool(_SECRET or _URL) and jwt is not None

_jwks_client = None


def auth_enforced() -> bool:
    return _ENFORCED


def _get_jwks_client():
    global _jwks_client
    if _jwks_client is None and _JWKS_URL and PyJWKClient is not None:
        try:
            _jwks_client = PyJWKClient(_JWKS_URL)
        except Exception:
            _jwks_client = None
    return _jwks_client


def _decode(token: str) -> dict:
    # We verify the signature and expiry. Audience check is disabled to avoid
    # false negatives across Supabase token variants (signature + exp is what matters).
    opts = {"verify_aud": False}
    header = {}
    try:
        header = jwt.get_unverified_header(token)
    except Exception:
        pass
    alg = (header or {}).get("alg", "")

    # Asymmetric (current Supabase) -> verify with the project's JWKS public key.
    if alg in ("RS256", "ES256"):
        client = _get_jwks_client()
        if client is None:
            raise HTTPException(status_code=500, detail="SUPABASE_URL not configured for JWKS verification")
        key = client.get_signing_key_from_jwt(token).key
        return jwt.decode(token, key, algorithms=["RS256", "ES256"], leeway=10, options=opts)

    # Legacy -> HS256 with the shared secret.
    if _SECRET:
        return jwt.decode(token, _SECRET, algorithms=["HS256"], leeway=10, options=opts)

    # alg was HS256 but no secret set, or unknown alg with JWKS available.
    client = _get_jwks_client()
    if client is not None:
        key = client.get_signing_key_from_jwt(token).key
        return jwt.decode(token, key, algorithms=["RS256", "ES256"], leeway=10, options=opts)
    raise HTTPException(status_code=500, detail="No JWT verification method configured")


def _bearer(request: Request) -> Optional[str]:
    h = request.headers.get("authorization") or request.headers.get("Authorization") or ""
    if h.lower().startswith("bearer "):
        return h[7:].strip()
    return None


async def get_current_user(request: Request) -> Optional[dict]:
    """Returns {'id','email'} for the caller, or raises 401. No-op when auth
    isn't configured, so the app keeps working until you enable it."""
    if not _ENFORCED:
        return None
    token = _bearer(request)
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token")
    try:
        payload = _decode(token)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    uid = payload.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    return {"id": uid, "email": payload.get("email")}
