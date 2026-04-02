import { AppDataSource } from '../config/data-source';
import { SalesInvoice } from '../entities/SalesInvoice';
import { SalesInvoiceItem } from '../entities/SalesInvoiceItem';
import { BarcodeBatch } from '../entities/BarcodeBatch';
import { Customer } from '../entities/Customer';
import { PurchaseOrder } from '../entities/PurchaseOrder';
import { SalesReturn } from '../entities/SalesReturn';
import { SalesReturnItem } from '../entities/SalesReturnItem';
import { SalesOrderAdvance } from '../entities/SalesOrderAdvance';
import { PaymentReceipt } from '../entities/PaymentReceipt';
import { Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import logger from '../utils/logger';

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
        start: `${filters.startDate.split('T')[0]}T00:00:00.000Z`, 
        end: `${filters.endDate.split('T')[0]}T23:59:59.999Z` 
      })
      .getMany();

    const result = {
      totalSales: 0,
      totalMRP: 0,
      totalDiscount: 0,
      totalGST: 0,
      taxableValue: 0,
      totalSpecialDiscount: 0,
      totalLoyalty: 0,
      totalVoucher: 0,
      totalPending: 0,
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
        'Exchange': 0,
        'Others': 0
      },
      approvalItemCount: 0,
      totalQuantity: 0,
      totalReturns: 0
    };

    const returns = await AppDataSource.getRepository(SalesReturn).find({
      where: {
        return_date: Between(
          new Date(`${filters.startDate.split('T')[0]}T00:00:00.000Z`),
          new Date(`${filters.endDate.split('T')[0]}T23:59:59.999Z`)
        )
      }
    });

    result.totalReturns = returns.reduce((sum, ret) => sum + (parseFloat(ret.total_return_amount as any) || 0), 0);

    invoices.forEach(inv => {
      // Robust Net Calculation for Summary Card Consistency
      const totalDisc = (parseFloat(inv.total_discount as any) || 0) + 
                       (parseFloat(inv.voucher_discount as any) || 0) + 
                       (parseFloat(inv.special_discount as any) || 0) + 
                       (parseFloat(inv.loyalty_redemption_amount as any) || 0) + 
                       (parseFloat((inv as any).coupon_amount as any) || 0);
      const calculatedNet = (parseFloat(inv.total_mrp as any) || 0) - totalDisc + (parseFloat(inv.additional_charges_total as any) || 0);
      const storedNet = parseFloat(inv.net_payable as any) || 0;
      const moneyPaidTotal = (parseFloat(inv.amount_paid as any) || 0) + (parseFloat(inv.amount_pending as any) || 0);
      // Unified Smart Net: Trust the actual financial intent (Payments + Pending) over inconsistent DB fields
      const finalNet = (moneyPaidTotal > 0) ? moneyPaidTotal : (storedNet > 0 ? storedNet : Math.max(Math.round(calculatedNet), 0));

      result.totalSales += finalNet;
      result.totalMRP += parseFloat(inv.total_mrp as any) || 0;
      result.totalDiscount += totalDisc;
      result.totalGST += parseFloat(inv.total_gst as any) || 0;
      result.taxableValue += parseFloat(inv.taxable_value as any) || 0;
      result.totalSpecialDiscount += parseFloat(inv.special_discount as any) || 0;
      result.totalLoyalty += parseFloat(inv.loyalty_redemption_amount as any) || 0;
      result.totalVoucher += parseFloat(inv.voucher_discount as any) || 0;
      
      const amountPending = parseFloat(inv.amount_pending as any) || 0;
      result.totalPending += amountPending;
      result.cgst_5 += parseFloat(inv.cgst_5 as any) || 0;
      result.sgst_5 += parseFloat(inv.sgst_5 as any) || 0;
      result.cgst_18 += parseFloat(inv.cgst_18 as any) || 0;
      result.sgst_18 += parseFloat(inv.sgst_18 as any) || 0;

      let paymentDetails = inv.payment_details;
      if (typeof paymentDetails === 'string') {
        try {
          paymentDetails = JSON.parse(paymentDetails);
        } catch (e: any) {
          logger.warn(`Failed to parse payment_details for invoice ${inv.invoice_number}: ${e.message}`);
          paymentDetails = null;
        }
      }

      let totalPaidFromDetails = 0;
      if (paymentDetails && Array.isArray(paymentDetails) && paymentDetails.length > 0) {
        let hasCreditCoupon = false;
        paymentDetails.forEach((pd: any) => {
          const mode = pd.mode;
          const amount = parseFloat(pd.amount) || 0;
          totalPaidFromDetails += amount;

          if (mode === 'Cash') result.paymentBreakdown.Cash += amount;
          else if (mode === 'UPI') result.paymentBreakdown.UPI += amount;
          else if (mode === 'Card') result.paymentBreakdown.Card += amount;
          else if (mode === 'Online' || mode === 'Bank Transfer') result.paymentBreakdown.Online += amount;
          else if (mode === 'Exchange') (result.paymentBreakdown as any).Exchange += amount;
          else if (mode === 'Approval') {
            const actualApprovalPending = Math.min(amount, Number(inv.amount_pending || 0));
            result.paymentBreakdown.Approval += actualApprovalPending;
          }
          else if (mode === 'Credit Coupon') { 
            result.paymentBreakdown['Credit Coupon'] += amount; 
            hasCreditCoupon = true; 
          }
          else (result.paymentBreakdown as any).Others += amount;
        });

        if (!hasCreditCoupon && (inv as any).coupon_no) {
          const totalMrp = parseFloat(inv.total_mrp as any) || 0;
          const totalDiscount = (parseFloat(inv.total_discount as any) || 0) + (parseFloat((inv as any).voucher_discount as any) || 0);
          const loyalty = parseFloat((inv as any).loyalty_redemption_amount as any) || 0;
          const netPayable = parseFloat(inv.net_payable as any) || 0;
          const inferredCoupon = totalMrp - totalDiscount - loyalty - netPayable;
          if (inferredCoupon > 0) {
            result.paymentBreakdown['Credit Coupon'] += inferredCoupon;
            totalPaidFromDetails += inferredCoupon;
          }
        }
      }

      // SMART FALLBACK: If total from details is less than actual paid amount (Net - Pending),
      // attribute the difference to the primary payment mode.
      const actualTotalPaid = finalNet - amountPending;
      const missingAmount = Math.max(0, actualTotalPaid - totalPaidFromDetails);
      
      if (missingAmount > 0) {
        const mode = inv.payment_mode || 'Cash'; // Fallback to Cash if no primary mode
        if (mode === 'Cash') result.paymentBreakdown.Cash += missingAmount;
        else if (mode === 'UPI') result.paymentBreakdown.UPI += missingAmount;
        else if (mode === 'Card') result.paymentBreakdown.Card += missingAmount;
        else if (mode === 'Online' || mode === 'Bank Transfer') result.paymentBreakdown.Online += missingAmount;
        else if (mode === 'Exchange') (result.paymentBreakdown as any).Exchange += missingAmount;
        else if (mode === 'Approval') result.paymentBreakdown.Approval += missingAmount;
        else if (mode === 'Credit Coupon') result.paymentBreakdown['Credit Coupon'] += missingAmount;
        else (result.paymentBreakdown as any).Others += missingAmount;
      }

      if (inv.items) {
        inv.items.forEach(item => {
          result.totalQuantity += Number(item.quantity) || 0;
          if (Number(inv.amount_pending || 0) > 0 && item.on_approval) {
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
      .leftJoin('si.floor_details', 'f_sale')
      .leftJoin('sii.product_item', 'bb')
      .leftJoin('bb.floor', 'f_stock')
      .select([
        'COALESCE(f_sale.name, f_stock.name, \'Unknown\') as floor',
        'COUNT(DISTINCT si.id) as "invoiceCount"',
        'COALESCE(SUM(sii.total_value), 0) as "totalSales"',
        'COALESCE(SUM(sii.discount), 0) as "totalDiscount"'
      ])
      .where('si.invoice_date >= :start AND si.invoice_date <= :end', { 
        start: filters.startDate, 
        end: filters.endDate
      })
      .groupBy('COALESCE(f_sale.name, f_stock.name, \'Unknown\')')
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
      .leftJoin(SalesReturnItem, 'sri', 'sri.return_id = sr.id')
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
        'sr.credit_note_number as credit_note_number',
        'COALESCE(SUM(sri.quantity), 0) as total_quantity',
        'sr.total_discount_amount as total_discount_amount',
        'sr.total_loyalty_amount as total_loyalty_amount'
      ])
      .where('sr.return_date >= :start AND sr.return_date <= :end', { 
        start: `${filters.startDate.split('T')[0]}T00:00:00.000Z`, 
        end: `${filters.endDate.split('T')[0]}T23:59:59.999Z` 
      })
      .groupBy('sr.id')
      .addGroupBy('sr.return_number')
      .addGroupBy('sr.return_date')
      .addGroupBy('sr.invoice_number')
      .addGroupBy('sr.customer_name')
      .addGroupBy('sr.customer_mobile')
      .addGroupBy('sr.total_return_amount')
      .addGroupBy('sr.return_reason')
      .addGroupBy('sr.status')
      .addGroupBy('s.name')
      .addGroupBy('sr.credit_coupon_no')
      .addGroupBy('sr.credit_note_number')
      .addGroupBy('sr.total_discount_amount')
      .addGroupBy('sr.total_loyalty_amount')
      .orderBy('sr.return_date', 'DESC');

    const details = await qb.getRawMany();

    const summary = details.reduce((acc, d) => ({
      totalReturnAmount: acc.totalReturnAmount + parseFloat(d.total_return_amount),
      totalDiscountAmount: acc.totalDiscountAmount + parseFloat(d.total_discount_amount || 0),
      totalLoyaltyAmount: acc.totalLoyaltyAmount + parseFloat(d.total_loyalty_amount || 0),
      returnCount: acc.returnCount + 1,
      totalQuantity: acc.totalQuantity + parseInt(d.total_quantity || 0)
    }), { totalReturnAmount: 0, totalDiscountAmount: 0, totalLoyaltyAmount: 0, returnCount: 0, totalQuantity: 0 });

    return { summary, details };
  }

  async cashReport(filters: { startDate: string, endDate: string }) {
    const start = new Date(`${filters.startDate.split('T')[0]}T00:00:00.000Z`);
    const end = new Date(`${filters.endDate.split('T')[0]}T23:59:59.999Z`);

    const result = {
      summary: {
        totalCash: 0,
        salesCash: 0,
        receiptCash: 0,
        advanceCash: 0
      },
      details: [] as any[]
    };

    // 1. Cash from Direct Sales (Invoices)
    const invoices = await AppDataSource.getRepository(SalesInvoice).find({
      where: { invoice_date: Between(start as any, end as any) }
    });

    invoices.forEach(inv => {
      let paymentDetails = inv.payment_details;
      if (typeof paymentDetails === 'string') {
        try { paymentDetails = JSON.parse(paymentDetails); } catch (e) { paymentDetails = null; }
      }

      let cashAmount = 0;
      let totalPaidFromDetails = 0;

      if (paymentDetails && Array.isArray(paymentDetails)) {
        paymentDetails.forEach((pd: any) => {
          const amount = parseFloat(pd.amount) || 0;
          totalPaidFromDetails += amount;
          if (pd.mode === 'Cash') cashAmount += amount;
        });
      }

      // Smart Fallback: match salesReport logic exactly.
      // If payment_details total is less than what was actually paid (net_payable - amount_pending),
      // attribute the gap to Cash when payment_mode is 'Cash' OR is not set (NULL/undefined).
      const actualTotalPaid = (parseFloat(inv.net_payable as any) || 0) - (parseFloat(inv.amount_pending as any) || 0);
      const missingAmount = Math.max(0, actualTotalPaid - totalPaidFromDetails);
      if (missingAmount > 0) {
        const mode = inv.payment_mode || 'Cash'; // NULL defaults to Cash (same as salesReport)
        if (mode === 'Cash') cashAmount += missingAmount;
      }

      if (cashAmount > 0) {
        result.summary.salesCash += cashAmount;
        result.details.push({
          id: inv.id,
          date: inv.invoice_date,
          source: 'Sales Invoice',
          reference: inv.invoice_number,
          customer: inv.customer_name,
          mobile: inv.customer_mobile,
          amount: cashAmount
        });
      }
    });

    // 2. Pending Payment Receipts (Cash)
    const receipts = await AppDataSource.getRepository(PaymentReceipt).find({
      where: { 
        receipt_date: Between(start as any, end as any),
        payment_mode: 'Cash'
      }
    });

    receipts.forEach(receipt => {
      const amount = parseFloat(receipt.amount_received as any) || 0;
      result.summary.receiptCash += amount;
      result.details.push({
        id: receipt.id,
        date: receipt.receipt_date,
        source: 'Pending Payment',
        reference: receipt.receipt_number,
        customer: receipt.customer_name,
        mobile: receipt.customer_mobile,
        amount: amount
      });
    });

    // 3. Sales Order Advances (Cash)
    const advances = await AppDataSource.getRepository(SalesOrderAdvance).find({
      where: {
        created_at: Between(start as any, end as any),
        payment_mode: 'Cash'
      },
      relations: ['salesOrder', 'salesOrder.customer']
    });

    advances.forEach(adv => {
      const amount = parseFloat(adv.amount as any) || 0;
      result.summary.advanceCash += amount;
      result.details.push({
        id: adv.id,
        date: adv.created_at,
        source: 'Order Advance',
        reference: adv.salesOrder?.order_number || 'N/A',
        customer: adv.salesOrder?.customer?.name || 'Customer',
        mobile: adv.salesOrder?.customer?.mobile || '',
        amount: amount
      });
    });

    result.summary.totalCash = result.summary.salesCash + result.summary.receiptCash + result.summary.advanceCash;
    
    // Sort details by date descending
    result.details.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return result;
  }

  async advanceAnalysis(filters: { startDate: string, endDate: string }) {
    const start = new Date(`${filters.startDate.split('T')[0]}T00:00:00.000Z`);
    const end = new Date(`${filters.endDate.split('T')[0]}T23:59:59.999Z`);

    const advances = await AppDataSource.getRepository(SalesOrderAdvance).find({
      where: {
        created_at: Between(start as any, end as any)
      },
      relations: ['salesOrder', 'salesOrder.customer'],
      order: { created_at: 'DESC' }
    });

    const summary = {
      total: 0,
      cash: 0,
      upi: 0,
      card: 0,
      bank: 0,
      count: advances.length
    };

    const details = advances.map(adv => {
      const amount = parseFloat(adv.amount as any) || 0;
      const mode = (adv.payment_mode || 'Cash').toLowerCase();
      
      summary.total += amount;
      if (mode.includes('cash')) summary.cash += amount;
      else if (mode.includes('upi')) summary.upi += amount;
      else if (mode.includes('card')) summary.card += amount;
      else if (mode.includes('bank') || mode.includes('transfer')) summary.bank += amount;

      return {
        id: adv.id,
        date: adv.created_at,
        amount: amount,
        payment_mode: adv.payment_mode,
        reference_number: adv.reference_number,
        notes: adv.notes,
        order_number: adv.salesOrder?.order_number,
        customer_name: adv.salesOrder?.customer?.name,
        customer_mobile: adv.salesOrder?.customer?.mobile,
        status: adv.salesOrder?.status
      };
    });

    return { summary, details };
  }

  async approvalReport(filters: { startDate?: string, endDate?: string }) {
    const qb = AppDataSource.getRepository(SalesInvoiceItem)
      .createQueryBuilder('sii')
      .innerJoinAndSelect('sii.invoice', 'si')
      .leftJoinAndSelect('si.customer', 'c')
      .where('sii.on_approval = :on_approval', { on_approval: true })
      .andWhere('si.amount_pending > 0');

    if (filters.startDate && filters.endDate) {
       qb.andWhere('si.invoice_date BETWEEN :start AND :end', {
         start: `${filters.startDate.split('T')[0]}T00:00:00.000Z`,
         end: `${filters.endDate.split('T')[0]}T23:59:59.999Z`
       });
    }

    qb.orderBy('si.invoice_date', 'DESC');

    const items = await qb.getMany();

    // Grouping by Invoice ID to resolve confusion between Item Value vs Invoice Pending
    const groupedMap = new Map();

    items.forEach(item => {
      const invId = item.invoice_id;
      if (!groupedMap.has(invId)) {
        groupedMap.set(invId, {
          invoice_id: invId,
          invoice_number: item.invoice.invoice_number,
          invoice_date: item.invoice.invoice_date,
          customer_name: item.invoice.customer_name || item.invoice.customer?.name,
          customer_mobile: item.invoice.customer_mobile || item.invoice.customer?.mobile,
          amount_pending: item.invoice.amount_pending,
          payment_status: item.invoice.payment_status,
          items: []
        });
      }

      // Calculate safe total value (fallback if DB has 0 for some reason)
      const itemVal = parseFloat(item.total_value as any) || (parseFloat(item.selling_price as any || item.mrp as any || 0) * (Number(item.quantity) || 1));

      groupedMap.get(invId).items.push({
        id: item.id,
        barcode_8digit: item.barcode_8digit,
        design_no: item.design_no,
        product_description: item.product_description,
        quantity: item.quantity,
        total_value: itemVal
      });
    });

    const details = Array.from(groupedMap.values());

    const summary = {
      totalItems: items.reduce((sum, d) => sum + (Number(d.quantity) || 0), 0),
      totalValue: items.reduce((sum, d) => {
        const itemVal = parseFloat(d.total_value as any) || (parseFloat(d.selling_price as any || d.mrp as any || 0) * (Number(d.quantity) || 1));
        return sum + itemVal;
      }, 0),
      count: details.length
    };

    return { summary, details };
  }
}

export const reportService = new ReportService();
