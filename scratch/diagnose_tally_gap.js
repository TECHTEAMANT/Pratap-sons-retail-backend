const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:Root@123@localhost:5432/invento_erp' });
client.connect().then(async () => {
  
  // The PR report shows 2705908. Let's figure out how it calculates
  // It could be using cost_val from purchase_return_items, not total_return_amount
  
  const prCostVal = await client.query(`
    SELECT 
      COUNT(DISTINCT pr.id) as return_count,
      SUM(pri.cost * pri.quantity) as raw_cost_sum,
      SUM(pr.total_return_amount) as header_total
    FROM purchase_returns pr
    JOIN purchase_return_items pri ON pri.return_id = pr.id
    WHERE pr.return_date BETWEEN '2026-05-01' AND '2026-05-31'
    AND pr.status NOT IN ('cancelled', 'draft')
  `);
  console.log('=== PR by cost*qty vs total_return_amount (May UTC) ===');
  console.log(JSON.stringify(prCostVal.rows, null, 2));

  // Now check the backend service query
  // The service might join items and aggregate differently
  const prServiceStyle = await client.query(`
    SELECT 
      COUNT(DISTINCT pr.id) as return_count,
      SUM(
        COALESCE(
          (SELECT SUM(pri2.cost * pri2.quantity) FROM purchase_return_items pri2 WHERE pri2.return_id = pr.id), 0
        )
      ) AS cost_val
    FROM purchase_returns pr
    WHERE pr.return_date BETWEEN '2026-05-01' AND '2026-05-31'
    AND pr.status NOT IN ('cancelled', 'draft')
  `);
  console.log('\n=== PR cost_val service style (May UTC) ===');
  console.log(JSON.stringify(prServiceStyle.rows, null, 2));

  // Check if the 2705908 matches an IST-based date range
  const prIST = await client.query(`
    SELECT 
      COUNT(DISTINCT pr.id) as return_count,
      SUM(
        COALESCE(
          (SELECT SUM(pri2.cost * pri2.quantity) FROM purchase_return_items pri2 WHERE pri2.return_id = pr.id), 0
        )
      ) AS cost_val,
      SUM(pr.total_return_amount) as header_total
    FROM purchase_returns pr
    WHERE pr.return_date BETWEEN '2026-04-30 18:30:00' AND '2026-05-31 18:29:59'
    AND pr.status NOT IN ('cancelled', 'draft')
  `);
  console.log('\n=== PR cost_val IST-based range (Apr30 18:30 UTC = May1 IST to May31 IST) ===');
  console.log(JSON.stringify(prIST.rows, null, 2));

  // Also check what the tally sync shows for purchase_return in a wider range
  const tallyPRAll = await client.query(`
    SELECT COUNT(*) as count, SUM(total_amount) as total
    FROM tally_sync
    WHERE record_type = 'purchase_return'
  `);
  console.log('\n=== ALL Tally Purchase Returns (no date filter) ===');
  console.log(JSON.stringify(tallyPRAll.rows, null, 2));

  // Check purchase_return total with IST dates  
  const tallyPRIST = await client.query(`
    SELECT COUNT(*) as count, SUM(total_amount) as total
    FROM tally_sync
    WHERE record_type = 'purchase_return'
    AND invoice_date >= '2026-04-30T18:30:00' AND invoice_date <= '2026-05-31T18:29:59'
  `);
  console.log('\n=== Tally Purchase Returns (IST May 1-31) ===');
  console.log(JSON.stringify(tallyPRIST.rows, null, 2));

  // Check purchase total IST 
  const tallyPurchaseIST = await client.query(`
    SELECT COUNT(*) as count, SUM(total_amount) as total
    FROM tally_sync
    WHERE record_type = 'purchase'
    AND invoice_date >= '2026-04-30T18:30:00' AND invoice_date <= '2026-05-31T18:29:59'
  `);
  console.log('\n=== Tally Purchase (IST May 1-31) ===');
  console.log(JSON.stringify(tallyPurchaseIST.rows, null, 2));

  // What does the backend purchase_return analysis return for the May date range?
  // Check the cost_val aggregate logic
  const prCostValIST = await client.query(`
    SELECT 
      COUNT(DISTINCT pr.id) as count,
      SUM(
        COALESCE(
          (SELECT SUM(pri2.cost * pri2.quantity) FROM purchase_return_items pri2 WHERE pri2.return_id = pr.id), 0
        )
      ) AS cost_val
    FROM purchase_returns pr
    WHERE pr.return_date BETWEEN '2026-04-30 18:30:00' AND '2026-05-31 18:30:00'
    AND pr.status NOT IN ('cancelled', 'draft')
  `);
  console.log('\n=== PR cost_val IST May ===');
  console.log(JSON.stringify(prCostValIST.rows, null, 2));

  client.end();
}).catch(console.error);
