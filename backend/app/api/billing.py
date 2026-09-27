"""Pinnovix billing / credit enforcement.

Source of truth is the `billing` table in Supabase. Only this backend (using the
service-role key) may change credits / welcome_used, so the meter can't be gamed
from the browser.

Config (Render env):
  * SUPABASE_URL                (already set for JWKS)
  * SUPABASE_SERVICE_ROLE_KEY   (new — Supabase → Project settings → API → service_role)

If the service key is NOT set, enforcement is a no-op (fail-open) so the app keeps
working until you configure it. To turn the paywall ON, set the key + run 002_billing.sql.
"""
import os
import requests
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.api.auth import get_current_user

router = APIRouter()

# Accounts that bypass ALL limits (owner + testers).
EXEMPT = {
    "siddiquiyaser999999@gmail.com",
    "shahebaaz8822@gmail.com",
    "danish6nov@gmail.com",
    "zee12351@gmail.com",
}

WELCOME_RUNS = 3  # lifetime free light-service runs for a free user

# Light, habit-forming actions (free & unlimited on a paid plan; metered by the
# 3 welcome runs for free users).
LIGHT = {"search", "assistant", "chat", "draft", "summary", "column", "figure_edit"}

# Heavy engines → credit cost. Client sends the action id; the cost is decided HERE.
HEAVY = {
    "deep": 1,
    "lit_intelligence": 1,
    "report": 1,
    "extract": 1,
    "ai_figure": 1,
    "ocr": 1,
    "sysrev_ta": 2,
    "sysrev_ft": 1,
    "sysrev_extract": 1,
    "sysrev_report": 1,
}

_URL = (os.getenv("SUPABASE_URL", "") or os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")).rstrip("/")
_SVC = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
_ENABLED = bool(_URL and _SVC)


def _h(extra=None):
    h = {"apikey": _SVC, "Authorization": "Bearer " + _SVC, "Content-Type": "application/json"}
    if extra:
        h.update(extra)
    return h


def _get_row(uid):
    try:
        r = requests.get(_URL + "/rest/v1/billing?user_id=eq." + uid + "&select=*", headers=_h(), timeout=10)
        if r.ok:
            j = r.json()
            return j[0] if j else None
    except Exception as e:
        print(f"billing get error: {e}")
    return None


def _create_row(uid, email):
    try:
        r = requests.post(_URL + "/rest/v1/billing", headers=_h({"Prefer": "return=representation"}),
                          json={"user_id": uid, "email": email, "plan": "free", "welcome_used": 0, "credits": 0}, timeout=10)
        if r.ok and r.json():
            return r.json()[0]
    except Exception as e:
        print(f"billing create error: {e}")
    return _get_row(uid)


def _update(uid, patch):
    try:
        requests.patch(_URL + "/rest/v1/billing?user_id=eq." + uid, headers=_h(), json=patch, timeout=10)
    except Exception as e:
        print(f"billing update error: {e}")


def _row(user):
    return _get_row(user["id"]) or _create_row(user["id"], (user.get("email") or "").lower())


@router.get("/billing/status")
async def billing_status(user=Depends(get_current_user)):
    if user is None:
        return {"enabled": False, "exempt": False, "plan": "free", "welcomeLeft": WELCOME_RUNS, "credits": 0}
    email = (user.get("email") or "").lower()
    if email in EXEMPT:
        return {"enabled": True, "exempt": True, "plan": "unlimited", "welcomeLeft": None, "credits": None}
    if not _ENABLED:
        return {"enabled": False, "exempt": False, "plan": "free", "welcomeLeft": WELCOME_RUNS, "credits": 0}
    row = _row(user) or {}
    plan = row.get("plan", "free") or "free"
    return {
        "enabled": True, "exempt": False, "plan": plan,
        "welcomeLeft": max(0, WELCOME_RUNS - int(row.get("welcome_used", 0) or 0)),
        "credits": int(row.get("credits", 0) or 0),
    }


class ConsumeReq(BaseModel):
    action: str


@router.post("/billing/consume")
async def billing_consume(req: ConsumeReq, user=Depends(get_current_user)):
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    email = (user.get("email") or "").lower()
    if email in EXEMPT:
        return {"ok": True, "unlimited": True}
    if not _ENABLED:
        return {"ok": True, "unmetered": True}  # not configured yet → don't block

    uid = user["id"]
    row = _row(user) or {}
    plan = row.get("plan", "free") or "free"
    action = req.action

    # Light services
    if action in LIGHT:
        if plan != "free":
            return {"ok": True, "credits": int(row.get("credits", 0) or 0)}
        used = int(row.get("welcome_used", 0) or 0)
        if used >= WELCOME_RUNS:
            return {"ok": False, "reason": "trial_over", "welcomeLeft": 0}
        _update(uid, {"welcome_used": used + 1})
        return {"ok": True, "welcomeLeft": WELCOME_RUNS - (used + 1)}

    # Heavy engines
    cost = HEAVY.get(action, 1)
    if plan == "free":
        return {"ok": False, "reason": "need_plan"}
    credits = int(row.get("credits", 0) or 0)
    if credits < cost:
        return {"ok": False, "reason": "no_credits", "credits": credits}
    _update(uid, {"credits": credits - cost})
    return {"ok": True, "credits": credits - cost}
