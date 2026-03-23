import { AppDataSource } from '../config/data-source';
import { SalesInvoice } from '../entities/SalesInvoice';
import { SalesInvoiceItem } from '../entities/SalesInvoiceItem';
import { BarcodeBatch } from '../entities/BarcodeBatch';
import { Customer } from '../entities/Customer';
import { PurchaseOrder } from '../entities/PurchaseOrder';
import { SalesReturn } from '../entities/SalesReturn';
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
    const invoices = await AppDataSource.getRepository(SalesInvoice)
      .createQueryBuilder('si')
      .leftJoinAndSelect('si.items', 'items')
      .where('si.invoice_date >= :start AND si.invoice_date <= :end', { 
        start: `${filters.startDate}T00:00:00.000Z`, 
        end: `${filters.endDate}T23:59:59.999Z` 
      })
      .getMany();

    const result = {
      totalSales: 0,
      totalMRP: 0,
      totalDiscount: 0,
      totalGST: 0,
      taxableValue: 0,
      invoiceCount: invoices.length,
      cgst_5: 0,
      sgst_5: 0,
      cgst_18: 0,
      sgst_18: 0,
      paymentBreakdown: {
        Cash: 0,
        UPI: 0,
        Card: 0,
        Online: 0,
        Approval: 0,
        'Credit Coupon': 0,
        Others: 0
      },
      approvalItemCount: 0
    };

    invoices.forEach(inv => {
      result.totalSales += parseFloat(inv.net_payable as any) || 0;
      result.totalMRP += parseFloat(inv.total_mrp as any) || 0;
      result.totalDiscount += (parseFloat(inv.total_discount as any) || 0) + (parseFloat(inv.voucher_discount as any) || 0);
      result.totalGST += parseFloat(inv.total_gst as any) || 0;
      result.taxableValue += parseFloat(inv.taxable_value as any) || 0;
      result.cgst_5 += parseFloat(inv.cgst_5 as any) || 0;
      result.sgst_5 += parseFloat(inv.sgst_5 as any) || 0;
      result.cgst_18 += parseFloat(inv.cgst_18 as any) || 0;
      result.sgst_18 += parseFloat(inv.sgst_18 as any) || 0;

      if (inv.payment_details && Array.isArray(inv.payment_details)) {
        let hasCreditCoupon = false;
        inv.payment_details.forEach((pd: any) => {
          const mode = pd.mode;
          const amount = parseFloat(pd.amount) || 0;
          if (mode === 'Cash') result.paymentBreakdown.Cash += amount;
          else if (mode === 'UPI') result.paymentBreakdown.UPI += amount;
          else if (mode === 'Card') result.paymentBreakdown.Card += amount;
          else if (mode === 'Online') result.paymentBreakdown.Online += amount;
          else if (mode === 'Approval') {
            // Only count approval as pending if the invoice itself is still pending
            const actualApprovalPending = Math.min(amount, Number(inv.amount_pending || 0));
            result.paymentBreakdown.Approval += actualApprovalPending;
          }
          else if (mode === 'Credit Coupon') { result.paymentBreakdown['Credit Coupon'] += amount; hasCreditCoupon = true; }
          else result.paymentBreakdown.Others += amount;
        });

        // Fallback: infer coupon amount for older invoices saved before auto-sync
        if (!hasCreditCoupon && (inv as any).coupon_no) {
          const totalMrp = parseFloat(inv.total_mrp as any) || 0;
          const totalDiscount = (parseFloat(inv.total_discount as any) || 0) + (parseFloat((inv as any).voucher_discount as any) || 0);
          const loyalty = parseFloat((inv as any).loyalty_redemption_amount as any) || 0;
          const netPayable = parseFloat(inv.net_payable as any) || 0;
          const inferredCoupon = totalMrp - totalDiscount - loyalty - netPayable;
          if (inferredCoupon > 0) result.paymentBreakdown['Credit Coupon'] += inferredCoupon;
        }
      } else {
        // Fallback to primary payment_mode if details missing
        const mode = inv.payment_mode || 'Others';
        const amount = parseFloat(inv.net_payable as any) || 0;
        if (mode === 'Cash') result.paymentBreakdown.Cash += amount;
        else if (mode === 'UPI') result.paymentBreakdown.UPI += amount;
        else if (mode === 'Card') result.paymentBreakdown.Card += amount;
        else if (mode === 'Online') result.paymentBreakdown.Online += amount;
        else if (mode === 'Approval') result.paymentBreakdown.Approval += amount;
        else if (mode === 'Credit Coupon') result.paymentBreakdown['Credit Coupon'] += amount;
        else result.paymentBreakdown.Others += amount;
      }

      if (inv.items && Number(inv.amount_pending || 0) > 0) {
        inv.items.forEach(item => {
          if (item.on_approval) {
            // Only count items as "on approval" if there is still a pending balance
            result.approvalItemCount += Number(item.quantity) || 0;
          }
        });
      }
    });

    return {
      ...result,
      avgInvoiceValue: result.invoiceCount > 0 ? result.totalSales / result.invoiceCount : 0
    };
  }

  async inventoryReport(filters: { vendorId?: string; floorId?: string } = {}) {
    // Determine GST rate and amount based on cost_actual and gst_logic
    // Logic: if AUTO_5_18 then (if cost < 2500 then 5% else 18%), else 5%
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
        'CASE WHEN bb.gst_logic = \'AUTO_5_18\' THEN (CASE WHEN bb.cost_actual < 2500 THEN 5 ELSE 18 END) ELSE 5 END as "gstRate"',
        'COALESCE(bb.available_quantity * bb.cost_actual, 0) as "inventoryValue"'
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
    return results.map(r => {
      const cost = parseFloat(r.cost);
      const mrp = parseFloat(r.mrp);
      const availableQty = parseFloat(r.availableQty);
      const soldQty = parseFloat(r.soldQty);
      const gstRate = parseFloat(r.gstRate);
      
      const purchaseGstAmount = (cost * gstRate) / 100;
      const landedCost = cost + purchaseGstAmount;
      const actualProfitPerUnit = mrp - landedCost;

      return {
        ...r,
        availableQty,
        soldQty,
        cost,
        mrp,
        gstRate,
        purchaseGstAmount,
        landedCost,
        inventoryValue: parseFloat(r.inventoryValue),
        potentialProfit: availableQty * actualProfitPerUnit,
        soldProfit: soldQty * actualProfitPerUnit
      };
    });
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

  // Sales Return Report
  async salesReturnReport(filters: { startDate: string, endDate: string }) {
    const qb = AppDataSource.getRepository(SalesReturn)
      .createQueryBuilder('sr')
      .leftJoin('sr.salesman', 's')
      .leftJoin('sr.invoice', 'si')
      .select([
        'sr.id as id',
        'sr.return_number as return_number',
        'sr.return_date as return_date',
        'sr.invoice_number as invoice_number',
        'sr.customer_name as customer_name',
        'sr.customer_mobile as customer_mobile',
        'sr.total_return_amount as total_return_amount',
        'sr.return_reason as return_reason',
        'sr.status as status',
        's.name as salesman_name',
        'sr.credit_coupon_no as credit_coupon_no',
        'sr.credit_note_number as credit_note_number'
      ])
      .where('sr.return_date >= :start AND sr.return_date <= :end', { 
        start: `${filters.startDate}T00:00:00.000Z`, 
        end: `${filters.endDate}T23:59:59.999Z` 
      })
      .orderBy('sr.return_date', 'DESC');

    const details = await qb.getRawMany();

    const summary = details.reduce((acc, d) => ({
      totalReturnAmount: acc.totalReturnAmount + parseFloat(d.total_return_amount),
      returnCount: acc.returnCount + 1,
    }), { totalReturnAmount: 0, returnCount: 0 });

    return { summary, details };
  }
}

export const reportService = new ReportService();
