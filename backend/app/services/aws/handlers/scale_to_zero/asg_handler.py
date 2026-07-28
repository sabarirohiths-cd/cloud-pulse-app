from typing import List, Dict, Any
from datetime import datetime, timezone
import logging
import json
from botocore.exceptions import ClientError
from app.services.base_handler import BaseScaleToZeroHandler
from app.models.control.control_resource import ServiceType, ControlType
from app.services.aws.handlers.scale_to_zero.discovery.asg_discovery import find_parent_instance_from_asg

logger = logging.getLogger(__name__)

class ASGHandler(BaseScaleToZeroHandler):
    """
    AWS Auto Scaling Group (ASG) Plugin Handler.
    Implements Discovery and Scale-to-Zero lifecycle control.
    """

    def scan_region(self, session_manager, credentials: dict, region: str) -> List[Dict[str, Any]]:
        session = session_manager.create_session(credentials, region)
        client = session.client('autoscaling', region_name=region)
        resources = []

        try:
            paginator = client.get_paginator('describe_auto_scaling_groups')
            for page in paginator.paginate():
                for asg in page['AutoScalingGroups']:
                    asg_name = asg['AutoScalingGroupName']
                    
                    tags_list = asg.get('Tags', [])
                    tags_dict = {t.get('Key'): t.get('Value') for t in tags_list}

                    # Determine status
                    desired = asg.get('DesiredCapacity', 0)
                    status = 'RUNNING' if desired > 0 else 'STOPPED'
                    
                    # Auto-discover parent EC2 instance
                    parent_id = find_parent_instance_from_asg(asg_name, session)
                    
                    resources.append({
                        'resource_id': asg_name,
                        'resource_name': asg_name,
                        'cloud_provider': 'aws',
                        'region': region,
                        'service_type': ServiceType.ASG.value,
                        'control_type': ControlType.SCALE_TO_ZERO.value,
                        'status': status,
                        'instance_spec': f"Min:{asg.get('MinSize')} Max:{asg.get('MaxSize')}",
                        'tags': tags_dict,
                        'parent_resource_id': parent_id,
                        'last_synced_at': datetime.now(timezone.utc)
                    })

        except ClientError as e:
            from app.services.base_handler import parse_aws_client_error
            self.log_once("ASGHandler", parse_aws_client_error(e))
        except Exception as e:
            from app.services.base_handler import parse_aws_client_error
            self.log_once("ASGHandler", parse_aws_client_error(e))

        return resources

    def _execute_get_state(self, session, native_id: str, **kwargs) -> str:
        client = session.client('autoscaling')
        res = client.describe_auto_scaling_groups(AutoScalingGroupNames=[native_id])
        groups = res.get('AutoScalingGroups', [])
        if groups:
            desired = groups[0].get('DesiredCapacity', 0)
            return 'RUNNING' if desired > 0 else 'STOPPED'
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
