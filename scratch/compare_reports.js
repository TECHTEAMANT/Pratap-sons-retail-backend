const jwt = require('jsonwebtoken');

const token = jwt.sign({ id: 'dummy', role: 'Admin' }, 'pratapsons');

async function test() {
  const start = '2026-06-01T00:00:00.000Z';
  const end = '2026-06-04T23:59:59.999Z';

  const res1 = await fetch(`http://localhost:3000/api/reports/payment-mode-report?startDate=${start}&endDate=${end}`, { headers: { Authorization: `Bearer ${token}` } });
  const data1 = await res1.json();
  console.log('--- Payment Mode Report ---');
  console.log(data1);

  const res2 = await fetch(`http://localhost:3000/api/reports/tally-payload-audit?startDate=${start}&endDate=${end}`, { headers: { Authorization: `Bearer ${token}` } });
  const data2 = await res2.json();
  console.log('--- Tally Payload Audit ---');
  console.log(JSON.stringify(data2, null, 2));
}

test().catch(console.error);
