import { AppDataSource } from '../config/data-source';
import { SalesInvoice } from '../entities/SalesInvoice';
import { SalesInvoiceItem } from '../entities/SalesInvoiceItem';
import { BarcodeBatch } from '../entities/BarcodeBatch';
import { Customer } from '../entities/Customer';
import { PurchaseOrder } from '../entities/PurchaseOrder';
import { SalesReturnItem } from '../entities/SalesReturnItem';
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

  async salesReport(filters: { startDate: string, endDate: string }) {
    const qb = AppDataSource.getRepository(SalesInvoice)
      .createQueryBuilder('si')
      .select([
        'COALESCE(SUM(si.net_payable), 0) as total_sales',
        'COALESCE(SUM(si.total_mrp), 0) as total_mrp',
        'COALESCE(SUM(CAST(si.total_discount AS NUMERIC) + CAST(si.voucher_discount AS NUMERIC)), 0) as total_discount',
        'COALESCE(SUM(si.total_gst), 0) as total_gst',
        'COALESCE(SUM(si.taxable_value), 0) as taxable_value',
        'COUNT(si.id) as invoice_count',
        'COALESCE(SUM(si.cgst_5), 0) as cgst_5',
        'COALESCE(SUM(si.sgst_5), 0) as sgst_5',
        'COALESCE(SUM(si.cgst_18), 0) as cgst_18',
        'COALESCE(SUM(si.sgst_18), 0) as sgst_18',
        'COALESCE(AVG(si.net_payable), 0) as avg_invoice_value',
      ])
      .where('si.invoice_date >= :start AND si.invoice_date <= :end', { 
        start: `${filters.startDate}T00:00:00.000Z`, 
        end: `${filters.endDate}T23:59:59.999Z` 
      });

    const result = await qb.getRawOne();
    
    // Convert string results to numbers to prevent frontend concatenation
    return {
      totalSales: parseFloat(result.total_sales),
      totalMRP: parseFloat(result.total_mrp),
      totalDiscount: parseFloat(result.total_discount),
      totalGST: parseFloat(result.total_gst),
      taxableValue: parseFloat(result.taxable_value),
      invoiceCount: parseInt(result.invoice_count),
      avgInvoiceValue: parseFloat(result.avg_invoice_value),
      cgst_5: parseFloat(result.cgst_5),
      sgst_5: parseFloat(result.sgst_5),
      cgst_18: parseFloat(result.cgst_18),
      sgst_18: parseFloat(result.sgst_18),
    };
  }

  async inventoryReport(filters: { vendorId?: string; floorId?: string } = {}) {
    const qb = AppDataSource.getRepository(BarcodeBatch)
      .createQueryBuilder('bb')
      .leftJoin('bb.product_group', 'pg')
      .select([
        'bb.barcode_alias_8digit as barcode',
        'bb.design_no as design',
        'bb.hsn_code as hsn_code',
        'pg.name as "productGroup"',
        'COALESCE(bb.available_quantity, 0) as "availableQty"',
        'COALESCE(bb.total_quantity - bb.available_quantity, 0) as "soldQty"',
        'COALESCE(bb.cost_actual, 0) as cost',
        'COALESCE(bb.mrp, 0) as mrp',
        'COALESCE(bb.available_quantity * bb.cost_actual, 0) as "inventoryValue"',
        'COALESCE(bb.available_quantity * (bb.mrp - bb.cost_actual), 0) as "potentialProfit"',
        'COALESCE((bb.total_quantity - bb.available_quantity) * (bb.mrp - bb.cost_actual), 0) as "soldProfit"'
      ]);

    qb.where('bb.status IN (:...statuses)', { statuses: ['active', 'Available', 'defective', 'Sold', 'Returned'] });

    if (filters.vendorId) {
      qb.andWhere('bb.vendor = :vendorId', { vendorId: filters.vendorId });
    }
    if (filters.floorId) {
      qb.andWhere('bb.floor = :floorId', { floorId: filters.floorId });
    }

    qb.orderBy('bb.design_no', 'ASC');

    const results = await qb.getRawMany();
    return results.map(r => ({
      ...r,
      availableQty: parseFloat(r.availableQty),
      soldQty: parseFloat(r.soldQty),
      cost: parseFloat(r.cost),
      mrp: parseFloat(r.mrp),
      inventoryValue: parseFloat(r.inventoryValue),
      potentialProfit: parseFloat(r.potentialProfit),
      soldProfit: parseFloat(r.soldProfit)
    }));
  }

  async salesmanReport(filters: any) {
    const startDate = filters.start_date || filters.startDate;
    const endDate = filters.end_date || filters.endDate;
    return this.salesmanPerformance(startDate, endDate);
  }

  async customerReport(limit: number = 100) {
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

    const results = await qb.getRawMany();
    return results.map(r => ({
      ...r,
      total_invoices: parseInt(r.total_invoices),
      total_spent: parseFloat(r.total_spent)
    }));
  }

  async floorwiseSalesReport(filters: { startDate: string, endDate: string }) {
    const qb = AppDataSource.getRepository(SalesInvoiceItem)
      .createQueryBuilder('sii')
      .innerJoin('sii.invoice', 'si')
      .leftJoin('sii.product_item', 'bb')
      .leftJoin('bb.floor', 'f')
      .select([
        'COALESCE(f.name, \'Unknown\') as floor',
        'COUNT(DISTINCT si.id) as "invoiceCount"',
        'COALESCE(SUM(sii.total_value), 0) as "totalSales"',
        'COALESCE(SUM(sii.discount), 0) as "totalDiscount"'
      ])
      .where('si.invoice_date >= :start AND si.invoice_date <= :end', { 
        start: `${filters.startDate}T00:00:00.000Z`, 
        end: `${filters.endDate}T23:59:59.999Z` 
      })
      .groupBy('f.name')
      .orderBy('"totalSales"', 'DESC');

    const results = await qb.getRawMany();
    return results.map(r => ({
      floor: r.floor,
      invoiceCount: parseInt(r.invoiceCount),
      totalSales: parseFloat(r.totalSales),
      totalDiscount: parseFloat(r.totalDiscount)
    }));
  }

  async purchaseReport(filters: { startDate: string, endDate: string, vendorId?: string }) {
    const qb = AppDataSource.getRepository(PurchaseOrder)
      .createQueryBuilder('po')
      .select([
        'COALESCE(SUM(po.total_amount), 0) as total_purchase',
        'COALESCE(SUM(po.total_items), 0) as total_items',
        'COALESCE(SUM(po.total_amount - po.taxable_value - COALESCE(po.ledger_freight, 0)), 0) as total_gst',
        'COUNT(po.id) as po_count',
        'COALESCE(AVG(po.total_amount), 0) as avg_po_value',
      ])
      .where('po.order_date >= :start AND po.order_date <= :end', { 
        start: `${filters.startDate}T00:00:00.000Z`, 
        end: `${filters.endDate}T23:59:59.999Z` 
      })
      .andWhere('po.status != :status', { status: 'Pending' });

    if (filters.vendorId) {
      qb.andWhere('po.vendor_id = :vendorId', { vendorId: filters.vendorId });
    }

    const result = await qb.getRawOne();

    return {
      totalPurchase: parseFloat(result.total_purchase),
      totalItems: parseFloat(result.total_items),
      totalGST: parseFloat(result.total_gst),
      poCount: parseInt(result.po_count),
      avgPOValue: parseFloat(result.avg_po_value),
    };
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
    // 1. Get Sales
    const salesQb = AppDataSource.getRepository(SalesInvoiceItem)
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
      .groupBy('sii.salesman_id');

    const salesData = await salesQb.getRawMany();

    // 2. Get Returns
    const returnsQb = AppDataSource.getRepository(SalesReturnItem)
      .createQueryBuilder('sri')
      .innerJoin('sri.salesReturn', 'sr')
      .select([
        'sri.salesman_id as salesman_id',
        'COALESCE(SUM(sri.return_amount), 0) as total_returns',
        'COUNT(*) as return_items_count',
      ])
      .where('sr.return_date >= :start AND sr.return_date <= :end', { start: startDate, end: endDate })
      .andWhere('sri.salesman_id IS NOT NULL')
      .groupBy('sri.salesman_id');

    const returnsData = await returnsQb.getRawMany();

    // 3. Combine
    const performanceMap = new Map<string, any>();

    // Initialize with sales
    for (const s of salesData) {
      performanceMap.set(s.salesman_id, {
        salesman_id: s.salesman_id,
        invoice_count: parseInt(s.invoice_count),
        total_sales: parseFloat(s.total_sales),
        items_sold: parseInt(s.items_sold),
        total_returns: 0,
        return_items_count: 0,
        net_sales: parseFloat(s.total_sales),
        net_items: parseInt(s.items_sold)
      });
    }

    // Subtract returns
    for (const r of returnsData) {
      if (!performanceMap.has(r.salesman_id)) {
        performanceMap.set(r.salesman_id, {
          salesman_id: r.salesman_id,
          invoice_count: 0,
          total_sales: 0,
          items_sold: 0,
          total_returns: parseFloat(r.total_returns),
          return_items_count: parseInt(r.return_items_count),
          net_sales: -parseFloat(r.total_returns),
          net_items: -parseInt(r.return_items_count)
        });
      } else {
        const p = performanceMap.get(r.salesman_id);
        p.total_returns = parseFloat(r.total_returns);
        p.return_items_count = parseInt(r.return_items_count);
        p.net_sales = p.total_sales - p.total_returns;
        p.net_items = p.items_sold - p.return_items_count;
      }
    }

    return Array.from(performanceMap.values()).sort((a, b) => b.net_sales - a.net_sales);
  }
 
  async profitabilityReport(filters: { startDate: string, endDate: string }) {
    const qb = AppDataSource.getRepository(SalesInvoiceItem)
      .createQueryBuilder('sii')
      .innerJoin('sii.invoice', 'si')
      .leftJoin(BarcodeBatch, 'bb', 'bb.barcode_alias_8digit = sii.barcode_8digit')
      .select([
        'si.invoice_number as invoice_number',
        'si.invoice_date as invoice_date',
        'si.customer_name as customer_name',
        'si.id as invoice_id',
        'sii.barcode_8digit as barcode',
        'sii.design_no as design_no',
        'sii.product_description as product_description',
        'sii.quantity as quantity',
        'COALESCE(bb.cost_actual, 0) as cost',
        'sii.mrp as mrp',
        'sii.discount as discount',
        'sii.selling_price as revenue'
      ])
      .where('si.invoice_date >= :start AND si.invoice_date <= :end', { 
        start: `${filters.startDate}T00:00:00.000Z`, 
        end: `${filters.endDate}T23:59:59.999Z` 
      });

    const items = await qb.getRawMany();

    let totalRevenue = 0;
    let totalCost = 0;
    let totalMRP = 0;
    let totalDiscount = 0;
    let totalQuantitySold = 0;

    const details = items.map(item => {
      const quantity = parseFloat(item.quantity) || 0;
      const cost = parseFloat(item.cost) || 0;
      const revenue = parseFloat(item.revenue) || 0;
      const mrp = parseFloat(item.mrp) || 0;
      const discount = parseFloat(item.discount) || 0;
      const itemCost = cost * quantity;
      const profit = revenue - itemCost;
      const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;

      totalRevenue += revenue;
      totalCost += itemCost;
      totalMRP += mrp;
      totalDiscount += discount;
      totalQuantitySold += quantity;

      return {
        ...item,
        quantity,
        cost,
        revenue,
        mrp,
        discount,
        totalCost: itemCost,
        profit,
        profitMargin
      };
    });

    return {
      summary: {
        totalRevenue,
        totalCost,
        grossProfit: totalRevenue - totalCost,
        profitMargin: totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0,
        totalMRP,
        totalDiscount,
        itemsSold: totalQuantitySold
      },
      details
    };
  }
 
  async topSellingReport(filters: { startDate: string, endDate: string }) {
    const qb = AppDataSource.getRepository(SalesInvoiceItem)
      .createQueryBuilder('sii')
      .innerJoin('sii.invoice', 'si')
      .leftJoin(BarcodeBatch, 'bb', 'bb.barcode_alias_8digit = sii.barcode_8digit')
      .leftJoin('bb.product_group', 'pg')
      .select([
        'sii.barcode_8digit as barcode',
        'sii.design_no as design',
        'COALESCE(pg.name, \'N/A\') as "productGroup"',
        'SUM(sii.quantity) as quantity',
        'SUM(sii.selling_price) as revenue',
        'AVG(sii.mrp) as mrp'
      ])
      .where('si.invoice_date >= :start AND si.invoice_date <= :end', { 
        start: `${filters.startDate}T00:00:00.000Z`, 
        end: `${filters.endDate}T23:59:59.999Z` 
      })
      .groupBy('sii.barcode_8digit')
      .addGroupBy('sii.design_no')
      .addGroupBy('pg.name')
      .orderBy('quantity', 'DESC')
      .limit(100);

    const results = await qb.getRawMany();
    return results.map(r => ({
      ...r,
      quantity: parseFloat(r.quantity),
      revenue: parseFloat(r.revenue),
      mrp: parseFloat(r.mrp)
    }));
  }
 
  async slowMovingReport(days: number = 30) {
    const cutOffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const qb = AppDataSource.getRepository(BarcodeBatch)
      .createQueryBuilder('bb')
      .leftJoin('bb.product_group', 'pg')
      .leftJoin('bb.vendor', 'v')
      .select([
        'bb.barcode_alias_8digit as barcode',
        'bb.design_no as design',
        'COALESCE(pg.name, \'N/A\') as "productGroup"',
        'COALESCE(v.name, \'N/A\') as vendor',
        'bb.available_quantity as "availableQty"',
        'bb.cost_actual as cost',
        'bb.mrp as mrp',
        '(bb.available_quantity * bb.cost_actual) as "inventoryValue"',
        '(EXTRACT(EPOCH FROM (NOW() - bb.created_at)) / 86400)::int as "daysInStock"'
      ])
      .where('bb.status = :status', { status: 'active' })
      .andWhere('bb.available_quantity > 0')
      .andWhere('bb.created_at <= :date', { date: cutOffDate })
      .orderBy('bb.created_at', 'ASC')
      .limit(100);

    const results = await qb.getRawMany();
    return results.map(r => ({
      ...r,
      availableQty: parseFloat(r.availableQty),
      cost: parseFloat(r.cost),
      mrp: parseFloat(r.mrp),
      inventoryValue: parseFloat(r.inventoryValue)
    }));
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
