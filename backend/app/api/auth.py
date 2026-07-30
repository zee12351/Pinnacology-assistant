"""Supabase JWT verification for FastAPI.

The frontend sends the logged-in user's Supabase access token as
`Authorization: Bearer <token>`. We verify it with the project's JWT secret
(Supabase → Settings → API → JWT Secret) set as the SUPABASE_JWT_SECRET env var.

Safe rollout: if SUPABASE_JWT_SECRET is NOT set, verification is disabled and
requests pass through (so nothing breaks before you configure it). Once the env
var is set, unauthenticated / invalid-token requests get 401.
"""
import os
from typing import Optional
from fastapi import Depends, HTTPException, Request

try:
    import jwt  # PyJWT
except Exception:  # pragma: no cover - dependency may not be installed yet
    jwt = None

_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")
_ENFORCED = bool(_JWT_SECRET) and jwt is not None


def auth_enforced() -> bool:
    return _ENFORCED


def _decode(token: str) -> dict:
    # Supabase signs access tokens with HS256; audience is "authenticated".
    return jwt.decode(
        token,
        _JWT_SECRET,
        algorithms=["HS256"],
        audience="authenticated",
        options={"verify_aud": True},
    )


def _bearer(request: Request) -> Optional[str]:
    h = request.headers.get("authorization") or request.headers.get("Authorization") or ""
    if h.lower().startswith("bearer "):
        return h[7:].strip()
    return None


async def get_current_user(request: Request) -> Optional[dict]:
    """Dependency: returns {'id', 'email'} for the caller, or raises 401.

    When enforcement is off (no secret configured) this returns None and never
    blocks — so the app keeps working until you enable it."""
    if not _ENFORCED:
        return None
    token = _bearer(request)
    if not token:
        raise HTTPException(status_code=401, detail="Missing bearer token")
    try:
        payload = _decode(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    uid = payload.get("sub")
    if not uid:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    return {"id": uid, "email": payload.get("email")}
