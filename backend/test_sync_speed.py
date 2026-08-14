import asyncio
from time import perf_counter
from app.services.aws.scanner import scan_all_resources_parallel

async def run_test():
    credentials = {'aws_access_key_id': 'DUMMY', 'aws_secret_access_key': 'DUMMY', 'use_iam_role': True, 'account_name': 'test'}
    start = perf_counter()
    res = await scan_all_resources_parallel(credentials, 'us-east-1')
    end = perf_counter()
    print(f'Sync took {end - start:.2f} seconds. Discovered {len(res)} resources.')

asyncio.run(run_test())
