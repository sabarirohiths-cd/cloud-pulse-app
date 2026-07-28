import asyncio
import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from app.core.database import SessionLocal
from app.models import ControlResource, ConfigCloudAccount, ControlActionLog
from app.core.security import decrypt_credentials
from app.services.control_service import control_service
from app.services.notifier import notifier_service

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def is_time_between(start_str: str, stop_str: str, current_time: datetime) -> bool:
    try:
        start_time = datetime.strptime(start_str, "%H:%M").time()
        stop_time = datetime.strptime(stop_str, "%H:%M").time()
        current = current_time.time()

        if start_time < stop_time:
            return start_time <= current < stop_time
        else: # Over midnight
            return current >= start_time or current < stop_time
    except Exception as e:
        logger.error(f"Error parsing time boundaries: {e}")
        return True # Default to running on error

async def evaluate_resource(session, sched: ControlResource):
    try:
        tz = ZoneInfo(sched.timezone or "UTC")
        now = datetime.now(tz)
        
        # 1. Override check
        if sched.override_state in ['EXTENDED', 'SKIPPED'] and sched.override_until:
            if now.replace(tzinfo=None) < sched.override_until:
                logger.info(f"[{sched.resource_id}] Override active ({sched.override_state}) until {sched.override_until}. Skipping evaluation.")
                return
            else:
                logger.info(f"[{sched.resource_id}] Override expired. Reverting to normal state.")
                sched.override_state = 'NORMAL'
                sched.override_until = None
                await session.commit()

        # 2. Target State evaluation
        should_be_running = is_time_between(sched.start_time, sched.stop_time, now)
        
        # 2.5 Schedule Pattern evaluation
        if sched.schedule_pattern == 'mon_fri':
            # 0=Monday, 6=Sunday
            if now.weekday() >= 5:
                should_be_running = False
                
        target_action = 'START' if should_be_running else 'STOP'

        # 3. Pre-warning notification logic (1 hour before shutdown)
        if should_be_running:
            stop_time_parsed = datetime.strptime(sched.stop_time, "%H:%M").time()
            stop_dt = datetime.combine(now.date(), stop_time_parsed).replace(tzinfo=tz)
            
            # If over midnight and current time is before midnight but stop time is after
            if stop_time_parsed < now.time():
                stop_dt += timedelta(days=1)
                
            time_until_stop = (stop_dt - now).total_seconds()
            
            # If within 60-65 mins of stopping, send warning
            if 3600 <= time_until_stop <= 3900:
                logger.info(f"[{sched.resource_id}] Sending pre-shutdown warning.")
                urls = await notifier_service.send_pre_shutdown_warning(
                    sched.resource_id, sched.service_type, sched.account_name, sched.stop_time
                )
                logger.info(f"[{sched.resource_id}] Pre-warning sent. Extend URL: {urls['extend_url']}")
        
        # 4. Fetch Cloud Config
        stmt = select(ConfigCloudAccount).where(ConfigCloudAccount.account_name == sched.account_name)
        res = await session.execute(stmt)
        config = res.scalars().first()
        if not config:
            logger.warning(f"[{sched.resource_id}] ConfigCloudAccount for {sched.account_name} not found.")
            return

        creds = decrypt_credentials(config.encrypted_credentials)
        
        # 5. Fetch actual live state
        live_state = await control_service.get_resource_state(config.provider, creds, sched.region, sched.service_type, sched.resource_id)
        
        # 6. Execute action if out of sync
        # Simplification: EC2 uses 'running', 'stopped'
        live_state_lower = live_state.lower() if live_state else ""
        is_live_running = live_state_lower in ['running', 'available']
        is_live_stopped = live_state_lower in ['stopped', 'paused']
        
        if target_action == 'START' and is_live_stopped:
            logger.info(f"[{sched.resource_id}] Target: START, Live: {live_state}. Executing START.")
            import json
            await control_service.start_resource(config.provider, creds, sched.region, sched.service_type, sched.resource_id)
            sched.last_action_executed = datetime.utcnow()
            sched.status = 'STARTING'
            config_data = json.loads(sched.saved_config_json) if sched.saved_config_json else {}
            config_data['last_action'] = "SCHEDULED_START"
            sched.saved_config_json = json.dumps(config_data)
            await session.commit()
            
        elif target_action == 'STOP' and is_live_running:
            logger.info(f"[{sched.resource_id}] Target: STOP, Live: {live_state}. Executing STOP.")
            import json
            await control_service.stop_resource(config.provider, creds, sched.region, sched.service_type, sched.resource_id)
            sched.last_action_executed = datetime.utcnow()
            sched.status = 'STOPPING'
            config_data = json.loads(sched.saved_config_json) if sched.saved_config_json else {}
            config_data['last_action'] = "SCHEDULED_STOP"
            sched.saved_config_json = json.dumps(config_data)
            await session.commit()
            
        # 7. Keep DB status perfectly in sync and detect completions
        normalized_live = live_state.upper() if live_state else "UNKNOWN"
        if sched.status != normalized_live:
            # Prevent bouncing backwards due to AWS eventual consistency
            if sched.status == "STOPPING" and normalized_live in ["RUNNING", "AVAILABLE"]:
                pass # Wait for it to actually stop
            elif sched.status == "STARTING" and normalized_live in ["STOPPED", "PAUSED"]:
                pass # Wait for it to actually start
            else:
                old_status = sched.status
                sched.status = normalized_live
                
                import json
                config_data = json.loads(sched.saved_config_json) if sched.saved_config_json else {}
                
                if old_status in ["STARTING", "PENDING"] and is_live_running:
                    action_type = config_data.get('last_action', 'POWER_ON')
                    log_entry = ControlActionLog(
                        native_id=sched.resource_id,
                        resource_name=sched.resource_name,
                        account_name=sched.account_name,
                        provider=sched.cloud_provider,
                        action_type=action_type,
                        status="SUCCESS",
                        details="Resource started successfully."
                    )
                    session.add(log_entry)
                elif old_status in ["STOPPING", "SHUTTING-DOWN"] and is_live_stopped:
                    action_type = config_data.get('last_action', 'POWER_OFF')
                    log_entry = ControlActionLog(
                        native_id=sched.resource_id,
                        resource_name=sched.resource_name,
                        account_name=sched.account_name,
                        provider=sched.cloud_provider,
                        action_type=action_type,
                        status="SUCCESS",
                        details="Resource stopped successfully."
                    )
                    session.add(log_entry)
                    
                await session.commit()

    except Exception as e:
        logger.error(f"Error evaluating resource {sched.resource_id}: {e}")


async def run_control_scheduler():
    """
    Background loop for power scheduling:
    1. Pre-warning check (1h before shutdown): Triggers notification email
    2. Shutdown check: Stops resources if no active override
    3. Startup check: Powers up scheduled resources
    """
    logger.info("Control Module Automation Scheduler started...")
    while True:
        try:
            async with SessionLocal() as session:
                stmt = select(ControlResource).where(ControlResource.is_automation_enabled == True)
                res = await session.execute(stmt)
                schedules = res.scalars().all()
                
                for sched in schedules:
                    await evaluate_resource(session, sched)
                    
        except Exception as e:
            logger.error(f"Error in control scheduler loop: {e}")
            
        # Sleep until the exact start of the next minute for zero-delay triggering
        now = datetime.now()
        sleep_seconds = 60 - now.second - (now.microsecond / 1000000.0)
        await asyncio.sleep(max(1, sleep_seconds + 0.1))



import asyncio
import logging
from datetime import datetime
try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo

from sqlalchemy.future import select
from sqlalchemy import update
from app.core.database import SessionLocal
from app.models import ConfigCloudAccount
from app.core.security import decrypt_credentials
from app.services.aws.service import AWSService
from app.services.azure.service import AzureService
from app.services.gcp.service import GCPService
from app.services.inventory_service import sync_inventory
active_syncs = set()

async def run_sync_task(c_id: int):
    try:
        # We create a new DB session for the background task to avoid sharing sessions
        async with SessionLocal() as db:
            c = await db.get(ConfigCloudAccount, c_id)
            if not c:
                return
                
            print(f">>> Auto-sync initiated for account '{c.account_name}' (Provider: {c.provider}).")
            logger.info(f"Auto-sync initiated for account '{c.account_name}' (Provider: {c.provider}).")
            
            try:
                creds = decrypt_credentials(c.encrypted_credentials)
                
                if c.provider == "aws":
                    aws_service = AWSService()
                    fetched_resources = await aws_service.fetch_all_resources(creds, c.default_region)
                    await sync_inventory(db, c.provider, c.account_name, fetched_resources)
                    
                elif c.provider == "azure":
                    azure_service = AzureService()
                    sub_id = creds.get('subscription_id')
                    fetched_resources = await azure_service.fetch_all_resources(creds, sub_id)
                    await sync_inventory(db, c.provider, c.account_name, fetched_resources)
                    
                elif c.provider == "gcp":
                    gcp_service = GCPService()
                    fetched_resources = await gcp_service.fetch_all_resources(creds)
                    await sync_inventory(db, c.provider, c.account_name, fetched_resources)
                    
                else:
                    logger.warning(f"Auto-sync not yet supported for provider: {c.provider}")
                    return
                
                # Update last sync date on SUCCESS ONLY
                now_tz = datetime.now(ZoneInfo(c.auto_sync_timezone or "Asia/Kolkata"))
                current_date_str = now_tz.strftime("%Y-%m-%d")
                await db.execute(update(ConfigCloudAccount).where(ConfigCloudAccount.id == c_id).values(last_sync_date=current_date_str))
                await db.commit()
                
                print(f">>> Auto-sync completed successfully for account '{c.account_name}'.")
                logger.info(f"Auto-sync completed successfully for account '{c.account_name}'.")
            except Exception as e:
                print(f">>> ERROR: Auto-sync failed for account '{c.account_name}'. Error: {e}")
                logger.error(f"Auto-sync failed for account '{c.account_name}'. Error: {e}")
                print(f">>> Will retry auto-sync for '{c.account_name}' in 5 minutes...")
                # Sleep 5 minutes before releasing the lock to enforce the retry interval
                await asyncio.sleep(300)
    finally:
        if c_id in active_syncs:
            active_syncs.remove(c_id)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Suppress verbose HTTP logging from the Azure SDK
logging.getLogger("azure").setLevel(logging.WARNING)
logging.getLogger("azure.core.pipeline.policies.http_logging_policy").setLevel(logging.WARNING)

async def run_auto_sync():
    """
    Background loop that wakes up every minute exactly on the 0th second.
    It checks for configurations with auto_sync_enabled=True.
    If the current time in the configured timezone is >= auto_sync_time,
    and it hasn't successfully synced today (in that timezone), it attempts to sync.
    If it fails, it will lock the task for 5 minutes before retrying.
    """
    print(">>> Background auto-sync scheduler started (Waiting for enabled accounts...)")
    logger.info("Background auto-sync scheduler started (Waiting for enabled accounts...)")
    
    while True:
        try:
            async with SessionLocal() as db:
                stmt = select(ConfigCloudAccount).where(ConfigCloudAccount.auto_sync_enabled == True, ConfigCloudAccount.verified == True)
                result = await db.execute(stmt)
                configs = result.scalars().all()
                
                for c in configs:
                    try:
                        # Calculate current time in target timezone
                        tz = ZoneInfo(c.auto_sync_timezone or "Asia/Kolkata")
                        now_tz = datetime.now(tz)
                        current_time_str = now_tz.strftime("%H:%M")
                        current_date_str = now_tz.strftime("%Y-%m-%d")
                        
                        target_time = c.auto_sync_time or "10:00"
                        
                        # Check if time has passed and we haven't synced today
                        if current_time_str >= target_time and c.last_sync_date != current_date_str:
                            if c.id not in active_syncs:
                                active_syncs.add(c.id)
                                # Fire and forget the heavy sync task in the background
                                asyncio.create_task(run_sync_task(c.id))
                            
                    except Exception as e:
                        print(f">>> ERROR: Failed to schedule sync for account '{c.account_name}'. Error: {e}")
                        logger.error(f"Failed to schedule sync for account '{c.account_name}'. Error: {e}")
        except Exception as e:
            print(f">>> CRITICAL ERROR in auto-sync scheduler loop: {e}")
            logger.error(f"Error in auto-sync scheduler loop: {e}")
            
        # Sleep until the exact start of the next minute for zero-delay triggering
        now = datetime.now()
        sleep_seconds = 60 - now.second - (now.microsecond / 1000000.0)
        # Add a tiny buffer to ensure we cross into the next minute
        await asyncio.sleep(sleep_seconds + 0.05)

