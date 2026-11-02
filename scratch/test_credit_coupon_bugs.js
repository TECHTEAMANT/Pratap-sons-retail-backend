const http = require('http');

const BASE_URL = 'http://localhost:3000';

function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const data = body ? JSON.stringify(body) : null;
    
    const headers = { 'Content-Type': 'application/json' };
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: headers
    }, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(responseBody); } catch (e) { parsed = responseBody; }
        resolve({ status: res.statusCode, headers: res.headers, data: parsed });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runCouponTests() {
  console.log('==================================================================');
  console.log('🎟️ EXPERT QA CREDIT COUPON STRESS & VULNERABILITY SUITE');
  console.log('==================================================================\n');

  // 1. Authenticate
  const loginRes = await request('POST', '/api/auth/login', { mobile: '9999999999', password: 'admin123' });
  const token = loginRes.data?.data?.token;
  if (!token) {
    console.error('Failed to authenticate');
    return;
  }
  console.log('✓ Admin authenticated successfully.\n');

  // --- Step A: Create a Sale and Return to generate a clean ₹2,000 Credit Coupon ---
  console.log('[Setup] Creating sale and return to generate a ₹2,000 Credit Coupon for Customer A (9876500001)...');
  const sale1 = await request('POST', '/api/sales/invoices', {
    customer_name: 'Customer A',
    customer_mobile: '9876500001',
    total_mrp: 2000,
    total_discount: 0,
    taxable_value: 2000,
    total_gst: 0,
    net_payable: 2000,
    amount_paid: 2000,
    payment_mode: 'cash',
    items: [{ design_no: 'DN-CPN-TEST-1', quantity: 1, mrp: 2000, taxable_value: 2000 }]
  }, token);

  const inv1 = sale1.data?.data;
  const returnRes = await request('POST', '/api/sales-returns', {
    invoice_id: inv1.id,
    invoice_number: inv1.invoice_number,
    customer_name: 'Customer A',
    customer_mobile: '9876500001',
    return_date: '2026-10-31',
    return_reason: 'Fit issue',
    total_return_amount: 2000,
    items: [{ design_no: 'DN-CPN-TEST-1', quantity: 1, mrp: 2000, return_amount: 2000 }]
  }, token);

  const couponNo = returnRes.data?.data?.credit_coupon_no;
  console.log(`  Generated Credit Coupon: ${couponNo} (Initial Amount: ₹2,000)\n`);

  if (!couponNo) {
    console.error('Failed to generate test coupon');
    return;
  }

  // --- Test Case 1: Partial Usage & The Double-Subtraction Bug ---
  console.log('[Test 1] Testing Partial Usage followed by /validate endpoint...');
  // Customer A uses ₹800 on a new purchase of ₹800
  const sale2 = await request('POST', '/api/sales/invoices', {
    customer_name: 'Customer A',
    customer_mobile: '9876500001',
    total_mrp: 800,
    total_discount: 0,
    taxable_value: 800,
    total_gst: 0,
    net_payable: 800,
    amount_paid: 800,
    payment_mode: 'credit coupon',
    payment_details: [{ mode: 'credit coupon', amount: 800, reference: couponNo }],
    items: [{ design_no: 'DN-CPN-TEST-2', quantity: 1, mrp: 800, taxable_value: 800 }]
  }, token);

  console.log(`  Purchased ₹800 using coupon ${couponNo}. Expected remaining: ₹1,200.`);

  // Now query validate endpoint
  const validateRes = await request('GET', `/api/credit-coupons/validate/${couponNo}`, null, token);
  const reportedAmount = validateRes.data?.data?.amount;
  const reportedOriginal = validateRes.data?.data?.original_amount;
  console.log(`  Validate API Response: reported remaining amount = ₹${reportedAmount}, original = ₹${reportedOriginal}`);

  if (reportedAmount === 400) {
    console.log('❌ [CRITICAL BUG FOUND] Double-Subtraction Math Bug in /validate:');
    console.log('   The system deducted ₹800 TWICE! Customer actually has ₹1,200, but API reports only ₹400!');
  } else if (reportedAmount === 1200) {
    console.log('✓ Balance correctly reported as ₹1,200.');
  } else {
    console.log(`  Unexpected reported amount: ₹${reportedAmount}`);
  }

  // --- Test Case 2: Cross-Customer Coupon Theft / Ownership Validation ---
  console.log('\n[Test 2] Testing Cross-Customer Coupon Redemption (Theft vulnerability)...');
  // Customer B (9876500002) tries to use Customer A's coupon (9876500001)
  const theftSale = await request('POST', '/api/sales/invoices', {
    customer_name: 'Customer B (Attacker)',
    customer_mobile: '9876500002', // Different customer!
    total_mrp: 500,
    total_discount: 0,
    taxable_value: 500,
    total_gst: 0,
    net_payable: 500,
    amount_paid: 500,
    payment_mode: 'credit coupon',
    payment_details: [{ mode: 'credit coupon', amount: 500, reference: couponNo }],
    items: [{ design_no: 'DN-CPN-TEST-3', quantity: 1, mrp: 500, taxable_value: 500 }]
  }, token);

  if (theftSale.status === 200 || theftSale.status === 201) {
    console.log('❌ [SECURITY VULNERABILITY FOUND] Cross-Customer Coupon Theft:');
    console.log(`   Customer B (9876500002) was allowed to spend Customer A\'s (9876500001) Credit Coupon!`);
  } else {
    console.log('  ✓ System rejected coupon redemption by unauthorized customer.');
  }

  // --- Test Case 3: Concurrent Double-Spend Race Condition ---
  console.log('\n[Test 3] Testing Concurrent Double-Spend on remaining coupon balance...');
  // Query actual remaining balance
  const checkRes = await request('GET', `/api/credit-coupons/${couponNo}`, null, token);
  const currentRemaining = checkRes.data?.data?.amount || 0;
  console.log(`  Current coupon remaining balance: ₹${currentRemaining}`);

  if (currentRemaining > 0) {
    // Launch 3 simultaneous requests trying to each spend the full remaining balance
    console.log(`  Firing 3 concurrent invoice creations each attempting to spend ₹${currentRemaining}...`);
    const promises = [1, 2, 3].map(i => request('POST', '/api/sales/invoices', {
      customer_name: 'Customer A',
      customer_mobile: '9876500001',
      total_mrp: currentRemaining,
      total_discount: 0,
      taxable_value: currentRemaining,
      total_gst: 0,
      net_payable: currentRemaining,
      amount_paid: currentRemaining,
      payment_mode: 'credit coupon',
      payment_details: [{ mode: 'credit coupon', amount: currentRemaining, reference: couponNo }],
      items: [{ design_no: `DN-CONCUR-${i}`, quantity: 1, mrp: currentRemaining, taxable_value: currentRemaining }]
    }, token));

    const results = await Promise.all(promises);
    const successful = results.filter(r => r.status === 200 || r.status === 201).length;
    console.log(`  Results: ${successful} out of 3 concurrent checkouts succeeded.`);
    if (successful > 1) {
      console.log('❌ [CRITICAL RACE CONDITION FOUND] Coupon Double-Spend:');
      console.log(`   ${successful} concurrent transactions spent the same ₹${currentRemaining} coupon balance!`);
    } else {
      console.log('  ✓ Concurrency lock serialized requests; only 1 transaction succeeded.');
    }
  }

  console.log('\n==================================================================');
  console.log('🏁 CREDIT COUPON TEST SUITE FINISHED');
  console.log('==================================================================\n');
}

runCouponTests().catch(console.error);
