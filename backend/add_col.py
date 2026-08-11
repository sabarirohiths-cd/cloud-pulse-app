import sqlite3
import os

db_path = os.path.join(os.path.dirname(__file__), 'data', 'cloud_pulse.db')
print(f"Connecting to {db_path}")

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("ALTER TABLE control_action_logs ADD COLUMN resource_type VARCHAR;")
    conn.commit()
    print("Successfully added resource_type to control_action_logs")
except Exception as e:
    print(f"Error: {e}")
finally:
    if 'conn' in locals():
        conn.close()
