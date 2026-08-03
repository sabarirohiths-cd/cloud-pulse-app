from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import and_, func
from app.models import InventoryResource
from datetime import datetime, timedelta
import json

class InventoryQueryService:
    @staticmethod
    async def get_advanced_summary(db: AsyncSession, account: str, provider: str = None, region: str = None, linked_account: str = None, tag: str = None) -> dict:
        """
        Returns pre-aggregated server-side summary to prevent frontend UI freezing.
        Uses fast SQL GROUP BYs instead of shipping massive JSON payloads.
        """
        conditions = [InventoryResource.status == "active"]
        if account: conditions.append(InventoryResource.account_name == account)
        if provider: conditions.append(InventoryResource.provider == provider)
        if region and region != 'All Regions': conditions.append(InventoryResource.region == region)
        if linked_account and linked_account != 'All Accounts': conditions.append(InventoryResource.linked_account == linked_account)
        if tag and tag != 'All': conditions.append(InventoryResource.tags.like(f'%"{tag}"%'))
        
        from sqlalchemy import case
        today_prefix = (datetime.utcnow() + timedelta(hours=5, minutes=30)).strftime("%Y-%m-%d")
        
        # Consolidate Total, Billable, New Today, Untagged into ONE query
        summary_stmt = select(
            func.count(),
            func.sum(case((InventoryResource.billable == True, 1), else_=0)),
            func.sum(case((InventoryResource.first_seen_date.like(f"{today_prefix}%"), 1), else_=0)),
            func.sum(case(((InventoryResource.tags == None) | (InventoryResource.tags == "") | (InventoryResource.tags == "{}"), 1), else_=0))
        ).where(and_(*conditions))
        
        row = (await db.execute(summary_stmt)).first()
        total = row[0] or 0
        billable = row[1] or 0
        new_today = row[2] or 0
        untagged = row[3] or 0
        non_billable = total - billable
        tagged = total - untagged
        
        # 4. Deleted Today
        del_conds = [InventoryResource.status == "deleted", InventoryResource.deleted_at.like(f"{today_prefix}%")]
        if account: del_conds.append(InventoryResource.account_name == account)
        if provider: del_conds.append(InventoryResource.provider == provider)
        if region and region != 'All Regions': del_conds.append(InventoryResource.region == region)
        if linked_account and linked_account != 'All Accounts': del_conds.append(InventoryResource.linked_account == linked_account)
        if tag and tag != 'All': del_conds.append(InventoryResource.tags.like(f'%"{tag}"%'))
        
        deleted_today_stmt = select(func.count()).where(and_(*del_conds))
        deleted_today = (await db.execute(deleted_today_stmt)).scalar() or 0
        
        # 4.5 Deleted Type Breakdown
        del_type_conds = [InventoryResource.status == "deleted"]
        if account: del_type_conds.append(InventoryResource.account_name == account)
        if provider: del_type_conds.append(InventoryResource.provider == provider)
        if region and region != 'All Regions': del_type_conds.append(InventoryResource.region == region)
        if linked_account and linked_account != 'All Accounts': del_type_conds.append(InventoryResource.linked_account == linked_account)
        if tag and tag != 'All': del_type_conds.append(InventoryResource.tags.like(f'%"{tag}"%'))
        
        del_type_stmt = select(InventoryResource.resource_type, func.count()).where(and_(*del_type_conds)).group_by(InventoryResource.resource_type)
        del_type_res = await db.execute(del_type_stmt)
        deleted_type_breakdown = [{"type": t, "count": c} for t, c in del_type_res.all()]
        deleted_type_breakdown.sort(key=lambda x: x["count"], reverse=True)
        
        # 4.6 Deleted Region Breakdown
        del_reg_stmt = select(InventoryResource.region, func.count()).where(and_(*del_type_conds)).group_by(InventoryResource.region)
        del_reg_res = await db.execute(del_reg_stmt)
        deleted_region_breakdown = [{"region": r, "count": c} for r, c in del_reg_res.all() if r]
        
        # 5. Type Breakdown
        type_stmt = select(InventoryResource.resource_type, func.count()).where(and_(*conditions)).group_by(InventoryResource.resource_type)
        type_res = await db.execute(type_stmt)
        type_breakdown = [{"type": t, "count": c} for t, c in type_res.all()]
        type_breakdown.sort(key=lambda x: x["count"], reverse=True)
        
        # 6. Region Breakdown
        reg_stmt = select(InventoryResource.region, func.count()).where(and_(*conditions)).group_by(InventoryResource.region)
        reg_res = await db.execute(reg_stmt)
        region_breakdown = [{"region": r, "count": c} for r, c in reg_res.all() if r]
        
        # 7. Linked Account Breakdown
        link_stmt = select(InventoryResource.linked_account, func.count()).where(and_(*conditions)).group_by(InventoryResource.linked_account)
        link_res = await db.execute(link_stmt)
        linked_breakdown = [{"linked_account": r, "count": c} for r, c in link_res.all() if r and r != 'Unknown']
        
        return {
            "total": total,
            "billable": billable,
            "non_billable": non_billable,
            "new_today": new_today,
            "deleted_today": deleted_today,
            "tagged": tagged,
            "untagged": untagged,
            "type_breakdown": type_breakdown,
            "deleted_type_breakdown": deleted_type_breakdown,
            "region_breakdown": region_breakdown,
            "deleted_region_breakdown": deleted_region_breakdown,
            "linked_breakdown": linked_breakdown,
            "group_breakdown": type_breakdown
        }

    @staticmethod
    async def get_paginated_resources(
        db: AsyncSession, 
        account: str = None, 
        provider: str = None,
        resource_type: str = None,
        region: str = None,
        billable: bool = None,
        linked_account: str = None,
        tag: str = None,
        time_filter: str = None,
        status: str = "active",
        limit: int = 50,
        offset: int = 0
    ) -> dict:
        """
        Fetches paginated records directly from SQL to guarantee O(1) memory overhead.
        """
        conditions = [InventoryResource.status == status]
        if account: conditions.append(InventoryResource.account_name == account)
        if provider: conditions.append(InventoryResource.provider == provider)
        if resource_type:
            types = [t.strip() for t in resource_type.split(',')]
            if len(types) == 1:
                conditions.append(InventoryResource.resource_type == types[0])
            else:
                conditions.append(InventoryResource.resource_type.in_(types))
        if region and region != 'All Regions': conditions.append(InventoryResource.region == region)
        if linked_account and linked_account != 'All Accounts': conditions.append(InventoryResource.linked_account == linked_account)
        if tag and tag != 'All': conditions.append(InventoryResource.tags.like(f'%"{tag}"%'))
        if billable is not None: conditions.append(InventoryResource.billable == billable)
        
        if time_filter == 'Today':
            today_prefix = (datetime.utcnow() + timedelta(hours=5, minutes=30)).strftime("%Y-%m-%d")
            if status == 'deleted':
                conditions.append(InventoryResource.deleted_at.like(f"{today_prefix}%"))
            else:
                conditions.append(InventoryResource.first_seen_date.like(f"{today_prefix}%"))
        
        count_stmt = select(func.count()).where(and_(*conditions))
        total_count = (await db.execute(count_stmt)).scalar() or 0
        
        stmt = select(InventoryResource).where(and_(*conditions)).limit(limit).offset(offset)
        result = await db.execute(stmt)
        resources = result.scalars().all()
        
        response = {
            "total": total_count,
            "page": (offset // limit) + 1 if limit > 0 else 1,
            "resources": [
                {
                    "id": r.id,
                    "native_id": r.native_id,
                    "name": r.name,
                    "tags": r.tags,
                    "resource_type": r.resource_type,
                    "provider": r.provider,
                    "account_name": r.account_name,
                    "linked_account": r.linked_account,
                    "region": r.region,
                    "billable": r.billable,
                    "status": r.status,
                    "first_seen_date": r.first_seen_date,
                    "deleted_at": r.deleted_at
                }
                for r in resources
            ]
        }

        if offset == 0:
            reg_stmt = select(InventoryResource.region, func.count()).where(and_(*conditions)).group_by(InventoryResource.region)
            reg_res = await db.execute(reg_stmt)
            response["region_breakdown"] = [{"region": r, "count": c} for r, c in reg_res.all() if r]

            type_stmt = select(InventoryResource.resource_type, func.count()).where(and_(*conditions)).group_by(InventoryResource.resource_type)
            type_res = await db.execute(type_stmt)
            response["type_breakdown"] = [{"type": t, "count": c} for t, c in type_res.all()]
            
        return response
