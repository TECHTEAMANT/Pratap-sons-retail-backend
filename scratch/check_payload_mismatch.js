const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:Root@123@localhost:5432/invento_erp' });
client.connect().then(async () => {
  const res = await client.query(`SELECT id, record_type, sync_data FROM tally_sync`);
  let mismatches = 0;
  for (const row of res.rows) {
    const data = row.sync_data;
    if (!data) continue;
    
    // Calculate sum of items and ledgers
    let sum = 0;
    let totalAmt = Number(data.amount || 0);
    
    if (data.items) {
      data.items.forEach(i => sum += Number(i.amount || 0));
    }
    if (data.otherLedger) {
      data.otherLedger.forEach(l => sum += Number(l.amount || 0));
    }
    // For receipts, it's different
    if (data.partyDetail && data.partyDetail.length > 0) {
      let rSum = 0;
      data.partyDetail.forEach(p => rSum += Number(p.entryAmount || 0));
      if (Math.abs(rSum - totalAmt) > 0.1) {
        console.log(`Mismatch in receipt ${row.id}: Total=${totalAmt}, Sum=${rSum}`);
        mismatches++;
      }
      continue;
    }
    
    if (Math.abs(sum - totalAmt) > 0.1 && data.items) {
      console.log(`Mismatch in ${row.record_type} ${row.id}: Total=${totalAmt}, Sum=${sum}`);
      mismatches++;
    }
  }
  console.log('Total mismatches found:', mismatches);
  client.end();
}).catch(console.error);
