async function runTests() {
  const BASE_URL = 'http://localhost:3000/api';
  let authToken = '';

  async function makeRequest(method, endpoint, body = null, useAuth = true) {
    const headers = { 'Content-Type': 'application/json' };
    if (useAuth && authToken) headers['Authorization'] = `Bearer ${authToken}`;

    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        method, headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.message || data?.error || `HTTP error! status: ${response.status}`);
      }
      return data;
    } catch (e) {
      throw e;
    }
  }

  async function test(name, fn) {
    process.stdout.write(`Testing ${name.padEnd(60, '.')} `);
    try {
      const resData = await fn();
      if (resData && resData !== false) {
        console.log('✅ PASSED');
        return true;
      }
      console.log(`❌ FAILED (Assertion returned false or undefined. Result: ${JSON.stringify(resData)})`);
      return false;
    } catch (err) {
      console.log(`❌ FAILED (${err.message})`);
      return false;
    }
  }

  console.log('🚀 Starting Comprehensive Backend API Integration Tests...\n');
  const shared = {};

  // ==========================================
  // 1. AUTHENTICATION & USERS
  // ==========================================
  console.log('--- AUTHENTICATION & SECURITY ---');
  const authPassed = await test('POST /auth/login', async () => {
    const res = await makeRequest('POST', '/auth/login', { mobile: '9999999999', password: 'admin123' }, false);
    if (res?.data?.token) {
      authToken = res.data.token;
      return true;
    }
    return false;
  });

  if (!authPassed) return console.log('\n🛑 Stopping tests: Authentication failed.');

  await test('GET /auth/me', async () => {
    const res = await makeRequest('GET', '/auth/me');
    return res?.data?.mobile === '9999999999';
  });

  await test('POST /roles (Create)', async () => {
    const res = await makeRequest('POST', '/roles', {
      name: `Test Role ${Date.now()}`,
      description: 'API Test Role',
      can_view_cost: true, can_view_mrp: true
    });
    shared.roleId = res?.data?.id;
    return !!shared.roleId;
  });

  await test('GET /roles (List)', async () => {
    const res = await makeRequest('GET', '/roles');
    return Array.isArray(res?.data) && res.data.length > 0;
  });

  await test('POST /users (Create)', async () => {
    const res = await makeRequest('POST', '/users', {
      mobile: `99${Date.now().toString().slice(-8)}`,
      password: 'testpassword',
      name: 'Test Setup User',
      role_id: shared.roleId
    });
    shared.userId = res?.data?.id;
    return !!shared.userId;
  });

  await test('GET /users (List)', async () => {
    const res = await makeRequest('GET', '/users');
    return Array.isArray(res?.data) && res.data.length > 0;
  });

  // ==========================================
  // 2. MASTER DATA (Cities, Vendors, Groups, etc)
  // ==========================================
  console.log('\n--- MASTER DATA ---');
  await test('POST /masters/cities', async () => {
    const res = await makeRequest('POST', '/masters/cities', { city_code: `CT${Date.now().toString(36)}`, name: 'Demo City', state: 'Demo State', active: true });
    shared.cityId = res?.data?.id; return !!shared.cityId;
  });

  await test('POST /masters/vendors', async () => {
    const res = await makeRequest('POST', '/masters/vendors', { city_id: shared.cityId, vendor_code: `V${Date.now().toString(36)}`, name: 'Demo Vendor', address: 'Demo Addr' });
    shared.vendorId = res?.data?.id; return !!shared.vendorId;
  });

  await test('POST /masters/product-groups', async () => {
    const res = await makeRequest('POST', '/masters/product-groups', { group_code: `PG${Date.now().toString(36)}`, name: 'Demo Group', hsn_code: '123', tax_percentage: 5, is_fabric: false });
    shared.groupId = res?.data?.id; return !!shared.groupId;
  });

  await test('POST /masters/sizes', async () => {
    const res = await makeRequest('POST', '/masters/sizes', { size_code: `S${Date.now().toString(36)}`, name: 'Large', order_index: 1 });
    shared.sizeId = res?.data?.id; return !!shared.sizeId;
  });

  await test('POST /masters/colors', async () => {
    const res = await makeRequest('POST', '/masters/colors', { color_code: `C${Date.now().toString(36)}`, name: 'Red' });
    shared.colorId = res?.data?.id; return !!shared.colorId;
  });

  await test('POST /masters/floors', async () => {
    const res = await makeRequest('POST', '/masters/floors', { floor_code: `F${Date.now().toString(36)}`, name: 'Ground Floor' });
    shared.floorId = res?.data?.id; return !!shared.floorId;
  });

  await test('POST /masters/product-masters', async () => {
    const res = await makeRequest('POST', '/masters/product-masters', { group_id: shared.groupId, item_name: 'Test Garment', design_no: `D${Date.now()}`, vendor_id: shared.vendorId });
    shared.productMasterId = res?.data?.id; return !!shared.productMasterId;
  });

  // ==========================================
  // 3. CORE ENTITIES (Inventory, Customers)
  // ==========================================
  console.log('\n--- CORE ENTITIES (Inventory/Customers) ---');
  await test('POST /customers', async () => {
    const res = await makeRequest('POST', '/customers', { mobile: `9${Date.now().toString().slice(-9)}`, name: 'Test Customer' });
    shared.customerId = res?.data?.id; return !!shared.customerId;
  });

  await test('POST /inventory', async () => {
    const res = await makeRequest('POST', '/inventory', {
      product_master_id: shared.productMasterId,
      vendor_id: shared.vendorId,
      color_id: shared.colorId,
      size_id: shared.sizeId,
      barcode: `B${Date.now()}`,
      cost_price: 100,
      mrp: 200,
      quantity: 50
    });
    const inv = Array.isArray(res?.data) ? res.data[0] : res.data;
    shared.inventoryId = inv?.id;
    shared.barcode = inv?.barcode;
    return !!shared.inventoryId;
  });

  await test('GET /inventory', async () => {
    const res = await makeRequest('GET', '/inventory');
    return Array.isArray(res?.data) && res.data.length > 0;
  });

  await test('GET /inventory/search (by barcode)', async () => {
    const res = await makeRequest('GET', `/inventory/search?q=${shared.barcode}`);
    return Array.isArray(res?.data);
  });

  await test('PUT /inventory/:id/floor', async () => {
    const res = await makeRequest('PUT', `/inventory/${shared.inventoryId}/floor`, { floor_id: shared.floorId });
    return res?.data?.floor === shared.floorId || !!res?.success;
  });

  await test('PUT /inventory/:id/adjust-quantity', async () => {
    const res = await makeRequest('PUT', `/inventory/${shared.inventoryId}/adjust-quantity`, {
      adjustment: 10,
      reason: 'API Testing Add 10'
    });
    return !!res?.success;
  });

  // ==========================================
  // 4. SALES JOURNEY
  // ==========================================
  console.log('\n--- SALES PROCESSING ---');
  await test('POST /sales-orders', async () => {
    const res = await makeRequest('POST', '/sales-orders', {
      customer_id: shared.customerId,
      order_date: new Date().toISOString().split('T')[0],
      total_amount: 200,
      advance_amount: 50,
      status: 'pending',
      items: [{ inventory_id: shared.inventoryId, quantity: 1, rate: 200, amount: 200 }]
    });
    shared.salesOrderId = res?.data?.id; return !!shared.salesOrderId;
  });

  await test('POST /sales/invoices', async () => {
    const res = await makeRequest('POST', '/sales/invoices', {
      customer_id: shared.customerId,
      invoice_date: new Date().toISOString().split('T')[0],
      total_amount: 200,
      payment_method: 'cash',
      items: [{ inventory_id: shared.inventoryId, quantity: 1, mrp: 200, rate: 200, amount: 200 }]
    });
    shared.salesInvoiceId = res?.data?.invoice?.id || res?.data?.id; return !!shared.salesInvoiceId;
  });

  await test('POST /sales-returns', async () => {
    const res = await makeRequest('POST', '/sales-returns', {
      invoice_id: shared.salesInvoiceId,
      customer_id: shared.customerId,
      return_date: new Date().toISOString().split('T')[0],
      total_amount: 200,
      refund_method: 'cash',
      reason: 'Testing Return',
      items: [{ inventory_id: shared.inventoryId, quantity: 1, rate: 200, amount: 200 }]
    });
    return !!res?.data?.id;
  });

  // ==========================================
  // 5. PURCHASING JOURNEY
  // ==========================================
  console.log('\n--- PURCHASE PROCESSING ---');
  await test('POST /purchases/orders', async () => {
    const res = await makeRequest('POST', '/purchases/orders', {
      vendor_id: shared.vendorId,
      vendor: shared.vendorId,
      order_date: new Date().toISOString().split('T')[0],
      expected_date: new Date().toISOString().split('T')[0],
      total_amount: 1000,
      status: 'pending',
      items: [{ product_master_id: shared.productMasterId, quantity: 10, rate: 100, amount: 1000 }]
    });
    shared.purchaseOrderId = res?.data?.id; return !!shared.purchaseOrderId;
  });

  await test('POST /purchases/invoices', async () => {
    const res = await makeRequest('POST', '/purchases/invoices', {
      vendor_id: shared.vendorId,
      vendor: shared.vendorId,
      invoice_number: `INV-${Date.now()}`,
      invoice_date: new Date().toISOString().split('T')[0],
      total_amount: 1000,
      payment_status: 'pending',
      items: [{ product_master_id: shared.productMasterId, quantity: 10, rate: 100, amount: 1000 }]
    });
    shared.purchaseInvoiceId = res?.data?.id; return !!shared.purchaseInvoiceId;
  });

  await test('POST /purchase-returns', async () => {
    const res = await makeRequest('POST', '/purchase-returns', {
      vendor_id: shared.vendorId,
      vendor: shared.vendorId,
      purchase_invoice_id: shared.purchaseInvoiceId,
      return_date: new Date().toISOString().split('T')[0],
      total_amount: 100,
      reason: 'Defective test',
      items: [{ product_master_id: shared.productMasterId, quantity: 1, rate: 100, amount: 100 }]
    });
    return !!res?.data?.id;
  });

  // ==========================================
  // 6. BOOKINGS AND PAYMENTS
  // ==========================================
  console.log('\n--- BOOKINGS & PAYMENTS ---');
  await test('POST /bookings', async () => {
    const res = await makeRequest('POST', '/bookings', {
      customer_id: shared.customerId,
      customer_mobile: `9${Date.now().toString().slice(-9)}`,
      barcode_8digit: '12345678',
      booking_date: new Date().toISOString().split('T')[0],
      total_amount: 500,
      advance_amount: 100,
      status: 'confirmed',
      items: [{ product_master_id: shared.productMasterId, quantity: 1, rate: 500, amount: 500 }]
    });
    shared.bookingId = res?.data?.id; return !!res?.success; // Bookings module may return varying structures
  });

  await test('POST /payments', async () => {
    const res = await makeRequest('POST', '/payments', {
      customer_id: shared.customerId,
      invoice_id: shared.salesInvoiceId,
      invoice_number: `INV-${Date.now()}`,
      payment_date: new Date().toISOString().split('T')[0],
      amount_received: 100,
      amount: 100,
      payment_mode: 'upi',
      payment_method: 'upi',
      reference_number: 'TEST-UPI-123',
      payment_type: 'receipt'
    });
    return !!res?.success;
  });

  // ==========================================
  // 7. COMMISSIONS & DISCOUNTS
  // ==========================================
  console.log('\n--- COMMISSIONS & DISCOUNTS ---');
  await test('POST /discounts', async () => {
    const res = await makeRequest('POST', '/discounts', {
      discount_code: `DSC${Date.now().toString(36)}`,
      discount_name: 'Test Fest',
      flag_name: `FLAG_${Date.now()}`,
      discount_type: 'percentage',
      discount_value: 10,
      start_date: new Date().toISOString().split('T')[0],
      is_active: true,
      priority: 1
    });
    return !!res?.success;
  });

  await test('POST /commission/payout-codes', async () => {
    const res = await makeRequest('POST', '/commission/payout-codes', {
      payout_code: `PC${Date.now().toString(36)}`,
      payout_name: 'Sales Bonus',
      payout_type: 'Bonus',
      is_active: true
    });
    shared.payoutCodeId = res?.data?.id; return !!res?.success;
  });

  await test('POST /commission/slabs', async () => {
    const res = await makeRequest('POST', '/commission/slabs', {
      product_group_name: 'Demo Group',
      payout_code_id: shared.payoutCodeId,
      min_amount: 1000,
      commission_percentage: 2,
      flat_amount: 50,
      is_active: true
    });
    return !!res?.success;
  });

  // ==========================================
  // 8. DASHBOARD & REPORTS (GET ONLY)
  // ==========================================
  console.log('\n--- DASHBOARD & REPORTS ---');

  await test('GET /reports/sales', async () => {
    const today = new Date().toISOString().split('T')[0];
    const res = await makeRequest('GET', `/reports/sales?startDate=${today}&endDate=${today}`);
    return Array.isArray(res?.data) || !!res?.success;
  });

  await test('GET /reports/inventory', async () => {
    const res = await makeRequest('GET', '/reports/inventory');
    return Array.isArray(res?.data) || !!res?.success;
  });

  console.log('\n🎉 Finished comprehensive API testing sweep!');
}

runTests();
