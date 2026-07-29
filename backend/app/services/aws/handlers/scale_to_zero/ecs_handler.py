from typing import List, Dict, Any, Tuple, Optional
from datetime import datetime, timezone
import logging
import json
from botocore.exceptions import ClientError
from app.services.base_handler import BaseScaleToZeroHandler
from app.models.control.control_resource import ServiceType, ControlType
from .discovery.ecs_discovery import discover_asg_and_cp_status

logger = logging.getLogger(__name__)

class ECSScaleToZeroHandler(BaseScaleToZeroHandler):
    """
    Amazon ECS Plugin Handler.
    Supports Fargate (Serverless) and EC2-backed clusters.
    Implements Scale-to-Zero for ECS services and underlying unmanaged ASG capacity.
    """

    def scan_region(self, session_manager, credentials: dict, region: str) -> List[Dict[str, Any]]:
        session = session_manager.create_session(credentials, region)
        ecs = session.client('ecs', region_name=region)
        resources = []
        cluster_asg_cache = {}

        try:
            cluster_paginator = ecs.get_paginator('list_clusters')
            for cluster_page in cluster_paginator.paginate():
                for cluster_arn in cluster_page.get('clusterArns', []):
                    cluster_name = cluster_arn.split('/')[-1]
                    
                    if cluster_name not in cluster_asg_cache:
                        try:
                            _, asg_name = discover_asg_and_cp_status(session, cluster_name)
                            cluster_asg_cache[cluster_name] = asg_name
                        except Exception:
                            cluster_asg_cache[cluster_name] = None
                            
                    service_paginator = ecs.get_paginator('list_services')
                    for service_page in service_paginator.paginate(cluster=cluster_arn):
                        service_arns = service_page.get('serviceArns', [])
                        
                        if not service_arns:
                            continue
                            
                        # Describe services in batches of 10 (AWS API Limit)
                        for i in range(0, len(service_arns), 10):
                            batch = service_arns[i:i+10]
                            res = ecs.describe_services(cluster=cluster_arn, services=batch, include=['TAGS'])
                            for svc in res.get('services', []):
                                # Skip DAEMON services as they cannot be scaled
                                if svc.get('schedulingStrategy') == 'DAEMON':
                                    continue
                                    
                                svc_arn = svc.get('serviceArn')
                                svc_name = svc.get('serviceName')
                                desired = svc.get('desiredCount', 0)
                                status = 'RUNNING' if desired > 0 else 'STOPPED'
                                
                                is_fargate = False
                                if svc.get('launchType') == 'FARGATE':
                                    is_fargate = True
                                else:
                                    for cp in svc.get('capacityProviderStrategy', []):
                                        if cp.get('capacityProvider', '').startswith('FARGATE'):
                                            is_fargate = True
                                            break
                                            
                                asg_name = cluster_asg_cache.get(cluster_name)
                                if is_fargate:
                                    spec_type = "FARGATE"
                                elif asg_name:
                                    spec_type = f"ASG: {asg_name}"
                                else:
                                    spec_type = "EC2"
                                
                                # Extract tags if present
                                tags_list = svc.get('tags', [])
                                tags_dict = {t.get('key'): t.get('value') for t in tags_list}
                                
                                resources.append({
                                    'resource_id': svc_arn,
                                    'resource_name': svc_name,
                                    'cloud_provider': 'aws',
                                    'region': region,
                                    'service_type': ServiceType.ECS.value,
                                    'control_type': ControlType.SCALE_TO_ZERO.value,
                                    'status': status,
                                    'instance_spec': f"{spec_type} | Tasks: {desired}",
                                    'tags': tags_dict,
                                    'parent_resource_id': cluster_name,
                                    'last_synced_at': datetime.now(timezone.utc)
                                })
        except ClientError as e:
            from app.services.base_handler import parse_aws_client_error
            self.log_once("ECSHandler", parse_aws_client_error(e))
        except Exception as e:
            from app.services.base_handler import parse_aws_client_error
            self.log_once("ECSHandler", parse_aws_client_error(e))

        return resources



    def _execute_get_state(self, session, native_id: str, **kwargs) -> str:
        # native_id is the service ARN: arn:aws:ecs:region:account:service/cluster-name/service-name
        cluster_name = native_id.split('/')[-2]
        service_name = native_id.split('/')[-1]
        
        ecs = session.client('ecs')
        res = ecs.describe_services(cluster=cluster_name, services=[service_name])
        services = res.get('services', [])
        
        if services:
            desired = services[0].get('desiredCount', 0)
            return 'RUNNING' if desired > 0 else 'STOPPED'
        return "UNKNOWN"

    def _execute_stop(self, session, native_id: str, **kwargs):
        ecs = session.client('ecs')
        autoscaling = session.client('autoscaling')
        
        cluster_name = native_id.split('/')[-2]
        service_name = native_id.split('/')[-1]
        
        # 1. Get current ECS state
        res = ecs.describe_services(cluster=cluster_name, services=[service_name])
        services = res.get('services', [])
        if not services:
            raise Exception(f"ECS Service {service_name} not found in cluster {cluster_name}.")
            
        prev_ecs_desired = services[0].get('desiredCount', 0)
        
        # Zero-Lock Prevention
        if prev_ecs_desired == 0:
            prev_ecs_desired = 1
            
        # 2. Update ECS Service to 0
        ecs.update_service(cluster=cluster_name, service=service_name, desiredCount=0)
        
        # 3. Handle unmanaged ASG capacity (only if EC2 backed)
        has_managed_cp = False
        asg_name = None
        
        is_fargate = False
        if services[0].get('launchType') == 'FARGATE':
            is_fargate = True
        else:
            for cp in services[0].get('capacityProviderStrategy', []):
                if cp.get('capacityProvider', '').startswith('FARGATE'):
                    is_fargate = True
                    break
                    
        if not is_fargate:
            has_managed_cp, asg_name = discover_asg_and_cp_status(session, cluster_name)
        
        prev_asg_min = None
        prev_asg_desired = None
        
        if asg_name:
            asg_res = autoscaling.describe_auto_scaling_groups(AutoScalingGroupNames=[asg_name])
            groups = asg_res.get('AutoScalingGroups', [])
            if groups:
                prev_asg_min = groups[0].get('MinSize', 0)
                prev_asg_desired = groups[0].get('DesiredCapacity', 0)
                
                # Scale ASG down
                autoscaling.update_auto_scaling_group(
                    AutoScalingGroupName=asg_name,
                    MinSize=0,
                    DesiredCapacity=0
                )
                
        # 4. Serialize config
        config = {
            "cluster_name": cluster_name,
            "service_name": service_name,
            "has_managed_cp": has_managed_cp,
            "asg_name": asg_name,
            "prev_ecs_desired": prev_ecs_desired,
            "prev_asg_min": prev_asg_min,
            "prev_asg_desired": prev_asg_desired
        }
        
        return json.dumps(config)

    def _execute_start(self, session, native_id: str, saved_config: str, **kwargs):
        ecs = session.client('ecs')
        autoscaling = session.client('autoscaling')
        
        cluster_name = native_id.split('/')[-2]
        service_name = native_id.split('/')[-1]
        
        # Default fallback config
        config = {
            "cluster_name": cluster_name,
            "service_name": service_name,
            "has_managed_cp": False,
            "asg_name": None,
            "prev_ecs_desired": 1,
            "prev_asg_min": None,
            "prev_asg_desired": None
        }
        
        if saved_config:
            try:
                parsed_config = json.loads(saved_config)
                config.update(parsed_config)
            except Exception as e:
                logger.warning(f"Failed to parse saved config for ECS start, using fallbacks. Error: {e}")
                
        prev_ecs_desired = config.get('prev_ecs_desired', 1)
        
        # 1. Restore ASG first (if applicable)
        if config.get('asg_name'):
            asg_name = config.get('asg_name')
            prev_asg_min = config.get('prev_asg_min')
            prev_asg_desired = config.get('prev_asg_desired')
            
            if prev_asg_min is not None and prev_asg_desired is not None:
                try:
                    # We issue the ASG scale-up without blocking
                    # ECS will natively place tasks when instances join the cluster
                    autoscaling.update_auto_scaling_group(
                        AutoScalingGroupName=asg_name,
                        MinSize=prev_asg_min,
                        DesiredCapacity=prev_asg_desired
                    )
                except Exception as e:
                    logger.warning(f"Failed to restore ASG {asg_name} for ECS cluster {cluster_name}: {e}")
                    
        # 2. Restore ECS Service
        ecs.update_service(cluster=cluster_name, service=service_name, desiredCount=prev_ecs_desired)
