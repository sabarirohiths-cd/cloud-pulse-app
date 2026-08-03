import os
with open('app/api/control.py', 'r', encoding='utf-8') as f:
    text = f.read()

# We want to change the beginning of _background_control_sync to separate the DB fetch from the long running task.
new_func_start = """async def _background_control_sync(account_name: Optional[str]) -> str:
    configs_to_process = []
    try:
        async with SessionLocal() as db:
            print(f"[Backend Sync] Starting sync. Target account: {account_name if account_name else 'ALL'}")
            stmt = select(ConfigCloudAccount)
            if account_name:
                stmt = stmt.where(ConfigCloudAccount.account_name == account_name)
            res = await db.execute(stmt)
            configs = res.scalars().all()
            for c in configs:
                configs_to_process.append({
                    "account_name": c.account_name,
                    "provider": c.provider,
                    "default_region": c.default_region,
                    "encrypted_credentials": c.encrypted_credentials,
                    "verified": c.verified
                })
            
            print(f"[Backend Sync] Found {len(configs_to_process)} configuration(s) to process.")
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        return f"Failed to fetch configs: {e}"

    synced_count = 0
    try:
        for config in configs_to_process:
            if not config["verified"]:
                print(f"[Backend Sync] Skipping {config['account_name']} because it is not verified.")
                continue
            
            print(f"[Backend Sync] Processing account {config['account_name']} in region {config['default_region']}...")
            creds = decrypt_credentials(config["encrypted_credentials"])
            try:
                resources = await control_service.sync_provider_resources(
                    config["provider"], creds, "all"
                )
                print(f"[Backend Sync] Fetched {len(resources)} resources from {config['provider']}.")
            
                async with SessionLocal() as db:
                    # Pre-Sync Data Migration: Auto-Merge Orphaned Data
                    if resources:
                        from sqlalchemy import update
                        active_linked = resources[0].get("linked_account")
                        if active_linked:
                            # Find old accounts to migrate
                            old_accounts_stmt = select(ControlResource.account_name).where(
                                ControlResource.cloud_provider == config["provider"],
                                ControlResource.linked_account == active_linked,
                                ControlResource.account_name != config["account_name"]
                            ).distinct()
                            old_accounts = (await db.execute(old_accounts_stmt)).scalars().all()
                        
                            if old_accounts:
                                # Migrate ControlResource
                                await db.execute(
                                    update(ControlResource)
                                    .where(
                                        ControlResource.cloud_provider == config["provider"],
                                        ControlResource.linked_account == active_linked,
                                        ControlResource.account_name != config["account_name"]
                                    )
                                    .values(account_name=config["account_name"])
                                )
                                # Migrate ControlActionLog
                                await db.execute(
                                    update(ControlActionLog)
                                    .where(ControlActionLog.account_name.in_(old_accounts))
                                    .values(account_name=config["account_name"])
                                )
                                await db.commit()
                
                    # Fetch existing PARENT resources from DB to track stale ones
                    # We ignore child resources here because the global scanner does not fetch them
                    stmt = select(ControlResource).where(
                        ControlResource.account_name == config["account_name"],
                        ControlResource.cloud_provider == config["provider"],
                        ControlResource.parent_resource_id == None
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
                                cloud_provider=config["provider"],
                                account_name=config["account_name"],
                                linked_account=r.get('linked_account'),
                                region=r.get('region', config["default_region"]),
                                tags_json=json.dumps(r.get('tags', {})),
                                parent_resource_id=r.get('parent_resource_id'),
                                is_automation_enabled=False
                            )
                            db.add(sched)
                        
                            # Log the discovery
                            log_entry = ControlActionLog(
                                native_id=sched.resource_id,
                                resource_name=sched.resource_name,
                                account_name=sched.account_name,
                                provider=sched.cloud_provider,
                                action_type="DISCOVERED",
                                status="SUCCESS",
                                details="Resource newly discovered during sync."
                            )
                            db.add(log_entry)
                        
                            from app.models.system.system_notification import SystemNotification
                            notification = SystemNotification(
                                title="New Resource Discovered",
                                message=f"{sched.resource_name} ({sched.resource_id}) was newly discovered during sync.",
                                type="INFO",
                                module="CONTROL"
                            )
                            db.add(notification)
                        else:
                            sched.service_type = r['service_type']
                            sched.control_type = r['control_type']
                            sched.resource_name = r.get('resource_name', r['resource_id'])
                            sched.status = r.get('status', 'UNKNOWN')
                            sched.instance_spec = r.get('instance_spec', 'unknown')
                            sched.cloud_provider = config["provider"]
                            sched.account_name = config["account_name"]
                            sched.linked_account = r.get('linked_account')
                            sched.region = r.get('region', config["default_region"])
                            sched.tags_json = json.dumps(r.get('tags', {}))
                            sched.parent_resource_id = r.get('parent_resource_id')
                        
                    # Delete stale resources that no longer exist in AWS
                    stale_ids = existing_ids - fetched_ids
                    for stale_id in stale_ids:
                        sched_to_delete = await db.get(ControlResource, stale_id)
                        if sched_to_delete:
                            await db.delete(sched_to_delete)
                            print(f"[Backend Sync] Deleted stale resource: {stale_id}")
                        
                    # Garbage collect child resources that have reached TERMINATED state
                    dead_children_stmt = select(ControlResource).where(
                        ControlResource.account_name == config["account_name"],
                        ControlResource.cloud_provider == config["provider"],
                        ControlResource.parent_resource_id != None,
                        ControlResource.status == 'TERMINATED'
                    )
                    dead_children = (await db.execute(dead_children_stmt)).scalars().all()
                    for dead in dead_children:
                        await db.delete(dead)
                        print(f"[Backend Sync] Garbage collected dead child resource: {dead.resource_id}")
                        
                    synced_count += len(resources)
                    await db.commit()
                    
            except Exception as e:
                import traceback
                traceback.print_exc()
                print(f"[Backend Sync] Failed to sync account {config['account_name']}: {e}")
                async with SessionLocal() as db:
                    from app.models.system.system_notification import SystemNotification
                    notification = SystemNotification(
                        title="Control Sync Failed",
                        message=f"Failed to sync {config['account_name']}: {str(e)}",
                        type="ERROR",
                        module="CONTROL"
                    )
                    db.add(notification)
                    await db.commit()
                pass # Skip failed providers or log them
            
        async with SessionLocal() as db:
            if synced_count > 0:
                msg = f"Successfully synced {synced_count} resources."
                from app.models.system.system_notification import SystemNotification
                notification = SystemNotification(
                    title="Control Sync Completed",
                    message=msg,
                    type="SUCCESS",
                    module="CONTROL"
                )
                db.add(notification)
                await db.commit()
                return msg
                
            return "Sync completed (no resources to sync)."
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[Backend Sync] Fatal error during sync: {e}")
        return f"Fatal error: {e}"
"""

import re
old_func_start_idx = text.find("async def _background_control_sync(account_name: Optional[str]) -> str:")
end_idx = text.find("@router.post(\"/sync\")")
if old_func_start_idx != -1 and end_idx != -1:
    text = text[:old_func_start_idx] + new_func_start + "\n" + text[end_idx:]
    with open('app/api/control.py', 'w', encoding='utf-8') as f:
        f.write(text)
        print("Updated control.py successfully!")
else:
    print("Could not find function bounds!")
