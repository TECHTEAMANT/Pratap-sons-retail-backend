import { AppDataSource } from '../src/config/data-source';
import { SalesService } from '../src/services/sales.service';

async function check() {
  await AppDataSource.initialize();
  const salesService = new SalesService();
  
  // Simulate the frontend search for mobile 9829059005
  console.log('--- Calling SalesService.getInvoices ---');
  const result = await salesService.getInvoices({ 
    search: '9829059005',
    status: 'pending,partial',
    limit: 10
  });
  
  console.log('Result Count:', result.data.length);
  result.data.forEach((inv: any) => {
    console.log(`Invoice: ${inv.invoice_number}`);
    console.log(`- Stored Status: ${inv.payment_status}`);
    console.log(`- Calculated Net: ${inv.net_payable}`);
    console.log(`- Calculated Paid: ${inv.amount_paid}`);
    console.log(`- Calculated Pending: ${inv.amount_pending}`);
    console.log(`- Header Disc (Stored): Special=${inv.special_discount}, Voucher=${inv.voucher_discount}`);
    console.log(`- Total Disc (Stored): ${inv.total_discount}`);
  });
  
  await AppDataSource.destroy();
}

check();
