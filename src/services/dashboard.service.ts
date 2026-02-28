import { AppDataSource } from '../config/data-source';
import { SalesInvoice } from '../entities/SalesInvoice';
import { Customer } from '../entities/Customer';
import { BarcodeBatch } from '../entities/BarcodeBatch';

export class DashboardService {
  async getStats() {
    const today = new Date().toISOString().split('T')[0];

    const [todaySales, invoiceCount, availableItems, totalCustomers] = await Promise.all([
      AppDataSource.getRepository(SalesInvoice)
        .createQueryBuilder('si')
        .select('COALESCE(SUM(si.net_payable), 0)', 'total')
        .where('si.invoice_date = :today', { today })
        .getRawOne(),

      AppDataSource.getRepository(SalesInvoice)
        .createQueryBuilder('si')
        .where('si.invoice_date = :today', { today })
        .getCount(),

      AppDataSource.getRepository(BarcodeBatch)
        .createQueryBuilder('bb')
        .select('COALESCE(SUM(bb.available_quantity), 0)', 'total')
        .where('bb.status = :status', { status: 'active' })
        .getRawOne(),

      AppDataSource.getRepository(Customer).count(),
    ]);

    return {
      today_sales: parseFloat(todaySales?.total || '0'),
      today_invoice_count: invoiceCount,
      available_items: parseInt(availableItems?.total || '0', 10),
      total_customers: totalCustomers,
    };
  }
}

export const dashboardService = new DashboardService();
