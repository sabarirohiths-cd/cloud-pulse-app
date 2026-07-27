import asyncio
from typing import List, Dict, Any
from datetime import datetime, timezone
from botocore.exceptions import ClientError
from botocore.exceptions import ClientError
from app.services.base_handler import BaseDirectPowerHandler
from app.models.control.control_resource import ServiceType, ControlType

def normalize_rds_status(state_name: str) -> str:
    state_name = (state_name or "").lower()
    if state_name == "available":
        return "RUNNING"
    elif state_name == "stopped":
        return "STOPPED"
    elif state_name:
        return state_name.upper()
    return "UNKNOWN"

class RDSHandler(BaseDirectPowerHandler):
    """
    AWS RDS Plugin Handler.
    Implements Discovery and Direct Power control for Standalone RDS Instances and Aurora Clusters.
    """

    def scan_region(self, session_manager, credentials: dict, region: str) -> List[Dict[str, Any]]:
        session = session_manager.create_session(credentials, region)
        client = session.client('rds', region_name=region)
        resources = []

        try:
            # 1. Fetch Standalone RDS Instances
            instances_res = client.describe_db_instances()
            for inst in instances_res.get('DBInstances', []):
                # Skip instances that are part of a cluster (clusters are handled separately)
                if inst.get('DBClusterIdentifier'):
                    continue
                    
                resources.append({
                    'resource_id': inst['DBInstanceIdentifier'],
                    'resource_name': inst['DBInstanceIdentifier'],
                    'cloud_provider': 'aws',
                    'region': region,
                    'service_type': ServiceType.RDS.value,
                    'control_type': ControlType.DIRECT_POWER.value,
                    'status': normalize_rds_status(inst.get('DBInstanceStatus', 'unknown')),
                    'instance_spec': inst.get('DBInstanceClass', 'unknown'),
                    'tags': {t.get('Key'): t.get('Value') for t in inst.get('TagList', [])},
                    'last_synced_at': datetime.now(timezone.utc)
                })

            # 2. Fetch Aurora Clusters
            clusters_res = client.describe_db_clusters()
            for cluster in clusters_res.get('DBClusters', []):
                resources.append({
                    'resource_id': cluster['DBClusterIdentifier'],
                    'resource_name': cluster['DBClusterIdentifier'],
                    'cloud_provider': 'aws',
                    'region': region,
                    'service_type': ServiceType.AURORA.value,
                    'control_type': ControlType.DIRECT_POWER.value,
                    'status': normalize_rds_status(cluster.get('Status', 'unknown')),
                    'instance_spec': 'cluster',
                    'tags': {t.get('Key'): t.get('Value') for t in cluster.get('TagList', [])},
                    'last_synced_at': datetime.now(timezone.utc)
                })

        except ClientError as e:
            from app.services.base_handler import parse_aws_client_error
            self.log_once("RDSHandler", parse_aws_client_error(e))
        except Exception as e:
            from app.services.base_handler import parse_aws_client_error
            self.log_once("RDSHandler", parse_aws_client_error(e))

        return resources

    def _execute_get_state(self, session, native_id: str, **kwargs) -> str:
        client = session.client('rds')
        is_cluster = kwargs.get('is_cluster', False)
        if is_cluster:
            res = client.describe_db_clusters(DBClusterIdentifier=native_id)
            clusters = res.get('DBClusters', [])
            if clusters:
                return normalize_rds_status(clusters[0].get('Status', 'unknown'))
        else:
            res = client.describe_db_instances(DBInstanceIdentifier=native_id)
            instances = res.get('DBInstances', [])
            if instances:
                return normalize_rds_status(instances[0].get('DBInstanceStatus', 'unknown'))
        return "unknown"

    def _execute_start(self, session, native_id: str, **kwargs):
        client = session.client('rds')
        if kwargs.get('is_cluster', False):
            client.start_db_cluster(DBClusterIdentifier=native_id)
        else:
            client.start_db_instance(DBInstanceIdentifier=native_id)

    def _execute_stop(self, session, native_id: str, **kwargs):
        client = session.client('rds')
        if kwargs.get('is_cluster', False):
            client.stop_db_cluster(DBClusterIdentifier=native_id)
        else:
            client.stop_db_instance(DBInstanceIdentifier=native_id)
