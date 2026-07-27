from fastapi import APIRouter, Depends, HTTPException, Query
import json
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timedelta

from app.core.database import get_db
from app.models import ControlResource, ConfigCloudAccount, ControlActionLog
from app.core.security import decrypt_credentials
from app.services.control_service import control_service

router = APIRouter(prefix="/control", tags=["Resource Control"])

class ScheduleUpdatePayload(BaseModel):
    resource_id: str
    service_type: str
    account_name: str
    region: str = "us-east-1"
    is_automation_enabled: bool = True
    start_time: str = "10:00"
    stop_time: str = "21:00"
    timezone: str = "Asia/Kolkata"

class ManualPowerActionPayload(BaseModel):
    resource_id: str
    service_type: str
    account_name: str
    region: str = "us-east-1"
    action: str  # 'START' | 'STOP'

class LogActionPayload(BaseModel):
    resource_id: str
    service_type: str
    account_name: str
    region: str
    action_type: str
    status: str
    details: str

@router.get("/schedules")
async def list_schedules(db: AsyncSession = Depends(get_db)):
    stmt = select(ControlResource)
    res = await db.execute(stmt)
    schedules = res.scalars().all()
    return schedules

@router.get("/summary")
async def get_summary(
    account_name: Optional[str] = None, 
    provider: Optional[str] = None,
    region: Optional[str] = None,
    tag: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    from sqlalchemy import func, case
    
    stmt = select(
        func.sum(case((ControlResource.status == 'RUNNING', 1), else_=0)),
        func.sum(case((ControlResource.status == 'STOPPED', 1), else_=0)),
        func.sum(case((ControlResource.is_automation_enabled == True, 1), else_=0))
    )
    
    if account_name and account_name != 'All Accounts':
        stmt = stmt.where(ControlResource.account_name == account_name)
    if provider and provider != 'AWS':
        stmt = stmt.where(ControlResource.cloud_provider == provider.lower())
    if region and region != 'All Regions':
        stmt = stmt.where(ControlResource.region == region)
    if tag and tag != 'All Tags':
        tag_key = tag.split(":")[0]
        stmt = stmt.where(ControlResource.tags_json.like(f'%"{tag_key}"%'))
        
    res = await db.execute(stmt)
    row = res.first()
    
    return {
        "running_count": int(row[0] or 0),
        "stopped_count": int(row[1] or 0),
        "active_schedules_count": int(row[2] or 0)
    }

@router.get("/resources")
async def list_controllable_resources(
    account_name: Optional[str] = None, 
    provider: Optional[str] = None,
    region: Optional[str] = None,
    tag: Optional[str] = None,
    limit: int = Query(50),
    offset: int = Query(0),
    db: AsyncSession = Depends(get_db)
):
    """Fetch controllable resources along with their current schedule metadata, with backend filtering."""
    stmt = select(ControlResource)
    
    if account_name and account_name != 'All Accounts':
        stmt = stmt.where(ControlResource.account_name == account_name)
    if provider and provider != 'AWS': # Default if empty or 'AWS' for now
        stmt = stmt.where(ControlResource.cloud_provider == provider.lower())
    if region and region != 'All Regions':
        stmt = stmt.where(ControlResource.region == region)
    if tag and tag != 'All Tags':
        tag_key = tag.split(":")[0]
        stmt = stmt.where(ControlResource.tags_json.like(f'%"{tag_key}"%'))
        
    stmt = stmt.limit(limit).offset(offset)
        
    res = await db.execute(stmt)
    schedules = res.scalars().all()
    
    return schedules

@router.get("/filter-options")
async def get_filter_options(account_name: Optional[str] = None, provider: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import text
    
    where_clause = "1=1"
    params = {}
    
    if account_name and account_name != 'All Accounts':
        where_clause += " AND account_name = :account"
        params['account'] = account_name
    if provider:
        where_clause += " AND cloud_provider = :provider"
        params['provider'] = provider.lower()

    # 1. Distinct Regions
    region_stmt = text(f"SELECT DISTINCT region FROM control_resources WHERE {where_clause} AND region IS NOT NULL AND region != ''")
    regions = [r[0] for r in (await db.execute(region_stmt, params)).all()]

    # 2. Distinct Tags using SQLite JSON extraction
    tags_stmt = text(f"""
        SELECT DISTINCT j.key || ':' || j.value 
        FROM control_resources r, json_each(r.tags_json) j
        WHERE {where_clause} 
        AND json_valid(r.tags_json) = 1
    """)
    tags = [t[0] for t in (await db.execute(tags_stmt, params)).all() if t[0]]
            
    return {
        "regions": sorted(regions),
        "tags": sorted(tags)
    }



@router.post("/schedule")
async def save_schedule(payload: ScheduleUpdatePayload, db: AsyncSession = Depends(get_db)):
    sched = await db.get(ControlResource, payload.resource_id)
    if not sched:
        raise HTTPException(status_code=404, detail="Resource not found")
    else:
        sched.is_automation_enabled = payload.is_automation_enabled
        sched.start_time = payload.start_time
        sched.stop_time = payload.stop_time
        sched.timezone = payload.timezone
        sched.account_name = payload.account_name
        sched.region = payload.region
        
    await db.commit()
    
    # Log schedule update
    log_entry = ControlActionLog(
        native_id=payload.native_id,
        resource_name=sched.resource_name,
        account_name=payload.account_name,
        provider=sched.cloud_provider,
        action_type="SCHEDULE_UPDATED",
        status="SUCCESS",
        details=f"Automation {'enabled' if payload.is_automation_enabled else 'disabled'}. Times: {payload.start_time} - {payload.stop_time} ({payload.timezone})"
    )
    db.add(log_entry)
    await db.commit()
    
    return {"status": "success", "message": "Schedule updated successfully"}

@router.post("/toggle-power")
async def toggle_power(payload: ManualPowerActionPayload, db: AsyncSession = Depends(get_db)):
    stmt = select(ConfigCloudAccount).where(ConfigCloudAccount.account_name == payload.account_name)
    res = await db.execute(stmt)
    config = res.scalars().first()
    if not config:
        raise HTTPException(status_code=404, detail=f"Cloud config for account '{payload.account_name}' not found.")
        
    creds = decrypt_credentials(config.encrypted_credentials)
    
    try:
        # Fetch the resource to check tags and saved_config
        sched_stmt = select(ControlResource).where(ControlResource.resource_id == payload.resource_id)
        sched_res = await db.execute(sched_stmt)
        sched = sched_res.scalars().first()
        
        # Block manual actions on ASG-managed EC2 instances
        if sched and sched.tags_json:
            tags = json.loads(sched.tags_json)
            if 'aws:autoscaling:groupName' in tags:
                raise HTTPException(status_code=400, detail="Cannot manually power toggle an EC2 instance managed by an Auto Scaling Group. Please control the parent ASG instead.")

        saved_config = sched.saved_config_json if sched else None

        if payload.action.upper() == 'START':
            res = await control_service.start_resource(config.provider, creds, payload.region, payload.service_type, payload.resource_id, saved_config=saved_config)
        elif payload.action.upper() == 'STOP':
            res = await control_service.stop_resource(config.provider, creds, payload.region, payload.service_type, payload.resource_id, saved_config=saved_config)
        else:
            raise HTTPException(status_code=400, detail="Action must be START or STOP")
            
        is_success = res.get("status") == "success"
        
        # Ensure we only log FAILED actions here. Success actions are logged by the frontend when completely finished.
        if res.get("status") != "success":
            sched_stmt = select(ControlResource).where(ControlResource.resource_id == payload.resource_id)
            sched_res = await db.execute(sched_stmt)
            sched = sched_res.scalars().first()
            
            log = ControlActionLog(
                native_id=payload.resource_id,
                resource_name=sched.resource_name if sched else payload.resource_id,
                account_name=payload.account_name,
                provider=config.provider,
                action_type=f"MANUAL_{payload.action.upper()}",
                status="FAILED",
                details=str(res.get("details", res.get("message", "")))
            )
            db.add(log)
            await db.commit()
        
        if res.get("status") == "error":
            raise HTTPException(status_code=400, detail=res.get("message"))
            
        # Update database with optimistic transitioning state and saved configs
        if res.get("status") == "success":
            if not sched:
                sched_stmt = select(ControlResource).where(ControlResource.resource_id == payload.resource_id)
                sched_res = await db.execute(sched_stmt)
                sched = sched_res.scalars().first()
            if sched:
                sched.status = "STARTING" if payload.action.upper() == "START" else "STOPPING"
                if "saved_config_json" in res:
                    sched.saved_config_json = res["saved_config_json"]
                await db.commit()
            
        return res
    except Exception as e:
        log_entry = ControlActionLog(
            native_id=payload.resource_id,
            resource_name=payload.resource_id,
            account_name=payload.account_name,
            provider=config.provider,
            action_type=f"MANUAL_{payload.action.upper()}",
            status="FAILED",
            details=str(e)
        )
        db.add(log_entry)
        await db.commit()
        raise e

@router.get("/audit-logs")
async def list_audit_logs(
    account_name: Optional[str] = None,
    event_type: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = Query(50), 
    offset: int = Query(0), 
    db: AsyncSession = Depends(get_db)
):
    stmt = select(ControlActionLog)
    
    if account_name and account_name != 'All Accounts':
        stmt = stmt.where(ControlActionLog.account_name == account_name)
        
    if event_type and event_type != 'All':
        if event_type == 'power':
            stmt = stmt.where(ControlActionLog.action_type.like('MANUAL_%'))
        elif event_type == 'schedule':
            stmt = stmt.where(ControlActionLog.action_type == 'SCHEDULE_UPDATED')
            
    if search:
        search_term = f"%{search}%"
        stmt = stmt.where(
            (ControlActionLog.native_id.ilike(search_term)) |
            (ControlActionLog.resource_name.ilike(search_term)) |
            (ControlActionLog.action_type.ilike(search_term))
        )
        
    stmt = stmt.order_by(ControlActionLog.timestamp.desc()).limit(limit).offset(offset)
    res = await db.execute(stmt)
    logs = res.scalars().all()
    return logs

@router.post("/log-action")
async def log_action(payload: LogActionPayload, db: AsyncSession = Depends(get_db)):
    # get provider from config
    stmt = select(ConfigCloudAccount).where(ConfigCloudAccount.account_name == payload.account_name)
    res = await db.execute(stmt)
    config = res.scalars().first()
    provider = config.provider if config else "aws"
    
    # get resource name
    sched_stmt = select(ControlResource).where(ControlResource.resource_id == payload.resource_id)
    sched_res = await db.execute(sched_stmt)
    sched = sched_res.scalars().first()
    
    log = ControlActionLog(
        native_id=payload.resource_id,
        resource_name=sched.resource_name if sched else payload.resource_id,
        account_name=payload.account_name,
        provider=provider,
        action_type=payload.action_type,
        status=payload.status,
        details=payload.details
    )
    db.add(log)
    await db.commit()
    return {"status": "success"}

@router.post("/sync")
async def sync_resources(account_name: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    print(f"[Backend Sync] Starting sync. Target account: {account_name if account_name else 'ALL'}")
    stmt = select(ConfigCloudAccount)
    if account_name:
        stmt = stmt.where(ConfigCloudAccount.account_name == account_name)
    res = await db.execute(stmt)
    configs = res.scalars().all()
    
    print(f"[Backend Sync] Found {len(configs)} configuration(s) to process.")
    
    synced_count = 0
    for config in configs:
        if not config.verified:
            print(f"[Backend Sync] Skipping {config.account_name} because it is not verified.")
            continue
            
        print(f"[Backend Sync] Processing account {config.account_name} in region {config.default_region}...")
        creds = decrypt_credentials(config.encrypted_credentials)
        try:
            resources = await control_service.sync_provider_resources(
                config.provider, creds, "all"
            )
            print(f"[Backend Sync] Fetched {len(resources)} resources from {config.provider}.")
            
            # Fetch existing resources from DB to track stale ones
            stmt = select(ControlResource).where(
                ControlResource.account_name == config.account_name,
                ControlResource.cloud_provider == config.provider
            )
            existing_schedules = (await db.execute(stmt)).scalars().all()
            existing_ids = {s.resource_id for s in existing_schedules}
            
            fetched_ids = set()
            for r in resources:
                fetched_ids.add(r['resource_id'])
                # Upsert into ControlResource
                sched = await db.get(ControlResource, r['resource_id'])
                if not sched:
                    sched = ControlResource(
                        resource_id=r['resource_id'],
                        service_type=r['service_type'],
                        control_type=r['control_type'],
                        resource_name=r.get('resource_name', r['resource_id']),
                        status=r.get('status', 'UNKNOWN'),
                        instance_spec=r.get('instance_spec', 'unknown'),
                        cloud_provider=config.provider,
                        account_name=config.account_name,
                        region=r.get('region', config.default_region),
                        tags_json=json.dumps(r.get('tags', {})),
                        parent_resource_id=r.get('parent_resource_id'),
                        is_automation_enabled=False
                    )
                    db.add(sched)
                else:
                    sched.service_type = r['service_type']
                    sched.control_type = r['control_type']
                    sched.resource_name = r.get('resource_name', r['resource_id'])
                    sched.status = r.get('status', 'UNKNOWN')
                    sched.instance_spec = r.get('instance_spec', 'unknown')
                    sched.cloud_provider = config.provider
                    sched.account_name = config.account_name
                    sched.region = r.get('region', config.default_region)
                    sched.tags_json = json.dumps(r.get('tags', {}))
                    sched.parent_resource_id = r.get('parent_resource_id')
                    
            # Delete stale resources that no longer exist in AWS
            stale_ids = existing_ids - fetched_ids
            for stale_id in stale_ids:
                sched_to_delete = await db.get(ControlResource, stale_id)
                if sched_to_delete:
                    await db.delete(sched_to_delete)
                    print(f"[Backend Sync] Deleted stale resource: {stale_id}")
                    
            synced_count += len(resources)
                
        except Exception as e:
            import traceback
            traceback.print_exc()
            print(f"[Backend Sync] Failed to sync account {config.account_name}: {e}")
            pass # Skip failed providers or log them
            
    await db.commit()
    return {"status": "success", "synced_count": synced_count}

@router.get("/state/{provider}/{region}/{service_type}/{resource_id}")
async def get_live_state(
    provider: str,
    region: str,
    service_type: str,
    resource_id: str,
    account_name: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    stmt = select(ConfigCloudAccount)
    if account_name:
        stmt = stmt.where(ConfigCloudAccount.account_name == account_name)
    else:
        stmt = stmt.where(ConfigCloudAccount.is_active == True)
        
    result = await db.execute(stmt)
    config = result.scalars().first()
    
    if not config:
        raise HTTPException(status_code=404, detail="Active cloud configuration not found")
        
    creds = decrypt_credentials(config.encrypted_credentials)
    
    state = await control_service.get_resource_state(provider, creds, region, service_type, resource_id)
    
    # Keep the database perfectly in sync with the live polled state
    sched_stmt = select(ControlResource).where(ControlResource.resource_id == resource_id)
    sched_res = await db.execute(sched_stmt)
    sched = sched_res.scalars().first()
    if sched and sched.status != state:
        sched.status = state
        await db.commit()
        
    return {"resource_id": resource_id, "status": state}
