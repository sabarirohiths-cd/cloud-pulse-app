from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, text, func, case, and_, or_
from typing import Optional
from app.models import ControlResource

class ControlRepository:
    
    @staticmethod
    async def get_all_schedules(db: AsyncSession):
        stmt = select(ControlResource)
        res = await db.execute(stmt)
        return res.scalars().all()

    @staticmethod
    async def get_dashboard_summary(db: AsyncSession, account_name: Optional[str] = None, provider: Optional[str] = None, region: Optional[str] = None, tag: Optional[str] = None):
        stmt = select(
            func.count(ControlResource.resource_id),
            func.sum(case((ControlResource.status == 'RUNNING', 1), else_=0)),
            func.sum(case((ControlResource.status == 'STOPPED', 1), else_=0)),
            func.sum(case((ControlResource.is_automation_enabled == True, 1), else_=0))
        )
        
        from app.core.constants import PARENT_CONTAINER_SERVICES
        
        # Exclude parent clusters from the count since they are non-actionable containers
        stmt = stmt.where(
            ~and_(
                ControlResource.service_type.in_(PARENT_CONTAINER_SERVICES),
                ControlResource.parent_resource_id.is_(None)
            )
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
            "total_count": int(row[0] or 0),
            "running_count": int(row[1] or 0),
            "stopped_count": int(row[2] or 0),
            "active_schedules_count": int(row[3] or 0)
        }

    @staticmethod
    async def get_filtered_resources(db: AsyncSession, limit: int, offset: int, show_hidden: bool, account_name: Optional[str] = None, provider: Optional[str] = None, region: Optional[str] = None, tag: Optional[str] = None):
        stmt = select(ControlResource)
        
        if not show_hidden:
            stmt = stmt.where(ControlResource.is_visible == True)
            
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
        schedules = list(res.scalars().all())
        
        if not schedules:
            return []
            
        # Eager-load families to fix frontend Group View during pagination
        parent_ids = {s.parent_resource_id for s in schedules if s.parent_resource_id}
        resource_ids = {s.resource_id for s in schedules}
        missing_parents = parent_ids - resource_ids
        
        all_parent_ids = resource_ids.union(missing_parents)
        
        if missing_parents:
            parent_stmt = select(ControlResource).where(ControlResource.resource_id.in_(missing_parents))
            parent_res = await db.execute(parent_stmt)
            schedules.extend(parent_res.scalars().all())
            
        if all_parent_ids:
            child_stmt = select(ControlResource).where(ControlResource.parent_resource_id.in_(all_parent_ids))
            if not show_hidden:
                child_stmt = child_stmt.where(ControlResource.is_visible == True)
                
            child_res = await db.execute(child_stmt)
            children = child_res.scalars().all()
            
            existing_ids = {s.resource_id for s in schedules}
            for child in children:
                if child.resource_id not in existing_ids:
                    schedules.append(child)
                    existing_ids.add(child.resource_id)
                    
        return schedules

    @staticmethod
    async def update_visibility(db: AsyncSession, resource_ids: list[str], is_visible: bool):
        # Base case: update the explicitly provided IDs
        all_ids_to_update = set(resource_ids)
        
        # Recursively find all children to cascade the visibility toggle
        current_parent_ids = list(resource_ids)
        while current_parent_ids:
            # Find children of the current parents
            child_stmt = select(ControlResource.resource_id).where(ControlResource.parent_resource_id.in_(current_parent_ids))
            child_res = await db.execute(child_stmt)
            child_ids = child_res.scalars().all()
            
            if not child_ids:
                break
                
            all_ids_to_update.update(child_ids)
            current_parent_ids = child_ids

        stmt = (
            update(ControlResource)
            .where(ControlResource.resource_id.in_(all_ids_to_update))
            .values(is_visible=is_visible)
        )
        await db.execute(stmt)
        await db.commit()
        return len(all_ids_to_update)

    @staticmethod
    async def get_filter_options(db: AsyncSession, account_name: Optional[str] = None, provider: Optional[str] = None):
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
            SELECT DISTINCT j.key 
            FROM control_resources r, json_each(r.tags_json) j
            WHERE {where_clause} AND r.tags_json IS NOT NULL AND r.tags_json != '{{}}'
        """)
        tags = [r[0] for r in (await db.execute(tags_stmt, params)).all()]
                
        return {
            "regions": sorted(regions),
            "tags": sorted(tags)
        }

control_repository = ControlRepository()
