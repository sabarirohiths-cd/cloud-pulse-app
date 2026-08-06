const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('../backend/cloudpulse.db');
db.serialize(() => {
  db.each('SELECT resource_name, parent_resource_id, instance_spec, service_type FROM control_resources WHERE service_type IN (\'ASG\', \'EKS\')', (err, row) => {
    if (err) console.error(err);
    console.log(row);
  });
});
db.close();
