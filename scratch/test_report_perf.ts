import { AppDataSource } from '../src/config/data-source';
import { SalesInvoice } from '../src/entities/SalesInvoice';
import { SalesInvoiceItem } from '../src/entities/SalesInvoiceItem';

async function testSalesReportOptimization() {
  await AppDataSource.initialize();
  console.log('Database connected.');

  const startDate = '2026-04-01';
  const endDate = '2026-04-30';

  console.time('Old Way Aggregation');
  // Simulating the logic in report.service.ts
  const qbOld = AppDataSource.getRepository(SalesInvoice)
    .createQueryBuilder('si')
    .leftJoinAndSelect('si.items', 'items')
    .leftJoinAndSelect('items.product_item', 'bb')
    .leftJoinAndSelect('si.receipt_items', 'ri')
    .leftJoinAndSelect('ri.receipt', 'receipt')
    .leftJoinAndSelect('si.sales_returns', 'sr')
    .leftJoinAndSelect('si.coupon_applications', 'ca')
    .leftJoinAndSelect('si.advance_applications', 'aa')
    .leftJoinAndSelect('si.credit_note_applications', 'cna')
    .leftJoinAndSelect('si.salesman', 'salesman')
    .where('si.invoice_date BETWEEN :start AND :end', { start: startDate, end: endDate });
  
  const invoices = await qbOld.getMany();
  console.log(`Fetched ${invoices.length} invoices.`);
  console.timeEnd('Old Way Aggregation');

  console.time('New SQL Aggregation');
  const summary = await AppDataSource.getRepository(SalesInvoice)
    .createQueryBuilder('si')
    .select([
      'SUM(si.net_payable) as "totalSales"',
      'SUM(si.total_gst) as "totalGST"',
      'SUM(si.taxable_value) as "taxableValue"',
      'SUM(si.total_discount) as "totalDiscount"',
      'COUNT(si.id) as "invoiceCount"'
    ])
    .where('si.invoice_date BETWEEN :start AND :end', { start: startDate, end: endDate })
    .getRawOne();
  console.log('Summary Result:', summary);
  console.timeEnd('New SQL Aggregation');

  await AppDataSource.destroy();
}

testSalesReportOptimization().catch(console.error);
