import asyncio
import os
import boto3
import botocore.session
from botocore.exceptions import BotoCoreError, ClientError

class AWSSessionManager:
    def create_session(self, credentials: dict, region: str = None):
        bc_session = botocore.session.get_session()
        if credentials.get('aws_access_key_id') or credentials.get('assume_role_arn'):
            bc_session.set_config_variable('credentials_file', os.devnull)

        if credentials.get('assume_role_arn'):
            sts_params = {'region_name': 'us-east-1'}
            if credentials.get('aws_access_key_id'):
                sts_params['aws_access_key_id'] = credentials['aws_access_key_id']
                sts_params['aws_secret_access_key'] = credentials['aws_secret_access_key']
            if credentials.get('aws_session_token'):
                sts_params['aws_session_token'] = credentials['aws_session_token'].strip()
                
            sts = boto3.client('sts', **sts_params)

            assume_params = {'RoleArn': credentials['assume_role_arn'], 'RoleSessionName': 'ControlModuleSession', 'DurationSeconds': 3600}
            if credentials.get('external_id'):
                assume_params['ExternalId'] = credentials['external_id']

            creds = sts.assume_role(**assume_params)['Credentials']
            return boto3.Session(
                aws_access_key_id=creds['AccessKeyId'],
                aws_secret_access_key=creds['SecretAccessKey'],
                aws_session_token=creds['SessionToken'],
                region_name=region,
                botocore_session=bc_session
            )
        elif credentials.get('use_iam_role'):
            return boto3.Session(region_name=region, botocore_session=bc_session)
        else:
            params = {
                'aws_access_key_id': credentials.get('aws_access_key_id', '').strip() if credentials.get('aws_access_key_id') else None,
                'aws_secret_access_key': credentials.get('aws_secret_access_key', '').strip() if credentials.get('aws_secret_access_key') else None,
                'region_name': region,
                'botocore_session': bc_session
            }
            if credentials.get('aws_session_token'):
                params['aws_session_token'] = credentials.get('aws_session_token', '').strip()
            return boto3.Session(**params)

    async def test_connection(self, credentials: dict) -> tuple[bool, str]:
        def _test():
            try:
                session = self.create_session(credentials, credentials.get('default_region', 'us-east-1'))
                sts = session.client('sts', region_name='us-east-1')
                sts.get_caller_identity()
                return True, ""
            except (BotoCoreError, ClientError) as e:
                err = str(e)
                if "InvalidClientTokenId" in err or "InvalidAccessKeyId" in err:
                    return False, "Invalid AWS Security Token or Access Key."
                if "SignatureDoesNotMatch" in err:
                    return False, "Invalid AWS Secret Key."
                return False, err
                
        return await asyncio.to_thread(_test)
