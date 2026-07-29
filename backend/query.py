import sqlite3
conn = sqlite3.connect('data/cloud_pulse.db')
cursor = conn.execute('SELECT resource_id, parent_resource_id, instance_spec, status FROM control_resources WHERE service_type=''ASG''')
for row in cursor.fetchall(): print(row)
