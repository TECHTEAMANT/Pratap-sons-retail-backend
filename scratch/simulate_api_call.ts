import { salesService } from '../src/services/sales.service';
import { AppDataSource } from '../src/config/data-source';

async function check() {
  await AppDataSource.initialize();
  
  console.log('Simulating API call: GET /api/sales/invoices?search=9799861147&status=pending,partial');
  
  const result = await salesService.getInvoices({
    search: '9799861147',
    status: 'pending,partial',
    limit: 100
  });
  
  console.log(`\nFound ${result.total} invoices.`);
  result.data.forEach((inv: any) => {
    console.log(`\nInvoice: ${inv.invoice_number}`);
    console.log(`Status: ${inv.payment_status}`);
    console.log(`Net Payable: ${inv.net_payable}`);
    console.log(`Amount Paid: ${inv.amount_paid}`);
    console.log(`Amount Pending: ${inv.amount_pending}`);
  });
  
  await AppDataSource.destroy();
}

check();
