const { Client } = require('pg');
const client = new Client({ connectionString: 'postgres://postgres:Root@123@localhost:5432/invento_erp' });
client.connect().then(async () => {
  // Get latest 5 purchase orders
  const res = await client.query(`
    SELECT po.*, 
           (SELECT json_agg(pi) FROM purchase_items pi WHERE pi.po_id = po.id) as items
    FROM purchase_orders po
    ORDER BY created_at DESC LIMIT 5
  `);
  
  for (const po of res.rows) {
    const poTotal = Number(po.total_amount);
    
    // Tally raw items logic
    let totalItemsRawCost = 0;
    for (const item of po.items || []) {
      totalItemsRawCost += Number(item.quantity) * Number(item.cost_per_item);
    }
    
    const ledgerDiscount = Number(po.ledger_discount || 0);
    const discountRatio = totalItemsRawCost > 0 ? (totalItemsRawCost - ledgerDiscount) / totalItemsRawCost : 1;
    
    let totalCgst = 0, totalSgst = 0, totalIgst = 0;
    const isInterState = po.ledger_igst_account ? true : false; // simplistic
    
    for (const item of po.items || []) {
      const rawAmt = Number(item.quantity) * Number(item.cost_per_item);
      const taxable = rawAmt * discountRatio;
      let tax = 0;
      if (item.gst_logic === 'AUTO_5_18') tax = Number(item.mrp) < 2500 ? 5 : 18;
      else if (item.gst_logic.includes('5')) tax = 5;
      else if (item.gst_logic.includes('12')) tax = 12;
      else if (item.gst_logic.includes('18')) tax = 18;
      else if (item.gst_logic.includes('28')) tax = 28;
      
      const taxAmt = taxable * (tax / 100);
      if (isInterState) totalIgst += taxAmt;
      else { totalCgst += taxAmt / 2; totalSgst += taxAmt / 2; }
    }
    
    // freight
    const freight = Number(po.ledger_freight || 0);
    const freightGstRate = Number(po.ledger_freight_gst_rate || 0);
    let fCgst = 0, fSgst = 0, fIgst = 0;
    if (freightGstRate > 0) {
      const ftax = freight * (freightGstRate / 100);
      if (isInterState) fIgst = ftax;
      else { fCgst = ftax/2; fSgst = ftax/2; }
    }
    
    const manualGst = po.manual_gst_amount ? Number(po.manual_gst_amount) : null;
    let finalCgst = 0, finalSgst = 0, finalIgst = 0;
    if (manualGst !== null) {
      if (isInterState) finalIgst = manualGst;
      else { finalCgst = manualGst/2; finalSgst = manualGst/2; }
    } else {
      finalCgst = totalCgst + fCgst;
      finalSgst = totalSgst + fSgst;
      finalIgst = totalIgst + fIgst;
    }
    
    const exactTotal = totalItemsRawCost + freight - ledgerDiscount + finalCgst + finalSgst + finalIgst;
    
    console.log('PO ID:', po.id);
    console.log('DB Total:', poTotal);
    console.log('Tally Exact Total:', exactTotal);
    console.log('Round Off:', (poTotal - exactTotal).toFixed(2));
    console.log('---------------------------');
  }
  
  client.end();
}).catch(console.error);
