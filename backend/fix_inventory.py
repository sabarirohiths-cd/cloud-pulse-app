import os
with open('app/api/inventory.py', 'r', encoding='utf-8') as f:
    text = f.read()

new_func_start = """async def _background_inventory_sync(provider: str, config_id: int):
    # First get the account name to set status
    account_name = "UNKNOWN"
    try:
        async with SessionLocal() as db:
            db_config = await db.get(ConfigCloudAccount, config_id)
            if not db_config:
                return
            account_name = db_config.account_name
            from app.core.security import decrypt_credentials
            creds = decrypt_credentials(db_config.encrypted_credentials)
            default_region = db_config.default_region
    except Exception as e:
        print(f"Background inventory sync failed to fetch config: {e}")
        return f"Failed: {str(e)}"
        
    set_sync_status("inventory", account_name, True)
    
    try:
        if provider == "aws":
            aws_service = AWSService()
            is_valid, msg = await aws_service.test_connection(creds)
            if not is_valid:
                raise Exception(f"AWS Authentication failed: {msg}")
            fetched_resources = await aws_service.fetch_all_resources(creds, default_region)
        elif provider == "azure":
            from app.services.azure.service import AzureService
            azure_service = AzureService()
            is_valid, msg = await azure_service.test_connection(creds)
            if not is_valid:
                raise Exception(f"Azure Authentication failed: {msg}")
            sub_id = creds.get('subscription_id')
            fetched_resources = await azure_service.fetch_all_resources(creds, sub_id)
        elif provider == "gcp":
            from app.services.gcp.service import GCPService
            gcp_service = GCPService()
            is_valid, msg = await gcp_service.test_connection(creds)
            if not is_valid:
                raise Exception(f"GCP Authentication failed: {msg}")
            fetched_resources = await gcp_service.fetch_all_resources(creds)
        else:
            raise Exception("Unsupported cloud provider")
        
        async with SessionLocal() as db:
            metrics = await sync_inventory(db, provider, account_name, fetched_resources)
            
            from app.models.system.system_notification import SystemNotification
            msg = f"Synced {metrics['total_active']} resources • {metrics['created']} new • {metrics['deleted']} deleted"
            notification = SystemNotification(
                title="Inventory Sync Completed",
                message=msg,
                type="SUCCESS",
                module="INVENTORY"
            )
            db.add(notification)
            await db.commit()
            return msg
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Background inventory sync failed: {e}")
        return f"Failed: {str(e)}"
"""

import re
old_func_start_idx = text.find("async def _background_inventory_sync(provider: str, config_id: int):")
end_idx = text.find("@router.post(\"/sync\")")
if old_func_start_idx != -1 and end_idx != -1:
    text = text[:old_func_start_idx] + new_func_start + "\n" + text[end_idx:]
    with open('app/api/inventory.py', 'w', encoding='utf-8') as f:
        f.write(text)
        print("Updated inventory.py successfully!")
else:
    print("Could not find function bounds!")
