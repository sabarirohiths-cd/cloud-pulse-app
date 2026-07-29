from typing import Tuple, Optional
import logging

logger = logging.getLogger(__name__)

def discover_asg_and_cp_status(session, cluster_name: str) -> Tuple[bool, Optional[str]]:
    """
    Discovers if the cluster uses a Managed Capacity Provider.
    If not, attempts to discover the underlying ASG name by inspecting container instances.
    Returns: (has_managed_cp, asg_name)
    """
    ecs = session.client('ecs')
    ec2 = session.client('ec2')
    
    has_managed_cp = False
    asg_name = None
    
    # 1. Check Capacity Providers
    try:
        cluster_res = ecs.describe_clusters(clusters=[cluster_name])
        clusters = cluster_res.get('clusters', [])
        if clusters:
            cp_names = clusters[0].get('capacityProviders', [])
            if cp_names:
                cp_res = ecs.describe_capacity_providers(capacityProviders=cp_names)
                for cp in cp_res.get('capacityProviders', []):
                    asg_config = cp.get('autoScalingGroupProvider', {})
                    if asg_config.get('managedScaling', {}).get('status') == 'ENABLED':
                        has_managed_cp = True
                    
                    asg_arn = asg_config.get('autoScalingGroupArn')
                    if asg_arn:
                        # Extract name from ARN: arn:aws:autoscaling:region:account:autoScalingGroup:uuid:autoScalingGroupName/my-asg
                        asg_name = asg_arn.split('autoScalingGroupName/')[-1]
                        break
    except Exception as e:
        logger.warning(f"Error checking capacity providers for {cluster_name}: {e}")
        

    if asg_name:
        # Return the ASG name if found via CP, regardless of whether scaling is ENABLED or DISABLED
        return has_managed_cp, asg_name
        
    # 2. If no Managed CP, inspect container instances to find ASG
    try:
        ci_res = ecs.list_container_instances(cluster=cluster_name, maxResults=1)
        ci_arns = ci_res.get('containerInstanceArns', [])
        if ci_arns:
            desc_ci_res = ecs.describe_container_instances(cluster=cluster_name, containerInstances=ci_arns)
            instances = desc_ci_res.get('containerInstances', [])
            if instances:
                ec2_id = instances[0].get('ec2InstanceId')
                if ec2_id:
                    ec2_res = ec2.describe_instances(InstanceIds=[ec2_id])
                    for resrv in ec2_res.get('Reservations', []):
                        for inst in resrv.get('Instances', []):
                            for tag in inst.get('Tags', []):
                                if tag.get('Key') == 'aws:autoscaling:groupName':
                                    asg_name = tag.get('Value')
                                    break
    except Exception as e:
        logger.warning(f"Error discovering ASG for ECS cluster {cluster_name}: {e}")
        
    return has_managed_cp, asg_name
async def async_discover_asg_and_cp_status(session, cluster_name: str) -> Tuple[bool, list]:
    has_managed_cp = False
    asg_names = []
    
    async with session.client('ecs') as ecs:
        try:
            cluster_res = await ecs.describe_clusters(clusters=[cluster_name])
            clusters = cluster_res.get('clusters', [])
            if clusters:
                cp_names = clusters[0].get('capacityProviders', [])
                if cp_names:
                    cp_res = await ecs.describe_capacity_providers(capacityProviders=cp_names)
                    for cp in cp_res.get('capacityProviders', []):
                        asg_config = cp.get('autoScalingGroupProvider', {})
                        if asg_config.get('managedScaling', {}).get('status') == 'ENABLED':
                            has_managed_cp = True
                        
                        asg_arn = asg_config.get('autoScalingGroupArn')
                        if asg_arn:
                            asg_name = asg_arn.split('autoScalingGroupName/')[-1]
                            if asg_name not in asg_names:
                                asg_names.append(asg_name)
        except Exception as e:
            logger.warning(f"Error checking capacity providers for {cluster_name}: {e}")

        # Check container instances to find unmanaged ASGs
        try:
            ci_res = await ecs.list_container_instances(cluster=cluster_name, maxResults=100)
            ci_arns = ci_res.get('containerInstanceArns', [])
            if ci_arns:
                desc_ci_res = await ecs.describe_container_instances(cluster=cluster_name, containerInstances=ci_arns)
                instances = desc_ci_res.get('containerInstances', [])
                ec2_ids = [inst.get('ec2InstanceId') for inst in instances if inst.get('ec2InstanceId')]
                
                if ec2_ids:
                    async with session.client('ec2') as ec2:
                        for i in range(0, len(ec2_ids), 100):
                            batch = ec2_ids[i:i+100]
                            ec2_res = await ec2.describe_instances(InstanceIds=batch)
                            for resrv in ec2_res.get('Reservations', []):
                                for inst in resrv.get('Instances', []):
                                    for tag in inst.get('Tags', []):
                                        if tag.get('Key') == 'aws:autoscaling:groupName':
                                            asg_name = tag.get('Value')
                                            if asg_name not in asg_names:
                                                asg_names.append(asg_name)
                                            break
        except Exception as e:
            logger.warning(f"Error discovering ASG for ECS cluster {cluster_name}: {e}")
            
    return has_managed_cp, asg_names
