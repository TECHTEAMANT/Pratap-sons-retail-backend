const { Client } = require('pg');
const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'invento_erp',
  user: 'postgres',
  password: 'Root@123'
});

async function addVendorRole() {
  try {
    await client.connect();
    
    // Check if role already exists
    const check = await client.query("SELECT id FROM roles WHERE name = 'Vendor'");
    if (check.rows.length > 0) {
      console.log('Vendor role already exists');
      return;
    }

    const query = `
      INSERT INTO roles (
        id, name, description, 
        can_view_cost, can_view_mrp, 
        can_manage_purchases, can_manage_sales, 
        can_view_reports, can_manage_inventory, 
        can_manage_masters, can_manage_users
      ) VALUES (
        gen_random_uuid(), 'Vendor', 'Restricted access for external vendors', 
        false, false, 
        false, false, 
        true, false, 
        false, false
      )
    `;
    await client.query(query);
    console.log('Vendor role created successfully');
  } catch (err) {
    console.error('Error creating vendor role:', err);
  } finally {
    await client.end();
  }
}

addVendorRole();
