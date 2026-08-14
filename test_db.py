import sqlite3
conn = sqlite3.connect('backend/cloudpulse.db')
cur = conn.cursor()
cur.execute("SELECT resource_id, status FROM control_resources WHERE parent_resource_id = 'asg-unmanaged-test'")
rows = cur.fetchall()
print('FOUND EC2 INSTANCES IN DB:')
for row in rows:
    print(row)
