import re

with open(r'e:\Project\cloud-pulse-app\backend\app\repositories\control_repository.py', 'r') as f:
    content = f.read()

content = content.replace('from app.models import ControlResource', 'from app.models import ControlResource, ConfigCloudAccount')

# get_dashboard_summary
content = content.replace(
    ').where(and_(*conditions) if conditions else True)',
    ').join(ConfigCloudAccount, ControlResource.account_name == ConfigCloudAccount.account_name).where(and_(*conditions) if conditions else True).where(ConfigCloudAccount.active_modules.like("%control%"))'
)

# get_filtered_resources
old_stmt = 'stmt = select(ControlResource)'
new_stmt = 'stmt = select(ControlResource).join(ConfigCloudAccount, ControlResource.account_name == ConfigCloudAccount.account_name).where(ConfigCloudAccount.active_modules.like("%control%"))'
content = content.replace(old_stmt, new_stmt)

# get_all_schedules
old_schedule = '''    @staticmethod
    async def get_all_schedules(db: AsyncSession):
        stmt = select(ControlResource)'''
new_schedule = '''    @staticmethod
    async def get_all_schedules(db: AsyncSession):
        stmt = select(ControlResource).join(ConfigCloudAccount, ControlResource.account_name == ConfigCloudAccount.account_name).where(ConfigCloudAccount.active_modules.like("%control%"))'''
content = content.replace(old_schedule, new_schedule)

with open(r'e:\Project\cloud-pulse-app\backend\app\repositories\control_repository.py', 'w') as f:
    f.write(content)
