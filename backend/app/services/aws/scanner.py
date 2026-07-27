import asyncio
from datetime import datetime
import logging
from typing import List, Dict, Any, Optional

from app.services.aws.session import AWSSessionManager
from app.services.aws.handlers import REGISTERED_HANDLERS

logger = logging.getLogger(__name__)

class AWSParallelScanner:
    """
    High-performance multi-threaded scanner for AWS infrastructure.
    Uses dynamic Strategy Pattern plugins (Handlers) to scan all registered services across active regions concurrently.
    """
    def __init__(self, session_manager: Optional[AWSSessionManager] = None):
        self.session_manager = session_manager or AWSSessionManager()
        self.handlers = REGISTERED_HANDLERS

    def get_active_regions(self, credentials: dict, default_region: str = "us-east-1") -> List[str]:
        try:
            session = self.session_manager.create_session(credentials, default_region)
            ec2_client = session.client('ec2', region_name=default_region)
            res = ec2_client.describe_regions()
            regions = [r['RegionName'] for r in res.get('Regions', []) if r.get('OptInStatus') in ('opt-in-not-required', 'opted-in', None)]
            return regions if regions else [default_region]
        except Exception as e:
            logger.warning(f"[AWS Scanner] Failed to describe regions, falling back to default region '{default_region}': {e}")
            return [default_region]

    async def scan_all_resources_parallel(self, credentials: dict, default_region: str = "us-east-1") -> List[Dict[str, Any]]:
        active_regions = await asyncio.to_thread(self.get_active_regions, credentials, default_region)
        logger.info(f"[AWS Scanner] Scanning {len(active_regions)} regions natively via asyncio...")
        
        all_resources: List[Dict[str, Any]] = []
        
        tasks = []
        for region in active_regions:
            for handler in self.handlers:
                tasks.append(asyncio.to_thread(handler.scan_region, self.session_manager, credentials, region))
                
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for res in results:
            if isinstance(res, Exception):
                logger.error(f"[AWS Scanner] Worker thread raised unhandled exception: {res}")
            else:
                all_resources.extend(res)
                    
        logger.info(f"[AWS Scanner] Parallel scan complete. Discovered {len(all_resources)} total resources.")
        return all_resources

async def scan_all_resources_parallel(credentials: dict, default_region: str = "us-east-1") -> List[Dict[str, Any]]:
    scanner = AWSParallelScanner()
    return await scanner.scan_all_resources_parallel(credentials, default_region)


import concurrent.futures
from datetime import datetime, timedelta, timezone
import json

class ResourceExplorerScanner:
    # Pricing API logic removed as per user request
    def get_aggregator_region(self, session, default_region='us-east-1') -> str:
        try:
            print(f"Discovering Resource Explorer AGGREGATOR region using baseline {default_region}...")
            re_client = session.client('resource-explorer-2', region_name=default_region)
            
            response = re_client.list_indexes(Type='AGGREGATOR')
            idx_list = response.get('Indexes', [])
            
            if not idx_list:
                raise ValueError("No AGGREGATOR index profile returned by the client. Ensure AWS Resource Explorer is enabled and aggregated.")
                
            agg_region = idx_list[0].get('Region')
            if not agg_region:
                raise ValueError("AGGREGATOR index found but missing 'Region' property.")
                
            return agg_region
        except Exception as e:
            print(f"WARNING: Failed to auto-discover AWS Resource Explorer aggregator region: {e}")
            raise

    def scan(self, session, region: str = None) -> list[dict]:
        try:
            baseline_region = region if region else 'us-east-1'
            agg_region = self.get_aggregator_region(session, baseline_region)

            print(f"Attempting AWS Resource Explorer list_resources in aggregator region {agg_region}...")
            client = session.client('resource-explorer-2', region_name=agg_region)
            
            # Fetch a ViewArn to use for list_resources
            views_resp = client.list_views()
            views = views_resp.get('Views', [])
            if not views:
                raise ValueError("No views found for AWS Resource Explorer in this region.")
            view_arn = views[0]
            
            raw_resources = []
            paginator = client.get_paginator('list_resources')
            for page in paginator.paginate(ViewArn=view_arn):
                for res in page.get("Resources", []):
                    raw_resources.append(res)
                    
            resources = []
            for res in raw_resources:
                arn = res.get("Arn")
                res_type = res.get("ResourceType")
                res_region = res.get("Region")
                
                # Static local billing evaluation
                NON_BILLABLE_AWS_TYPES = {
                    "aws::ec2::securitygroup", "aws::ec2::vpc", "aws::ec2::subnet", "aws::ec2::routetable", "aws::ec2::internetgateway", "aws::iam::role", "aws::iam::policy",
                    "ec2:vpc", "ec2:subnet", "ec2:security-group", "ec2:route-table", "ec2:network-acl", "ec2:internet-gateway", "ec2:dhcp-options", "ec2:key-pair", "iam:policy", "iam:role"
                }
                is_billable = res_type.lower() not in NON_BILLABLE_AWS_TYPES
                billing_tier = 'Standard' if is_billable else 'Free/Config'
                billable = is_billable
                
                name = None
                tags_dict = {}
                for prop in res.get('Properties', []):
                    if prop.get('Name') == 'tags':
                        try:
                            # Search API has Data as list of dicts, let's parse safely
                            data = prop.get('Data')
                            if isinstance(data, list):
                                for tag in data:
                                    if isinstance(tag, dict):
                                        k = tag.get('Key')
                                        v = tag.get('Value')
                                        if k and v:
                                            tags_dict[k] = v
                                            if k.lower() == 'name':
                                                name = v
                            elif isinstance(data, str):
                                # Sometimes Properties data is stringified JSON depending on API
                                try:
                                    parsed_data = json.loads(data)
                                    if isinstance(parsed_data, list):
                                        for tag in parsed_data:
                                            if isinstance(tag, dict):
                                                k = tag.get('Key')
                                                v = tag.get('Value')
                                                if k and v:
                                                    tags_dict[k] = v
                                                    if k.lower() == 'name':
                                                        name = v
                                except Exception:
                                    pass
                        except Exception:
                            pass
                            
                if not name:
                    name = arn.split('/')[-1] if '/' in arn else arn.split(':')[-1]
                
                linked_account = None
                try:
                    parts = arn.split(':')
                    if len(parts) >= 5 and parts[4]:
                        linked_account = parts[4]
                except Exception:
                    pass
                
                first_seen_date = (datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=5, minutes=30)).strftime("%Y-%m-%d %H:%M:%S IST")
                        
                resources.append({
                    "native_id": arn,
                    "name": name,
                    "tags": json.dumps(tags_dict),
                    "type": res_type,
                    "region": res_region,
                    "linked_account": linked_account,
                    "billable": billable,
                    "is_billable": is_billable,
                    "billing_tier": billing_tier,
                    "first_seen_date": first_seen_date
                })
                    
            if not resources:
                raise Exception("Resource Explorer search returned 0 resources")
            
            print(f"Resource Explorer found {len(resources)} resources.")
            return resources
                
        except Exception as e:
            print(f"AWS Resource Explorer Sync Failed: {e}")
            raise Exception(f"AWS Resource Explorer Sync Failed: {str(e)}")

