from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
import logging
import asyncio
from botocore.exceptions import ClientError, EndpointConnectionError

def parse_aws_client_error(e: Exception) -> str:
    if isinstance(e, EndpointConnectionError):
        return "Service endpoint is not available in this region."
        
    error_code = e.response.get('Error', {}).get('Code', 'UnknownError') if hasattr(e, 'response') and e.response else 'UnknownError'
    error_message = e.response.get('Error', {}).get('Message', str(e)) if hasattr(e, 'response') and e.response else str(e)
    
    if error_code == 'OptInRequired':
        return "Service is not opted-in or subscribed in this region."
    elif error_code in ['AccessDenied', 'AccessDeniedException', 'UnauthorizedOperation']:
        return "IAM Policy missing or insufficient permissions."
    elif error_code == 'AuthFailure':
        return "AWS Credentials are invalid or expired."
    return f"[{error_code}] {error_message}"

class ControlResourceHandler(ABC):
    """
    Abstract base class for specific cloud resources (e.g. EC2, RDS).
    Combines both Discovery (scanning) and Control (start/stop) logic into a single cohesive unit.
    """
    
    _error_cache = set()

    @classmethod
    def log_once(cls, service_name: str, error_message: str):
        key = f"{service_name}_{error_message}"
        if key not in cls._error_cache:
            cls._error_cache.add(key)
            logging.warning(f"[{service_name}] {error_message}")
            
    @abstractmethod
    def scan_region(self, session_manager, credentials: dict, region: str) -> List[Dict[str, Any]]:
        """Discover resources of this type in a given region."""
        pass

    @abstractmethod
    async def get_state(self, session_manager, credentials: dict, region: str, native_id: str) -> str:
        """Get the real-time operational state of a specific resource."""
        pass

    @abstractmethod
    async def start(self, session_manager, credentials: dict, region: str, native_id: str, saved_config: str = None, **kwargs) -> dict:
        """Power ON a specific resource."""
        pass

    @abstractmethod
    async def stop(self, session_manager, credentials: dict, region: str, native_id: str, saved_config: str = None, **kwargs) -> dict:
        """Power OFF a specific resource."""
        pass

class BaseDirectPowerHandler(ControlResourceHandler):
    """
    Base class for resources that support Direct Power Control (Native Start/Stop).
    Handles boilerplate Boto3 async dispatching and error catching.
    """
    async def get_state(self, session_manager, credentials: dict, region: str, native_id: str, **kwargs) -> str:
        def _get():
            session = session_manager.create_session(credentials, region)
            try:
                return self._execute_get_state(session, native_id, **kwargs)
            except ClientError as e:
                logging.error(f"Error getting state for {native_id}: {parse_aws_client_error(e)}")
                return "error"
            except Exception as e:
                logging.error(f"Unexpected error in get_state for {native_id}: {e}")
                return "error"
        return await asyncio.to_thread(_get)

    async def start(self, session_manager, credentials: dict, region: str, native_id: str, saved_config: str = None, **kwargs) -> dict:
        state = await self.get_state(session_manager, credentials, region, native_id, **kwargs)
        if state != 'STOPPED':
            return {"status": "error", "message": f"Resource {native_id} is in '{state}' state, must be 'STOPPED' to start."}
            
        def _start():
            session = session_manager.create_session(credentials, region)
            try:
                self._execute_start(session, native_id, **kwargs)
                return {"status": "success", "action": "START", "resource_id": native_id, "message": "Successfully initiated START sequence."}
            except ClientError as e:
                return {"status": "error", "message": parse_aws_client_error(e)}
            except Exception as e:
                return {"status": "error", "message": str(e)}
        return await asyncio.to_thread(_start)

    async def stop(self, session_manager, credentials: dict, region: str, native_id: str, saved_config: str = None, **kwargs) -> dict:
        state = await self.get_state(session_manager, credentials, region, native_id, **kwargs)
        if state != 'RUNNING':
            return {"status": "error", "message": f"Resource {native_id} is in '{state}' state, must be 'RUNNING' to stop."}
            
        def _stop():
            session = session_manager.create_session(credentials, region)
            try:
                self._execute_stop(session, native_id, **kwargs)
                return {"status": "success", "action": "STOP", "resource_id": native_id, "message": "Successfully initiated STOP sequence."}
            except ClientError as e:
                return {"status": "error", "message": parse_aws_client_error(e)}
            except Exception as e:
                return {"status": "error", "message": str(e)}
        return await asyncio.to_thread(_stop)

    @abstractmethod
    def _execute_get_state(self, session, native_id: str, **kwargs) -> str:
        pass

    @abstractmethod
    def _execute_start(self, session, native_id: str, **kwargs):
        pass

    @abstractmethod
    def _execute_stop(self, session, native_id: str, **kwargs):
        pass

class BaseScaleToZeroHandler(ControlResourceHandler):
    """
    Base class for resources that are scaled to zero (e.g. ASG, ECS).
    Maintains capacity state using saved_config JSON.
    """
    async def get_state(self, session_manager, credentials: dict, region: str, native_id: str, **kwargs) -> str:
        def _get():
            session = session_manager.create_session(credentials, region)
            try:
                return self._execute_get_state(session, native_id, **kwargs)
            except ClientError as e:
                logging.error(f"Error getting state for {native_id}: {parse_aws_client_error(e)}")
                return "error"
            except Exception as e:
                logging.error(f"Unexpected error in get_state for {native_id}: {e}")
                return "error"
        return await asyncio.to_thread(_get)

    async def start(self, session_manager, credentials: dict, region: str, native_id: str, saved_config: str = None, **kwargs) -> dict:
        state = await self.get_state(session_manager, credentials, region, native_id, **kwargs)
        if state != 'STOPPED':
            return {"status": "error", "message": f"Resource {native_id} is in '{state}' state, must be 'STOPPED' to start."}
            
        def _start():
            session = session_manager.create_session(credentials, region)
            try:
                self._execute_start(session, native_id, saved_config, **kwargs)
                return {"status": "success", "action": "START", "resource_id": native_id, "message": "Successfully initiated SCALE_TO_ORIGINAL sequence."}
            except ClientError as e:
                return {"status": "error", "message": parse_aws_client_error(e)}
            except Exception as e:
                return {"status": "error", "message": str(e)}
        return await asyncio.to_thread(_start)

    async def stop(self, session_manager, credentials: dict, region: str, native_id: str, saved_config: str = None, **kwargs) -> dict:
        state = await self.get_state(session_manager, credentials, region, native_id, **kwargs)
        if state != 'RUNNING':
            return {"status": "error", "message": f"Resource {native_id} is in '{state}' state, must be 'RUNNING' to stop."}
            
        def _stop():
            session = session_manager.create_session(credentials, region)
            try:
                new_saved_config = self._execute_stop(session, native_id, **kwargs)
                res = {"status": "success", "action": "STOP", "resource_id": native_id, "message": "Successfully initiated SCALE_TO_ZERO sequence."}
                if new_saved_config:
                    res["saved_config_json"] = new_saved_config
                return res
            except ClientError as e:
                return {"status": "error", "message": parse_aws_client_error(e)}
            except Exception as e:
                return {"status": "error", "message": str(e)}
        return await asyncio.to_thread(_stop)

    @abstractmethod
    def _execute_get_state(self, session, native_id: str, **kwargs) -> str:
        pass

    @abstractmethod
    def _execute_start(self, session, native_id: str, saved_config: str, **kwargs):
        pass

    @abstractmethod
    def _execute_stop(self, session, native_id: str, **kwargs) -> str:
        pass
