import { AppDataSource } from '../config/data-source';
import { SalesInvoice } from '../entities/SalesInvoice';
import { SalesInvoiceItem } from '../entities/SalesInvoiceItem';
import { BarcodeBatch } from '../entities/BarcodeBatch';
import { Customer } from '../entities/Customer';
import { PurchaseOrder } from '../entities/PurchaseOrder';
import { Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';

export class ReportService {
  // Daily Sales Report
  async dailySales(date: string) {
    const invoices = await AppDataSource.getRepository(SalesInvoice).find({
      where: { invoice_date: new Date(date) as any },
      relations: ['items'],
      order: { created_at: 'ASC' },
    });

    const totalSales = invoices.reduce((sum, inv) => sum + Number(inv.net_payable), 0);
    const totalInvoices = invoices.length;

    return {
      date,
      total_sales: totalSales,
      total_invoices: totalInvoices,
      invoices,
    };
  }

  // Monthly Sales Summary
  async monthlySales(year: number, month: number) {
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    const qb = AppDataSource.getRepository(SalesInvoice)
      .createQueryBuilder('si')
      .select([
        'DATE(si.invoice_date) as date',
        'COUNT(*) as invoice_count',
        'COALESCE(SUM(si.net_payable), 0) as total_sales',
        'COALESCE(SUM(si.total_gst), 0) as total_gst',
      ])
      .where('si.invoice_date >= :start AND si.invoice_date <= :end', { start: startDate, end: endDate })
      .groupBy('DATE(si.invoice_date)')
      .orderBy('date', 'ASC');

    const result = await qb.getRawMany();
    return { year, month, days: result };
  }

  // Inventory Stock Value Report
  async stockValue() {
    const qb = AppDataSource.getRepository(BarcodeBatch)
      .createQueryBuilder('bb')
      .select([
        'bb.product_group as product_group',
        'COUNT(*) as total_skus',
        'COALESCE(SUM(bb.available_quantity), 0) as total_pieces',
        'COALESCE(SUM(bb.available_quantity * bb.mrp), 0) as mrp_value',
        'COALESCE(SUM(bb.available_quantity * bb.cost_actual), 0) as cost_value',
      ])
      .where('bb.status = :status', { status: 'active' })
      .groupBy('bb.product_group')
      .orderBy('mrp_value', 'DESC');

    const groupData = await qb.getRawMany();

    const totals = groupData.reduce((acc, g) => ({
      total_skus: acc.total_skus + parseInt(g.total_skus),
      total_pieces: acc.total_pieces + parseInt(g.total_pieces),
      mrp_value: acc.mrp_value + parseFloat(g.mrp_value),
      cost_value: acc.cost_value + parseFloat(g.cost_value),
    }), { total_skus: 0, total_pieces: 0, mrp_value: 0, cost_value: 0 });

    return { groups: groupData, totals };
  }

  async salesReport(filters: any) {
    // TODO: Implement sales report
    return { message: 'Sales report not implemented yet' };
  }

  async inventoryReport() {
    // TODO: Implement inventory report
    return { message: 'Inventory report not implemented yet' };
  }

  async salesmanReport(filters: any) {
    // TODO: Implement salesman report
    return { message: 'Salesman report not implemented yet' };
  }

  async customerReport() {
    // TODO: Implement customer report
    return { message: 'Customer report not implemented yet' };
  }

  async purchaseReport(filters: any) {
    // TODO: Implement purchase report
    return { message: 'Purchase report not implemented yet' };
  }

  // GST Report
  async gstReport(startDate: string, endDate: string) {
    const qb = AppDataSource.getRepository(SalesInvoice)
      .createQueryBuilder('si')
      .select([
        'COALESCE(SUM(si.taxable_value), 0) as total_taxable',
        'COALESCE(SUM(si.cgst_5), 0) as total_cgst_5',
        'COALESCE(SUM(si.sgst_5), 0) as total_sgst_5',
        'COALESCE(SUM(si.cgst_18), 0) as total_cgst_18',
        'COALESCE(SUM(si.sgst_18), 0) as total_sgst_18',
        'COALESCE(SUM(si.igst_5), 0) as total_igst_5',
        'COALESCE(SUM(si.igst_18), 0) as total_igst_18',
        'COALESCE(SUM(si.total_gst), 0) as total_gst',
        'COALESCE(SUM(si.net_payable), 0) as total_sales',
      ])
      .where('si.invoice_date >= :start AND si.invoice_date <= :end', { start: startDate, end: endDate });

    const result = await qb.getRawOne();
    return { startDate, endDate, ...result };
  }

  // Salesman Performance
  async salesmanPerformance(startDate: string, endDate: string) {
    const qb = AppDataSource.getRepository(SalesInvoiceItem)
      .createQueryBuilder('sii')
      .innerJoin('sii.invoice', 'si')
      .select([
        'sii.salesman_id as salesman_id',
        'COUNT(DISTINCT si.id) as invoice_count',
        'COALESCE(SUM(sii.total_value), 0) as total_sales',
        'COUNT(*) as items_sold',
      ])
      .where('si.invoice_date >= :start AND si.invoice_date <= :end', { start: startDate, end: endDate })
      .andWhere('sii.salesman_id IS NOT NULL')
      .groupBy('sii.salesman_id')
      .orderBy('total_sales', 'DESC');

    return qb.getRawMany();
  }

  // Customer Lifetime Value
  async customerLifetimeValue(limit: number = 50) {
    const qb = AppDataSource.getRepository(SalesInvoice)
      .createQueryBuilder('si')
      .select([
        'si.customer_mobile as customer_mobile',
        'si.customer_name as customer_name',
        'COUNT(*) as total_invoices',
        'COALESCE(SUM(si.net_payable), 0) as total_spent',
        'MIN(si.invoice_date) as first_purchase',
        'MAX(si.invoice_date) as last_purchase',
      ])
      .where('si.customer_mobile IS NOT NULL')
      .groupBy('si.customer_mobile')
      .addGroupBy('si.customer_name')
      .orderBy('total_spent', 'DESC')
      .limit(limit);

    return qb.getRawMany();
  }

  // Purchase Summary
  async purchaseSummary(startDate: string, endDate: string) {
    const qb = AppDataSource.getRepository(PurchaseOrder)
      .createQueryBuilder('po')
      .leftJoin('po.vendor', 'v')
      .select([
        'v.name as vendor_name',
        'COUNT(*) as total_orders',
        'COALESCE(SUM(po.total_amount), 0) as total_amount',
      ])
      .where('po.order_date >= :start AND po.order_date <= :end', { start: startDate, end: endDate })
      .groupBy('v.name')
      .orderBy('total_amount', 'DESC');

    return qb.getRawMany();
  }
}

export const reportService = new ReportService();
