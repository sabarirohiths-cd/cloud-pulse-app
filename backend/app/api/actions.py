from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta

from app.core.database import get_db
from app.models.control.control_resource import ControlResource
from app.services.notifier import notifier_service

router = APIRouter(prefix="/control/actions", tags=["Webhook Override Actions"])

@router.get("", response_class=HTMLResponse)
async def process_email_action(token: str = Query(...), db: AsyncSession = Depends(get_db)):
    try:
        data = notifier_service.decode_override_token(token)
    except ValueError as e:
        return f"<html><body style='font-family:sans-serif;padding:40px;background:#121214;color:#ef4444;'><h2>Invalid or Expired Token</h2><p>{str(e)}</p></body></html>"
        
    native_id = data.get("native_id")
    action = data.get("action")  # 'EXTENDED' or 'SKIPPED'
    
    sched = await db.get(ControlResource, native_id)
    if not sched:
        return f"<html><body style='font-family:sans-serif;padding:40px;background:#121214;color:#ef4444;'><h2>Resource Schedule Not Found</h2></body></html>"
        
    if action == "EXTENDED":
        sched.override_state = "EXTENDED"
        sched.override_until = datetime.utcnow() + timedelta(hours=2)
        msg = "Automatic shutdown extended by 2 hours."
    elif action == "SKIPPED":
        sched.override_state = "SKIPPED"
        sched.override_until = datetime.utcnow() + timedelta(hours=24)
        msg = "Automatic shutdown skipped for today."
    else:
        msg = "Unknown action processed."
        
    await db.commit()
    
    return f"""
    <html>
        <body style="font-family: Arial, sans-serif; background-color: #121214; color: #22c55e; padding: 40px; text-align: center;">
            <div style="border: 1px solid #27272a; background: #18181b; padding: 30px; border-radius: 12px; display: inline-block;">
                <h1 style="margin-bottom: 10px;">✅ Action Confirmed</h1>
                <p style="color: #e4e4e7; font-size: 16px;">{msg}</p>
                <p style="color: #71717a; font-size: 12px;">Resource: {native_id}</p>
            </div>
        </body>
    </html>
    """
