from typing import List, Dict, Any
from datetime import datetime, timezone
import logging
from botocore.exceptions import ClientError
from app.services.base_handler import BaseDirectPowerHandler
from app.models.control.control_resource import ServiceType, ControlType

logger = logging.getLogger(__name__)

def normalize_workspaces_status(state_name: str) -> str:
    state_name = (state_name or "").lower()
    if state_name == "available":
        return "RUNNING"
    elif state_name in ["stopped", "suspended"]:
        return "STOPPED"
    elif state_name:
        return state_name.upper()
    return "UNKNOWN"

class WorkSpacesHandler(BaseDirectPowerHandler):
    """
    AWS WorkSpaces Plugin Handler.
    Implements Discovery and Direct Power control for Amazon WorkSpaces.
    """

    def _execute_get_state(self, session, native_id: str, **kwargs) -> str:
        client = session.client('workspaces')
        res = client.describe_workspaces(WorkspaceIds=[native_id])
        workspaces = res.get('Workspaces', [])
        if workspaces:
            return normalize_workspaces_status(workspaces[0].get('State', 'unknown'))
        return "UNKNOWN"

    def _execute_start(self, session, native_id: str, **kwargs):
        client = session.client('workspaces')
        client.start_workspaces(StartWorkspaceRequests=[{'WorkspaceId': native_id}])

    def _execute_stop(self, session, native_id: str, **kwargs):
        client = session.client('workspaces')
        client.stop_workspaces(StopWorkspaceRequests=[{'WorkspaceId': native_id}])

    async def async_scan_region(self, session_manager, credentials: dict, region: str) -> List[Dict[str, Any]]:
        resources = []
        try:
            session = session_manager.create_async_session(credentials, region)
            async with session.client('workspaces', region_name=region) as client:
                paginator = client.get_paginator('describe_workspaces')
                async for page in paginator.paginate():
                    for ws in page.get('Workspaces', []):
                        ws_name = ws.get('UserName', ws['WorkspaceId'])
                        props = ws.get('WorkspaceProperties', {})
                        compute_type = props.get('ComputeTypeName', 'unknown')

                        resources.append({
                            'resource_id': ws['WorkspaceId'],
                            'resource_name': f"WorkSpace-{ws_name}",
                            'cloud_provider': 'aws',
                            'region': region,
                            'service_type': ServiceType.WORKSPACES.value,
                            'control_type': ControlType.DIRECT_POWER.value,
                            'status': normalize_workspaces_status(ws.get('State', 'unknown')),
                            'instance_spec': compute_type,
                            'tags': {},
                            'last_synced_at': datetime.now(timezone.utc)
                        })

        except ClientError as e:
            from app.services.base_handler import parse_aws_client_error
            self.log_once("WorkSpacesHandler", parse_aws_client_error(e))
        except Exception as e:
            from app.services.base_handler import parse_aws_client_error
            self.log_once("WorkSpacesHandler", parse_aws_client_error(e))

        return resources
