from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import and_, delete
from datetime import datetime, timedelta
from app.core.database import get_db
from app.models import ConfigCloudAccount, InventoryResource, InventoryChange, InventorySnapshot
from app.services.aws.service import AWSService
from app.services.inventory_service import sync_inventory
from app.services.inventory_queries import InventoryQueryService
import json

router = APIRouter(prefix="/inventory", tags=["Inventory"])

@router.post("/sync")
async def trigger_sync(
    provider: str = Query(...), 
    config_id: int = Query(...),
    db: AsyncSession = Depends(get_db)
):
    db_config = await db.get(ConfigCloudAccount, config_id)
    if not db_config:
        raise HTTPException(status_code=404, detail="Config not found")
        
    from app.core.security import decrypt_credentials
    creds = decrypt_credentials(db_config.encrypted_credentials)

    if provider == "aws":
        aws_service = AWSService()
        is_valid, msg = await aws_service.test_connection(creds)
        if not is_valid:
            raise HTTPException(status_code=401, detail=f"AWS Authentication failed: {msg}")
        try:
            fetched_resources = await aws_service.fetch_all_resources(creds, db_config.default_region)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    elif provider == "azure":
        from app.services.azure.service import AzureService
        azure_service = AzureService()
        is_valid, msg = await azure_service.test_connection(creds)
        if not is_valid:
            raise HTTPException(status_code=401, detail=f"Azure Authentication failed: {msg}")
        sub_id = creds.get('subscription_id')
        fetched_resources = await azure_service.fetch_all_resources(creds, sub_id)
    elif provider == "gcp":
        from app.services.gcp.service import GCPService
        gcp_service = GCPService()
        is_valid, msg = await gcp_service.test_connection(creds)
        if not is_valid:
            raise HTTPException(status_code=401, detail=f"GCP Authentication failed: {msg}")
        fetched_resources = await gcp_service.fetch_all_resources(creds)
    else:
        raise HTTPException(status_code=400, detail="Unsupported cloud provider")
    
    metrics = await sync_inventory(db, provider, db_config.account_name, fetched_resources)
    
    response = {"status": "success", "metrics": metrics}
    return response

@router.get("/summary")
async def get_summary(account: str = Query(None), db: AsyncSession = Depends(get_db)):
    conditions = [InventoryResource.status == "active"]
    if account: conditions.append(InventoryResource.account_name == account)
    stmt = select(InventoryResource).where(and_(*conditions))
    result = await db.execute(stmt)
    active_items = result.scalars().all()
    
    total = len(active_items)
    billable = sum(1 for x in active_items if x.billable)
    non_billable = total - billable
    
    today_prefix = (datetime.utcnow() + timedelta(hours=5, minutes=30)).strftime("%Y-%m-%d")
    new_today = sum(1 for x in active_items if x.first_seen_date and x.first_seen_date.startswith(today_prefix))
    
    del_conditions = [InventoryResource.status == "deleted", InventoryResource.deleted_at.like(f"{today_prefix}%")]
    if account: del_conditions.append(InventoryResource.account_name == account)
    del_stmt = select(InventoryResource).where(and_(*del_conditions))
    del_result = await db.execute(del_stmt)
    deleted_today = len(del_result.scalars().all())
    
    # Calculate category counts by type and region
    by_type = {}
    by_region = {}
    for x in active_items:
        by_type[x.resource_type] = by_type.get(x.resource_type, 0) + 1
        by_region[x.region] = by_region.get(x.region, 0) + 1
        
    return {
        "total_active": total,
        "billable": billable,
        "non_billable": non_billable,
        "new_today": new_today,
        "deleted_today": deleted_today,
        "by_type": by_type,
        "by_region": by_region
    }

@router.delete("/wipe")
async def wipe_database(provider: str = Query(None), account: str = Query(None), db: AsyncSession = Depends(get_db)):
    if account and provider:
        from sqlalchemy import and_
        await db.execute(delete(InventoryResource).where(and_(InventoryResource.account_name == account, InventoryResource.provider == provider.lower())))
        await db.execute(delete(InventoryChange).where(InventoryChange.account_name == account))
        await db.execute(delete(InventorySnapshot).where(InventorySnapshot.account_name == account))
    elif account:
        await db.execute(delete(InventoryResource).where(InventoryResource.account_name == account))
        await db.execute(delete(InventoryChange).where(InventoryChange.account_name == account))
        await db.execute(delete(InventorySnapshot).where(InventorySnapshot.account_name == account))
    else:
        # WARNING: This deletes ALL records. Temporary testing endpoint.
        await db.execute(delete(InventoryResource))
        await db.execute(delete(InventoryChange))
        await db.execute(delete(InventorySnapshot))
    await db.commit()
    return {"status": "wiped"}

@router.get("/changes")
async def get_changes(
    account: str = Query(None), 
    days: int = Query(30), 
    change_type: str = Query(None),
    search: str = Query(None),
    limit: int = Query(50),
    offset: int = Query(0),
    db: AsyncSession = Depends(get_db)
):
    from sqlalchemy import func, or_
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    conditions = [InventoryChange.timestamp >= cutoff_date]
    if account: conditions.append(InventoryChange.account_name == account)
    
    if change_type and change_type != 'All':
        conditions.append(InventoryChange.change_type == change_type)
        
    if search:
        search_term = f"%{search}%"
        conditions.append(
            or_(
                InventoryChange.native_id.ilike(search_term),
                InventoryResource.resource_type.ilike(search_term),
                InventoryResource.name.ilike(search_term)
            )
        )
        
    # Count query
    count_stmt = select(func.count(InventoryChange.id)).outerjoin(
        InventoryResource, 
        and_(InventoryChange.native_id == InventoryResource.native_id, InventoryChange.account_name == InventoryResource.account_name)
    ).where(and_(*conditions))
    total_count = (await db.execute(count_stmt)).scalar() or 0
    
    stmt = select(InventoryChange, InventoryResource).outerjoin(
        InventoryResource, 
        and_(InventoryChange.native_id == InventoryResource.native_id, InventoryChange.account_name == InventoryResource.account_name)
    ).where(and_(*conditions)).order_by(InventoryChange.timestamp.desc()).limit(limit).offset(offset)
    
    result = await db.execute(stmt)
    rows = result.all()
    
    return {
        "total": total_count,
        "page": (offset // limit) + 1 if limit > 0 else 1,
        "changes": [
            {
                "id": row.InventoryChange.id,
                "native_id": row.InventoryChange.native_id,
                "change_type": row.InventoryChange.change_type,
                "detected_at": row.InventoryChange.timestamp,
                "details": json.loads(row.InventoryChange.details) if getattr(row.InventoryChange, 'details', None) else None,
                "resource_type": row.InventoryResource.resource_type if row.InventoryResource else "Unknown",
                "region": row.InventoryResource.region if row.InventoryResource else "Unknown",
                "name": row.InventoryResource.name if row.InventoryResource else None
            }
            for row in rows
        ]
    }

@router.get("/trend")
async def get_trend(account: str = Query(None), resource_type: str = Query(None), days: int = Query(30), db: AsyncSession = Depends(get_db)):
    conditions = []
    if account: conditions.append(InventorySnapshot.account_name == account)
    
    if days:
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        conditions.append(InventorySnapshot.snapshot_date >= cutoff_date)

    stmt = select(InventorySnapshot).where(and_(*conditions) if conditions else True).order_by(InventorySnapshot.snapshot_date.asc())
    result = await db.execute(stmt)
    snapshots = result.scalars().all()
    
    return [
        {
            "id": s.id,
            "snapshot_date": s.snapshot_date,
            "total_active_count": json.loads(s.category_breakdown).get(resource_type, 0) if resource_type and s.category_breakdown else s.total_active_count,
            "billable_count": s.billable_count,
            "non_billable_count": s.non_billable_count,
            "deleted_today": s.deleted_today,
            "category_breakdown": json.loads(s.category_breakdown) if s.category_breakdown else {}
        }
        for s in snapshots
    ]

@router.get("/summary/advanced")
async def get_advanced_summary(
    account: str = Query(None), 
    provider: str = Query(None), 
    region: str = Query(None),
    linked_account: str = Query(None),
    tag: str = Query(None),
    db: AsyncSession = Depends(get_db)
):
    return await InventoryQueryService.get_advanced_summary(db, account, provider, region, linked_account, tag)

@router.get("/resources")
async def get_resources(
    account: str = Query(None),
    provider: str = Query(None),
    resource_type: str = Query(None),
    region: str = Query(None),
    billable: bool = Query(None),
    linked_account: str = Query(None),
    tag: str = Query(None),
    time_filter: str = Query(None),
    status: str = Query("active"),
    limit: int = Query(50),
    offset: int = Query(0),
    db: AsyncSession = Depends(get_db)
):
    return await InventoryQueryService.get_paginated_resources(
        db=db, account=account, provider=provider, resource_type=resource_type, 
        region=region, billable=billable, linked_account=linked_account, tag=tag,
        time_filter=time_filter, status=status, limit=limit, offset=offset
    )

@router.get("/filter-options")
async def get_filter_options(account: str = Query(None), provider: str = Query(None), db: AsyncSession = Depends(get_db)):
    from sqlalchemy import text
    
    where_clause = "status = 'active'"
    params = {}
    
    if account:
        where_clause += " AND account_name = :account"
        params['account'] = account
    if provider:
        where_clause += " AND provider = :provider"
        params['provider'] = provider

    # 1. Distinct Regions
    region_stmt = text(f"SELECT DISTINCT region FROM inventory_resources WHERE {where_clause} AND region IS NOT NULL AND region != ''")
    regions = [r[0] for r in (await db.execute(region_stmt, params)).all()]

    # 2. Distinct Linked Accounts
    linked_stmt = text(f"SELECT DISTINCT linked_account FROM inventory_resources WHERE {where_clause} AND linked_account IS NOT NULL AND linked_account != 'Unknown' AND linked_account != ''")
    linked = [l[0] for l in (await db.execute(linked_stmt, params)).all()]

    # 3. Distinct Tags using SQLite JSON extraction
    tags_stmt = text(f"""
        SELECT DISTINCT j.key 
        FROM inventory_resources r, json_each(r.tags) j
        WHERE {where_clause} 
        AND json_valid(r.tags) = 1
    """)
    tags = [t[0] for t in (await db.execute(tags_stmt, params)).all() if t[0]]

    return {
        "regions": sorted(regions),
        "linked_accounts": sorted(linked),
        "tags": sorted(tags)
    }

@router.get("/activity-heatmap")
async def get_activity_heatmap(account: str = Query(None), resource_type: str = Query(None), db: AsyncSession = Depends(get_db)):
    cutoff_date = datetime.utcnow() - timedelta(days=180)
    cutoff_str = cutoff_date.strftime("%Y-%m-%d")
    
    stmt = select(InventoryResource)
    if account:
        stmt = stmt.where(InventoryResource.account_name == account)
    if resource_type:
        stmt = stmt.where(InventoryResource.resource_type == resource_type)
    
    result = await db.execute(stmt)
    resources = result.scalars().all()
    
    activity = {}
    for r in resources:
        if r.first_seen_date and len(r.first_seen_date) >= 10:
            d = r.first_seen_date[:10]
            if d >= cutoff_str:
                if d not in activity: activity[d] = {"created": 0, "deleted": 0, "updated": 0}
                activity[d]["created"] += 1
        if r.deleted_at and len(r.deleted_at) >= 10:
            d = r.deleted_at[:10]
            if d >= cutoff_str:
                if d not in activity: activity[d] = {"created": 0, "deleted": 0, "updated": 0}
                activity[d]["deleted"] += 1
                
    # Also fetch 'updated' events from InventoryChange
    change_stmt = select(InventoryChange.timestamp).where(InventoryChange.change_type == 'updated', InventoryChange.timestamp >= cutoff_date)
    if account:
        change_stmt = change_stmt.where(InventoryChange.account_name == account)
    # Note: we don't filter by resource_type here for simplicity, or we could join with InventoryResource
    if resource_type:
        change_stmt = change_stmt.join(InventoryResource, and_(InventoryChange.native_id == InventoryResource.native_id, InventoryChange.account_name == InventoryResource.account_name)).where(InventoryResource.resource_type == resource_type)
        
    change_result = await db.execute(change_stmt)
    updates = change_result.scalars().all()
    for ts in updates:
        d = ts.strftime("%Y-%m-%d")
        if d not in activity: activity[d] = {"created": 0, "deleted": 0, "updated": 0}
        activity[d]["updated"] += 1
            
    heatmap_data = [
        {
            "date": k, 
            "count": v["created"] + v["deleted"] + v.get("updated", 0),
            "created": v["created"],
            "deleted": v["deleted"],
            "updated": v.get("updated", 0)
        } 
        for k, v in sorted(activity.items())
    ]
    return heatmap_data
