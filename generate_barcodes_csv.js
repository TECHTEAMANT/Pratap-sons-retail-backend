const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function generateBarcodesCSV() {
  try {
    const res = await pool.query(`
      SELECT 
        barcode_alias_8digit as "Barcode",
        design_no as "Design No",
        mrp as "MRP",
        total_quantity as "Total Quantity",
        available_quantity as "Available Quantity",
        po_id as "Purchase Order ID",
        CASE 
          WHEN po_id IS NULL THEN 'Remove (Orphaned - No PO)'
          WHEN available_quantity < 0 THEN 'Remove (Negative Stock)'
          ELSE 'Keep'
        END as "Action Recommendation"
      FROM barcode_batches
      ORDER BY "Action Recommendation" DESC, "Barcode" ASC
    `);

    if (res.rows.length === 0) {
      console.log("No barcodes found in database.");
      return;
    }

    // Get headers
    const headers = Object.keys(res.rows[0]);
    
    // Create CSV string
    const csvRows = [];
    csvRows.push(headers.join(',')); // Add headers

    let removeCount = 0;
    
    for (const row of res.rows) {
      if (row["Action Recommendation"].startsWith('Remove')) {
        removeCount++;
      }
      
      const values = headers.map(header => {
        const val = row[header] === null ? '' : String(row[header]);
        // Escape quotes and wrap in quotes if contains comma
        if (val.includes(',') || val.includes('"') || val.includes('\n')) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      });
      csvRows.push(values.join(','));
    }

    const csvContent = csvRows.join('\n');
    const filePath = path.join(__dirname, 'barcodes_analysis.csv');
    
    fs.writeFileSync(filePath, csvContent);
    
    console.log(`Successfully generated CSV at ${filePath}`);
    console.log(`Total barcodes: ${res.rows.length}`);
    console.log(`Barcodes recommended for removal: ${removeCount}`);
    
  } catch(e) {
    console.error(e);
  } finally {
    pool.end();
  }
}

generateBarcodesCSV();
