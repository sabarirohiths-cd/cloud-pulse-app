from typing import List, Dict, Any
from datetime import datetime, timezone
import logging
import json
from botocore.exceptions import ClientError
from app.services.base_handler import BaseScaleToZeroHandler
from app.models.control.control_resource import ServiceType, ControlType
from app.services.aws.discovery.asg_discovery import find_parent_instance_from_asg

logger = logging.getLogger(__name__)

class ASGHandler(BaseScaleToZeroHandler):
    """
    AWS Auto Scaling Group (ASG) Plugin Handler.
    Implements Discovery and Scale-to-Zero lifecycle control.
    """

    def _execute_get_state(self, session, native_id: str, **kwargs) -> str:
        client = session.client('autoscaling')
        res = client.describe_auto_scaling_groups(AutoScalingGroupNames=[native_id])
        groups = res.get('AutoScalingGroups', [])
        if groups:
            group = groups[0]
            desired = group.get('DesiredCapacity', 0)
            instances = group.get('Instances', [])
            
            active_instances = [i for i in instances if i.get('LifecycleState') in ['InService', 'Pending', 'Pending:Wait', 'Pending:Proceed']]
            
            if desired > 0:
                # Wait for ASG to actually attach the instances before declaring it RUNNING
                if len(active_instances) > 0:
                    return 'RUNNING'
                else:
                    return 'STARTING'
            else:
                # Wait for ASG to actually terminate the active instances before declaring it STOPPED
                if len(active_instances) == 0:
                    return 'STOPPED'
                else:
                    return 'STOPPING'
        return "UNKNOWN"

    def _execute_start(self, session, native_id: str, saved_config: str, **kwargs):
        client = session.client('autoscaling')
        
        # Default back to 1 if no config was saved
        config = {"min": 1, "desired": 1}
        if saved_config:
            try:
                config = json.loads(saved_config)
            except:
                pass
                
        prev_min = config.get('min', 1)
        prev_desired = config.get('desired', 1)
        
        # Ensure we don't accidentally exceed max size, or fail due to max size constraint
        res = client.describe_auto_scaling_groups(AutoScalingGroupNames=[native_id])
        groups = res.get('AutoScalingGroups', [])
        if not groups:
            raise Exception(f"ASG {native_id} not found.")
            
        asg = groups[0]
        max_size = asg.get('MaxSize', 1)
        
        # MaxSize must be at least the new desired capacity
        new_max = max(max_size, prev_desired)
        
        client.update_auto_scaling_group(
            AutoScalingGroupName=native_id,
            MinSize=prev_min,
            DesiredCapacity=prev_desired,
            MaxSize=new_max
        )

    def _execute_stop(self, session, native_id: str, **kwargs) -> str:
        client = session.client('autoscaling')
        
        res = client.describe_auto_scaling_groups(AutoScalingGroupNames=[native_id])
        groups = res.get('AutoScalingGroups', [])
        if not groups:
            raise Exception(f"ASG {native_id} not found.")
            
        asg = groups[0]
        current_min = asg.get('MinSize', 0)
        current_desired = asg.get('DesiredCapacity', 0)
        
        # Safety Check: If it's already 0, don't save 0! Fall back to 1 so we can start it later.
        if current_desired == 0:
            saved_config = json.dumps({"min": 1, "desired": 1})
        else:
            saved_config = json.dumps({
                "min": current_min,
                "desired": current_desired
            })
            
        client.update_auto_scaling_group(
            AutoScalingGroupName=native_id,
            MinSize=0,
            DesiredCapacity=0
        )
        
        return saved_config

    def _execute_scan_region(self, session, region: str) -> List[Dict[str, Any]]:
        from app.services.aws.discovery.ecs_discovery import discover_asg_and_cp_status
        from app.services.aws.discovery.asg_discovery import find_parent_instance_from_asg, get_ecs_cluster_from_launch_template
        from app.services.aws.discovery.eks_discovery import map_all_eks_unmanaged_asgs
        
        resources = []
        cp_asgs = {}
        asg_to_cluster = {}
        
        client = session.client('autoscaling', region_name=region)
        ecs_client = session.client('ecs', region_name=region)

        try:
            cluster_paginator = ecs_client.get_paginator('list_clusters')
            for cluster_page in cluster_paginator.paginate():
                for cluster_arn in cluster_page.get('clusterArns', []):
                    cl_name = cluster_arn.split('/')[-1]
                    try:
                        _, managed_asgs, unmanaged_asgs = discover_asg_and_cp_status(session, cl_name)
                        mapped_asg_names = managed_asgs + unmanaged_asgs
                        for asg_name in mapped_asg_names:
                            asg_to_cluster[asg_name] = cl_name
                    except Exception:
                        pass
                        
            cp_res = ecs_client.describe_capacity_providers()
            for cp in cp_res.get('capacityProviders', []):
                asg_arn = cp.get('autoScalingGroupProvider', {}).get('autoScalingGroupArn')
                status = cp.get('autoScalingGroupProvider', {}).get('managedScaling', {}).get('status', 'DISABLED')
                if asg_arn:
                    asg_name_cp = asg_arn.split('autoScalingGroupName/')[-1]
                    cp_asgs[asg_name_cp] = status
        except Exception as e:
            logger.warning(f"Error mapping capacity providers in ASG sync scan: {e}")

        # Map EKS ASGs
        eks_asg_map = map_all_eks_unmanaged_asgs(session, region)

        paginator = client.get_paginator('describe_auto_scaling_groups')
        for page in paginator.paginate():
            for asg in page['AutoScalingGroups']:
                asg_name = asg['AutoScalingGroupName']
                
                tags_list = asg.get('Tags', [])
                tags_dict = {t.get('Key'): t.get('Value') for t in tags_list}

                desired = asg.get('DesiredCapacity', 0)
                status = 'RUNNING' if desired > 0 else 'STOPPED'
                
                parent_id = asg_to_cluster.get(asg_name)
                if not parent_id:
                    # 1. Try Deep Inspection of User Data (Highly reliable for 0-capacity ECS unmanaged ASGs)
                    parent_id = get_ecs_cluster_from_launch_template(asg_name, session)
                    
                if not parent_id:
                    # 2. Try Snapshot mapping (Fallback for standard EC2 AutoScaling)
                    parent_id = find_parent_instance_from_asg(asg_name, session)

                spec = f"Min:{asg.get('MinSize')} Max:{asg.get('MaxSize')}"
                if asg_name in eks_asg_map:
                    parent_id = eks_asg_map[asg_name]
                    spec = f"EKS (Unmanaged) | {spec}"
                elif asg_name in cp_asgs:
                    cp_status = cp_asgs[asg_name]
                    spec = f"ECS CP ({cp_status}) | {spec}"
                elif parent_id and asg_name in asg_to_cluster:
                    spec = f"ECS (Unmanaged) | {spec}"
                elif any('ecs' in t.get('Key').lower() or 'ecs' in t.get('Value', '').lower() for t in tags_list):
                    spec = f"ECS (Unmanaged) | {spec}"
                    
                resources.append({
                    'resource_id': asg_name,
                    'resource_name': asg_name,
                    'cloud_provider': 'aws',
                    'region': region,
                    'service_type': ServiceType.ASG.value,
                    'control_type': ControlType.SCALE_TO_ZERO.value,
                    'status': status,
                    'instance_spec': spec,
                    'tags': tags_dict,
                    'parent_resource_id': parent_id,
                    'last_synced_at': datetime.now(timezone.utc)
                })

        return resources
