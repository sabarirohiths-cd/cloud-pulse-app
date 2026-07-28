from .direct_power.ec2_handler import EC2Handler
from .direct_power.rds_handler import RDSHandler
from .direct_power.documentdb_handler import DocumentDBHandler
from .direct_power.redshift_handler import RedshiftHandler
from .direct_power.sagemaker_handler import SageMakerHandler
from .direct_power.workspaces_handler import WorkSpacesHandler
from .scale_to_zero.asg_handler import ASGHandler
from .scale_to_zero.ecs_handler import ECSScaleToZeroHandler

# Registry of active AWS resource handlers
# Add new handlers here to instantly enable discovery and control across the platform.
REGISTERED_HANDLERS = [
    EC2Handler(),
    RDSHandler(),
    DocumentDBHandler(),
    RedshiftHandler(),
    SageMakerHandler(),
    WorkSpacesHandler(),
    ASGHandler(),
    ECSScaleToZeroHandler()
]
