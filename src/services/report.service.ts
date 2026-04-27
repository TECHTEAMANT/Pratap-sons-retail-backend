import { AppDataSource } from '../config/data-source';
import { SalesInvoice } from '../entities/SalesInvoice';
import { SalesInvoiceItem } from '../entities/SalesInvoiceItem';
import { BarcodeBatch } from '../entities/BarcodeBatch';
import { Customer } from '../entities/Customer';
import { Vendor } from '../entities/Vendor';
import { PurchaseOrder } from '../entities/PurchaseOrder';
import { SalesReturn } from '../entities/SalesReturn';
import { SalesReturnItem } from '../entities/SalesReturnItem';
import { PurchaseReturnItem } from '../entities/PurchaseReturnItem';
import { SalesOrderAdvance } from '../entities/SalesOrderAdvance';
import { PaymentReceipt } from '../entities/PaymentReceipt';
import { PaymentReceiptItem } from '../entities/PaymentReceiptItem';
import { Between, MoreThanOrEqual, LessThanOrEqual, Raw, In } from 'typeorm';
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

  async salesReport(filters: { startDate: string, endDate: string, vendorId?: string, floorId?: string }) {
    const start = filters.startDate.split('T')[0];
    const end = filters.endDate.split('T')[0];

    // Note: si.invoice_date is type 'date' (YYYY-MM-DD) in DB.
    // Querying with date strings is more precise for Postgres than ISO strings with times.
    const qb = AppDataSource.getRepository(SalesInvoice)
      .createQueryBuilder('si')
      .leftJoinAndSelect('si.items', 'items')
      .leftJoin('items.product_item', 'bb') // Needed for vendor filtering
      .leftJoinAndSelect('si.receipt_items', 'ri')
      .leftJoinAndSelect('ri.receipt', 'receipt')
      .leftJoinAndSelect('si.sales_returns', 'sr')
      .leftJoinAndSelect('si.coupon_applications', 'ca')
      .leftJoinAndSelect('si.advance_applications', 'aa')
      .leftJoinAndSelect('si.credit_note_applications', 'cna')
      .where('si.invoice_date BETWEEN :start AND :end', { start, end });

    if (filters.floorId) {
      qb.andWhere('si.floor_id = :floorId', { floorId: filters.floorId });
    }

    if (filters.vendorId) {
      // If filtering by vendor, we only want invoices that have items from this vendor
      // AND we will filter the items themselves inside the loop for summary accuracy.
      qb.andWhere('bb.vendor = :vendorId', { vendorId: filters.vendorId });
    }

    const invoices = await qb.getMany();

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
        Advance: 0,
        Approval: 0,
        'Credit Coupon': 0,
        'Exchange': 0,
        'Others': 0,
        'Return Credit': 0
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

    const detailedList: any[] = [];
    invoices.forEach(inv => {
      // If vendorId filter is active, we must ONLY include items from that vendor in the summary math.
      let invoiceItems = inv.items || [];
      if (filters.vendorId) {
        invoiceItems = invoiceItems.filter(item => (item as any).product_item?.vendor === filters.vendorId || (item as any).vendor_id === filters.vendorId);
        if (invoiceItems.length === 0) return; // Skip invoice if no items match (should be handled by query but extra safety)
      }

      // Robust Reconstruction from Item-Level Data
      const reconstructedMRP = invoiceItems.reduce((s, i) => s + (Number(i.mrp || i.selling_price || 0) * Number(i.quantity || 1)), 0);
      const reconstructedItemDisc = invoiceItems.reduce((s, i) => s + (Number(i.discount || 0) * Number(i.quantity || 1)), 0);
      
      // --- Fix Discount Doubling ---
      // We reconcile the sum of item-level discounts against the total header-level discount bundle.
      // Since modern invoices prorate Special, Voucher, and Loyalty into the item 'discount' field, 
      // adding the header fields again would cause double counting. 
      // We trust the Maximum of the two approaches (Item Reconstruction vs Header Totals).
      const totalHeaderBundle = (parseFloat(inv.total_discount as any) || 0) + 
                               (parseFloat(inv.special_discount as any) || 0) + 
                               (parseFloat(inv.voucher_discount as any) || 0) + 
                               (parseFloat(inv.loyalty_redemption_amount as any) || 0) + 
                               (parseFloat((inv as any).coupon_amount as any) || 0);

      const totalDisc = Math.max(reconstructedItemDisc, totalHeaderBundle);
      const returnsAmt = (inv.sales_returns || []).reduce((s: number, r: any) => s + (Number(r.total_return_amount) || 0), 0);

      const calculatedNet = reconstructedMRP - totalDisc + (parseFloat(inv.additional_charges_total as any) || 0) - returnsAmt;
      const finalNet = Math.round(calculatedNet);

      // --- NEW: Parse Payment Details FIRST to use as source of truth ---
      let paymentDetails = inv.payment_details;
      if (typeof paymentDetails === 'string') {
        try { paymentDetails = JSON.parse(paymentDetails); } catch (e) { paymentDetails = null; }
      }

      let detailsArray: any[] = [];
      if (paymentDetails) {
        if (Array.isArray(paymentDetails)) {
          detailsArray = paymentDetails;
        } else if (typeof paymentDetails === 'object' && paymentDetails !== null) {
          // Normalize old object format { "MODE": amount } to [{ mode, amount }]
          // IMPORTANT: Ignore technical keys like total_mrp, net_payable, etc.
          const techKeys = ['TOTAL_MRP', 'NET_PAYABLE', 'ITEMS', 'ID', 'TOTAL_AMOUNT', 'ROUND_OFF', 'AMOUNT_PAID', 'AMOUNT_PENDING', 'SPECIAL_DISCOUNT', 'VOUCHER_DISCOUNT', 'LOYALTY_REDEMPTION_AMOUNT', 'TOTAL_GST', 'TAXABLE_VALUE'];
          detailsArray = Object.entries(paymentDetails)
            .filter(([key, val]) => {
              const k = key.toUpperCase();
              return !techKeys.includes(k) && (typeof val === 'number' || typeof val === 'string');
            })
            .map(([key, val]) => ({
              mode: key,
              amount: val
            }));
        }
      }

      let invoicePaymentBreakdown = {
        Cash: 0, UPI: 0, Card: 0, Online: 0, Advance: 0, Approval: 0,
        'Credit Coupon': 0, 'Exchange': 0, 'Others': 0
      };

      let hasCreditCoupon = false;

      // Unified Payment Processing (Initial Payments + Subsequent Receipts)
      // 1. Calculate sum of actual receipts
      const receiptPayments = (inv.receipt_items || []).map((ri: any) => ({
        mode: ri.receipt?.payment_mode || 'Receipt',
        amount: parseFloat(ri.amount_paid as any) || 0
      })).filter(p => p.amount > 0);

      const couponReceipts = (inv.coupon_applications || []).map((ca: any) => ({
        mode: 'Credit Coupon',
        amount: parseFloat(ca.amount_applied as any) || 0
      }));

      const advanceReceipts = (inv.advance_applications || []).map((aa: any) => ({
        mode: 'Advance',
        amount: parseFloat(aa.amount_applied as any) || 0
      }));

      const creditNoteReceipts = (inv.credit_note_applications || []).map((cna: any) => ({
        mode: 'Credit Note',
        amount: parseFloat(cna.amount_applied as any) || 0
      }));

      const totalExternalApplications = receiptPayments.reduce((s, r) => s + r.amount, 0) + 
                                       couponReceipts.reduce((s, r) => s + r.amount, 0) + 
                                       advanceReceipts.reduce((s, r) => s + r.amount, 0) + 
                                       creditNoteReceipts.reduce((s, r) => s + r.amount, 0);

      // 2. Adjust initial payments to avoid double counting Approval vs Receipts/Credits
      const adjustedInitialPayments = detailsArray.map((pd: any) => {
        const mode = (pd.mode || '').toString().toUpperCase();
        if (mode.includes('APPROVAL')) {
          return { ...pd, amount: Math.max(0, (parseFloat(pd.amount as any) || 0) - totalExternalApplications) };
        }
        return pd;
      });

      const allPaymentSources = [...adjustedInitialPayments, ...receiptPayments, ...couponReceipts, ...advanceReceipts, ...creditNoteReceipts];

      allPaymentSources.forEach((pd: any) => {
        const rawMode = (pd.mode || '').toString().toUpperCase();
        const amount = parseFloat(pd.amount) || 0;
        
        // Skip technical or garbage entries and zero amounts
        if (amount <= 0) return;

        // --- Fuzzy Keyword Categorization ---
        if (rawMode.includes('CASH')) {
          invoicePaymentBreakdown.Cash += amount;
        }
        else if (rawMode.includes('UPI') || rawMode.includes('PHONEPE') || rawMode.includes('GPAY') || rawMode.includes('PAYTM') || rawMode.includes('G PAY') || rawMode.includes('BHIM')) {
          invoicePaymentBreakdown.UPI += amount;
        }
        else if (rawMode.includes('COUPON')) { 
          invoicePaymentBreakdown['Credit Coupon'] += amount; 
          hasCreditCoupon = true; 
        }
        else if (rawMode.includes('CARD') || rawMode.includes('VISA') || rawMode.includes('POS') || rawMode.includes('MASTER') || rawMode.includes('DEBIT') || rawMode.includes('CREDIT')) {
          invoicePaymentBreakdown.Card += amount;
        }
        // Inclusion of RCP and RECEIPT for older receipt formats
        else if (rawMode.includes('RECEIPT') || rawMode.includes('RCP') || rawMode.includes('BANK') || rawMode.includes('ONLINE') || rawMode.includes('TRANSFER') || rawMode.includes('NEFT') || rawMode.includes('RTGS') || rawMode.includes('HDFC') || rawMode.includes('ICICI') || rawMode.includes('INTERNAL')) { 
          invoicePaymentBreakdown.Online += amount;
        }
        else if (rawMode.includes('APPROVAL')) {
          invoicePaymentBreakdown.Approval += amount;
        }
        else if (rawMode.includes('ADVANCE')) {
          invoicePaymentBreakdown.Advance += amount;
        }
        else if (rawMode.includes('EXCHANGE')) {
          invoicePaymentBreakdown.Exchange += amount;
        }
        else {
          invoicePaymentBreakdown.Others += amount;
        }
      });

      // --- Financial Reconciliation Logic ---
      const realPaidAmount = 
        invoicePaymentBreakdown.Cash + 
        invoicePaymentBreakdown.UPI + 
        invoicePaymentBreakdown.Card + 
        invoicePaymentBreakdown.Online + 
        invoicePaymentBreakdown.Advance + 
        invoicePaymentBreakdown.Approval +
        invoicePaymentBreakdown['Credit Coupon'] + 
        invoicePaymentBreakdown.Exchange + 
        invoicePaymentBreakdown.Others;

      // Handle inferred coupon if missing from breakdown
      if (!hasCreditCoupon && (inv as any).coupon_no) {
        const inferredCoupon = Math.max(0, reconstructedMRP - totalDisc - (parseFloat((inv as any).loyalty_redemption_amount as any) || 0) - finalNet);
        if (inferredCoupon > 0) {
          invoicePaymentBreakdown['Credit Coupon'] += inferredCoupon;
        }
      }

      const finalRealPaid = 
        invoicePaymentBreakdown.Cash + invoicePaymentBreakdown.UPI + invoicePaymentBreakdown.Card + 
        invoicePaymentBreakdown.Online + invoicePaymentBreakdown.Advance + invoicePaymentBreakdown['Credit Coupon'] + 
        invoicePaymentBreakdown.Exchange + invoicePaymentBreakdown.Others;

      // Adjusted Pending = Net Payable - (All Real Payments)
      let adjustedPending = Math.max(0, finalNet - finalRealPaid);
      if (adjustedPending < 1) adjustedPending = 0;

      // Detection of "Approval" status
      const isApprovalInvoice = (inv as any).is_on_approval === true || invoicePaymentBreakdown.Approval > 0;

      // Update Summary Totals
      result.totalSales += finalNet;
      result.totalMRP += reconstructedMRP;
      result.totalDiscount += totalDisc;
      result.totalGST += parseFloat(inv.total_gst as any) || 0;
      result.taxableValue += parseFloat(inv.taxable_value as any) || 0;
      result.totalSpecialDiscount += parseFloat(inv.special_discount as any) || 0;
      result.totalLoyalty += parseFloat(inv.loyalty_redemption_amount as any) || 0;
      result.totalVoucher += parseFloat(inv.voucher_discount as any) || 0;
      result.totalPending += isApprovalInvoice ? adjustedPending : 0;

      // Global Payment Breakdown update
      result.paymentBreakdown.Cash += invoicePaymentBreakdown.Cash;
      result.paymentBreakdown.UPI += invoicePaymentBreakdown.UPI;
      result.paymentBreakdown.Card += invoicePaymentBreakdown.Card;
      result.paymentBreakdown.Online += invoicePaymentBreakdown.Online;
      result.paymentBreakdown.Advance += invoicePaymentBreakdown.Advance;
      result.paymentBreakdown.Approval += isApprovalInvoice ? adjustedPending : 0;
      result.paymentBreakdown['Credit Coupon'] += invoicePaymentBreakdown['Credit Coupon'];
      (result.paymentBreakdown as any).Exchange += invoicePaymentBreakdown.Exchange;
      (result.paymentBreakdown as any).Others += invoicePaymentBreakdown.Others;
      (result.paymentBreakdown as any)['Return Credit'] += returnsAmt;

      result.cgst_5 += parseFloat(inv.cgst_5 as any) || 0;
      result.sgst_5 += parseFloat(inv.sgst_5 as any) || 0;
      result.cgst_18 += parseFloat(inv.cgst_18 as any) || 0;
      result.sgst_18 += parseFloat(inv.sgst_18 as any) || 0;

      let hasApprovalItems = false;
      if (inv.items) {
        inv.items.forEach(item => {
          result.totalQuantity += Number(item.quantity) || 0;
          if (item.on_approval) {
            hasApprovalItems = true;
            if (adjustedPending > 0) { result.approvalItemCount += Number(item.quantity) || 0; }
          }
        });
      }

      // Add to detailed list
      detailedList.push({
        ...inv,
        total_mrp: reconstructedMRP,
        total_discount: totalDisc,
        net_payable: finalNet,
        amount_pending: adjustedPending,
        approval_amount: isApprovalInvoice ? adjustedPending : 0,
        is_on_approval: isApprovalInvoice || hasApprovalItems,
        payment_breakdown: invoicePaymentBreakdown,
        // Status logic
        payment_status: (adjustedPending <= 0.05) ? 'returned' : (adjustedPending <= 0.05 ? 'paid' : (finalRealPaid > 0.1 ? 'partial' : 'pending')),
        total_quantity: inv.items ? inv.items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0) : 0,
        return_credit: returnsAmt
      });
    });

    return {
      ...result,
      avgInvoiceValue: result.invoiceCount > 0 ? result.totalSales / result.invoiceCount : 0,
      detailedList
    };
  }

  async inventoryReport(filters: { startDate?: string; endDate?: string; vendorId?: string; floorId?: string; sortField?: string; sortDirection?: 'ASC' | 'DESC' } = {}) {
    const qb = AppDataSource.getRepository(BarcodeBatch)
      .createQueryBuilder('bb')
      .leftJoin('bb.product_group', 'pg')
      .leftJoin('bb.size', 'sz')
      .leftJoin('bb.color', 'cl')
      .leftJoin('bb.vendor', 'v')
      .select([
        'bb.barcode_alias_8digit as barcode',
        'bb.design_no as design',
        'bb.hsn_code as hsn_code',
        'pg.name as "productGroup"',
        'sz.name as size',
        'cl.name as color',
        'v.name as "vendorName"',
        'COALESCE(bb.available_quantity, 0) as "availableQty"',
        'COALESCE(bb.total_quantity - bb.available_quantity, 0) as "soldQty"',
        'COALESCE(bb.cost_actual, 0) as cost',
        'COALESCE(bb.mrp, 0) as mrp',
        'CASE WHEN bb.gst_logic = \'AUTO_5_18\' THEN (CASE WHEN bb.cost_actual < 2500 THEN 5 ELSE 18 END) ELSE 5 END as "gstRate"',
        'COALESCE(bb.available_quantity * bb.cost_actual, 0) as "inventoryValue"'
      ]);

    qb.where('bb.status IN (:...statuses)', { statuses: ['active', 'Available', 'defective', 'Sold', 'Returned'] });
    
    // NOTE: For Inventory Analysis, we ignore the creation date filter by default 
    // to show the current state of ALL inventory items, matching the main Inventory module.
    /*
    if (filters.startDate && filters.endDate) {
      const start = filters.startDate.split('T')[0];
      const end = filters.endDate.split('T')[0];
      qb.andWhere('bb.created_at::date BETWEEN :start AND :end', { start, end });
    }
    */

    if (filters.vendorId) {
      qb.andWhere('bb.vendor = :vendorId', { vendorId: filters.vendorId });
    }
    if (filters.floorId) {
      qb.andWhere('bb.floor = :floorId', { floorId: filters.floorId });
    }

    const direction = filters.sortDirection?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    if (filters.sortField === 'availableQty') {
      qb.orderBy('bb.available_quantity', direction);
    } else if (filters.sortField === 'soldQty') {
      qb.orderBy('(bb.total_quantity - bb.available_quantity)', direction);
    } else if (filters.sortField === 'mrp') {
      qb.orderBy('bb.mrp', direction);
    } else if (filters.sortField === 'cost') {
      qb.orderBy('bb.cost_actual', direction);
    } else if (filters.sortField === 'barcode') {
      qb.orderBy('bb.barcode_alias_8digit', direction);
    } else {
      qb.orderBy('bb.design_no', direction);
    }

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
    const start = filters.startDate.split('T')[0];
    const end = filters.endDate.split('T')[0];

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
        'COALESCE(SUM(sii.discount * sii.quantity), 0) as "totalDiscount"'
      ])
      .where('si.invoice_date BETWEEN :start AND :end', { start, end })
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
    const start = filters.startDate.split('T')[0];
    const end = filters.endDate.split('T')[0];

    // Use a more inclusive status filter. Usually we want everything that's not a temporary draft or cancelled.
    // However, to be safe and "take all invoices" as per user request, we include everything except maybe deleted ones if that exists.
    const activeStatuses = ['Completed', 'Pending', 'Draft', 'Approved', 'Partially Received', 'Received'];

    const qb = AppDataSource.getRepository(PurchaseOrder)
      .createQueryBuilder('po')
      .select([
        'COALESCE(SUM(po.total_amount), 0) as total_purchase',
        'COALESCE(SUM(po.total_items), 0) as total_items',
        'COALESCE(SUM(po.taxable_value), 0) as total_taxable',
        'COALESCE(SUM(po.total_amount - po.taxable_value - COALESCE(po.ledger_freight, 0)), 0) as total_gst',
        'COUNT(po.id) as po_count',
        'COALESCE(AVG(po.total_amount), 0) as avg_po_value',
      ])
      .where('po.order_date >= :start AND po.order_date <= :end', { start, end });

    if (filters.vendorId && filters.vendorId !== '' && filters.vendorId !== 'undefined' && filters.vendorId !== 'null') {
      qb.andWhere('po.vendor_id = :vendorId', { vendorId: filters.vendorId });
    }

    const result = await qb.getRawOne();

    const detailsQb = AppDataSource.getRepository(PurchaseOrder)
      .createQueryBuilder('po')
      .leftJoinAndSelect('po.vendor', 'vendor')
      .where('po.order_date >= :start AND po.order_date <= :end', { start, end });

    if (filters.vendorId && filters.vendorId !== '' && filters.vendorId !== 'undefined' && filters.vendorId !== 'null') {
      detailsQb.andWhere('po.vendor_id = :vendorId', { vendorId: filters.vendorId });
    }

    detailsQb.orderBy('po.order_date', 'DESC').limit(1000); // Increased limit as well
    const details = await detailsQb.getMany();

    return {
      success: true,
      data: {
        totalPurchase: parseFloat(result.total_purchase),
        totalItems: parseFloat(result.total_items),
        totalGST: parseFloat(result.total_gst),
        totalTaxable: parseFloat(result.total_taxable),
        poCount: parseInt(result.po_count),
        avgPOValue: parseFloat(result.avg_po_value),
        detailedList: details
      }
    };
  }

  async purchaseAnalysisReport(filters: { startDate: string, endDate: string, vendorId?: string }) {
    const start = filters.startDate.split('T')[0];
    const end = filters.endDate.split('T')[0];
    
    // For timestamps, we want to include the entire end day.
    const endPlusOne = new Date(new Date(end).getTime() + 86400000).toISOString().split('T')[0];

    const qb = AppDataSource.getRepository(BarcodeBatch)
      .createQueryBuilder('bb')
      .leftJoinAndSelect('bb.vendor', 'v')
      .leftJoinAndSelect('purchase_orders', 'po', 'po.id = bb.po_id')
      .select([
        'bb.barcode_alias_8digit as barcode',
        'bb.design_no as design_no',
        'bb.created_at as date',
        'bb.total_quantity as quantity',
        'v.name as vendor_name',
        'COALESCE(bb.cost_actual, 0) as cost',
        'COALESCE(bb.mrp, 0) as mrp',
        'po.po_number as po_number',
        'po.invoice_number as po_invoice_number',
        'po.order_date as po_date'
      ])
      .where('bb.created_at >= :start AND bb.created_at < :endPlusOne', { start, endPlusOne });

    if (filters.vendorId && filters.vendorId !== 'null' && filters.vendorId !== 'undefined' && filters.vendorId !== '') {
      qb.andWhere('bb.vendor = :vendorId', { vendorId: filters.vendorId });
    }

    const items = await qb.getRawMany();

    let totalCost = 0;
    let totalMRP = 0;
    let totalQuantity = 0;

    const details = items.map(item => {
      const quantity = parseFloat(item.quantity) || 0;
      const cost = parseFloat(item.cost) || 0;
      const mrp = parseFloat(item.mrp) || 0;
      const totalItemCost = cost * quantity;
      const totalItemMRP = mrp * quantity;
      const discount = totalItemMRP - totalItemCost;
      const margin = mrp > 0 ? ((mrp - cost) / mrp) * 100 : 0;

      totalCost += totalItemCost;
      totalMRP += totalItemMRP;
      totalQuantity += quantity;

      return {
        ...item,
        quantity,
        cost,
        mrp,
        totalCost: totalItemCost,
        totalMRP: totalItemMRP,
        discount,
        margin
      };
    });

    return {
      success: true,
      data: {
        summary: {
          totalCost: Math.round(totalCost * 100) / 100,
          totalMRP: Math.round(totalMRP * 100) / 100,
          totalDiscount: Math.round((totalMRP - totalCost) * 100) / 100,
          avgMargin: totalMRP > 0 ? ((totalMRP - totalCost) / totalMRP) * 100 : 0,
          totalItems: totalQuantity
        },
        details: details.map(d => ({
          ...d,
          totalCost: Math.round(d.totalCost * 100) / 100,
          totalMRP: Math.round(d.totalMRP * 100) / 100,
          discount: Math.round(d.discount * 100) / 100,
          margin: Math.round(d.margin * 100) / 100
        }))
      }
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
      .where('si.invoice_date BETWEEN :start AND :end', { 
        start: startDate.split('T')[0], 
        end: endDate.split('T')[0] 
      });

    const result = await qb.getRawOne();
    return { startDate, endDate, ...result };
  }

  // Salesman Performance
  async salesmanPerformance(startDate: string, endDate: string) {
    const startStr = startDate.split('T')[0];
    const endStr = endDate.split('T')[0];

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
      .where('si.invoice_date BETWEEN :start AND :end', { start: startStr, end: endStr })
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
      .where('sr.return_date BETWEEN :start AND :end', { start: startStr, end: endStr })
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
 
  async profitabilityReport(filters: { startDate: string, endDate: string, vendorId?: string, floorId?: string }) {
    const start = filters.startDate.split('T')[0];
    const end = filters.endDate.split('T')[0];

    const qb = AppDataSource.getRepository(SalesInvoiceItem)
      .createQueryBuilder('sii')
      .innerJoin('sii.invoice', 'si')
      .leftJoin(BarcodeBatch, 'bb', 'bb.barcode_alias_8digit = sii.barcode_8digit')
      .leftJoin('bb.vendor', 'v')
      .leftJoin(SalesReturn, 'sr', 'sr.invoice_id = si.id AND sr.return_date BETWEEN :start AND :end')
      .leftJoin(SalesReturnItem, 'sri', 'sri.return_id = sr.id AND sri.barcode_8digit = sii.barcode_8digit')
      .select([
        'si.invoice_number as invoice_number',
        'si.invoice_date as invoice_date',
        'si.customer_name as customer_name',
        'si.id as invoice_id',
        'sii.barcode_8digit as barcode',
        'sii.design_no as design_no',
        'sii.product_description as product_description',
        'sii.gst_percentage as gst_percentage',
        'COALESCE(SUM(sri.quantity), 0) as return_qty',
        'COALESCE(sii.quantity, 0) - COALESCE(SUM(sri.quantity), 0) as quantity',
        'sii.quantity as original_quantity',
        'COALESCE(bb.cost_actual, 0) as cost',
        'sii.mrp as mrp',
        'sii.discount as discount',
        'COALESCE(sii.taxable_value, (sii.selling_price * 100 / (100 + COALESCE(sii.gst_percentage, 0))) * sii.quantity) as original_taxable_value',
        '(COALESCE(sii.cgst_amount, 0) + COALESCE(sii.sgst_amount, 0) + COALESCE(sii.igst_amount, 0)) as original_gst_amount',
        'COALESCE(NULLIF(sii.selling_price, 0), sii.mrp - sii.discount) as selling_price',
        'v.name as vendor_name',
        'v.id as vendor_id'
      ])
      .where('si.invoice_date BETWEEN :start AND :end', { start, end })
      .groupBy('si.id, sii.id, bb.id, v.id')
      .having('COALESCE(sii.quantity, 0) - COALESCE(SUM(sri.quantity), 0) > 0');

    if (filters.vendorId && filters.vendorId !== 'null' && filters.vendorId !== 'undefined' && filters.vendorId !== '') {
      qb.andWhere('v.id = :vendorId', { vendorId: filters.vendorId });
    }
    if (filters.floorId && filters.floorId !== 'null' && filters.floorId !== 'undefined' && filters.floorId !== '') {
      qb.andWhere('si.floor_id = :floorId', { floorId: filters.floorId });
    }

    const items = await qb.getRawMany();

    let totalRevenue = 0;
    let totalCost = 0;
    let totalGST = 0;
    let totalCostGST = 0;
    let totalMRP = 0;
    let totalDiscount = 0;
    let totalQuantitySold = 0;

    const details = items.map(item => {
      const quantity = parseFloat(item.quantity) || 0;
      const originalQuantity = parseFloat(item.original_quantity) || 1;
      const return_qty = parseFloat(item.return_qty) || 0;
      const cost = parseFloat(item.cost) || 0;
      const selling_price = parseFloat(item.selling_price) || 0;
      const gstPercentage = parseFloat(item.gst_percentage) || 0;
      const originalTaxable = parseFloat(item.original_taxable_value) || 0;
      const originalGst = parseFloat(item.original_gst_amount) || 0;
      
      // Calculate proportionally if there was a partial return
      const ratio = quantity / originalQuantity;
      const revenue = originalTaxable * ratio; 
      const itemGst = originalGst * ratio;
      
      const mrp = parseFloat(item.mrp) || 0;
      const discount = parseFloat(item.discount) || 0;
      const itemCost = cost * quantity; 
      const costGst = itemCost * (gstPercentage / 100);
      const profit = revenue - itemCost;
      const profitMargin = revenue > 0 ? (profit / revenue) * 100 : 0;

      totalRevenue += revenue;
      totalCost += itemCost;
      totalGST += itemGst;
      totalCostGST += costGst;
      totalMRP += mrp * quantity;
      totalDiscount += discount * (quantity + return_qty);
      totalQuantitySold += quantity;

      return {
        ...item,
        quantity,
        return_qty,
        cost,
        revenue,
        gst: itemGst,
        cost_gst: costGst,
        totalCost: itemCost,
        totalCostGross: itemCost + costGst,
        mrp,
        discount,
        profit,
        profitMargin
      };
    });

    return {
      summary: {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalCost: Math.round(totalCost * 100) / 100,
        totalGST: Math.round(totalGST * 100) / 100,
        totalCostGST: Math.round(totalCostGST * 100) / 100,
        grossProfit: Math.round((totalRevenue - totalCost) * 100) / 100,
        profitMargin: totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue) * 100 : 0,
        totalMRP: Math.round(totalMRP * 100) / 100,
        totalDiscount: Math.round(totalDiscount * 100) / 100,
        itemsSold: totalQuantitySold
      },
      details: details.map(d => ({
        ...d,
        revenue: Math.round(d.revenue * 100) / 100,
        profit: Math.round(d.profit * 100) / 100,
        selling_price: Math.round(d.selling_price * 100) / 100
      }))
    };
  }

 
  async vendorProfitabilityReport(filters: { startDate: string, endDate: string, floorId?: string, vendorId?: string }) {
    // 1. Get the base profitability data (this ensures item-level math is identical)
    const baseData = await this.profitabilityReport(filters);
    const items = baseData.details;

    // 2. Fetch independent data (Purchases & Stock) - these don't depend on sales
    const start = filters.startDate.split('T')[0];
    const end = filters.endDate.split('T')[0];

    // Purchases per vendor in period
    const purchasesQB = AppDataSource.getRepository(BarcodeBatch)
      .createQueryBuilder('bb')
      .leftJoin('bb.vendor', 'v')
      .select([
        'COALESCE(v.name, \'Direct/Unknown\') as vendor_name',
        'SUM(COALESCE(bb.total_quantity, 0)) as purchase_quantity',
        'SUM(COALESCE(bb.cost_actual, 0) * COALESCE(bb.total_quantity, 0)) as purchase_cost',
        'SUM(COALESCE(bb.mrp, 0) * COALESCE(bb.total_quantity, 0)) as purchase_mrp'
      ])
      .where('bb.created_at BETWEEN :start AND :end', { start, end });

    if (filters.vendorId && filters.vendorId !== '' && filters.vendorId !== 'null' && filters.vendorId !== 'undefined') {
      purchasesQB.andWhere('v.id = :vendorId', { vendorId: filters.vendorId });
    }
    const purchasesData = await purchasesQB.groupBy('COALESCE(v.name, \'Direct/Unknown\')').getRawMany();
    const purchaseMap = new Map(purchasesData.map(p => [p.vendor_name, p]));

    // Current Stock globally for vendors
    const stockQB = AppDataSource.getRepository(BarcodeBatch)
      .createQueryBuilder('bb')
      .leftJoin('bb.vendor', 'v')
      .select([
        'COALESCE(v.name, \'Direct/Unknown\') as vendor_name',
        'SUM(COALESCE(bb.available_quantity, 0)) as current_stock_qty'
      ]);

    if (filters.vendorId && filters.vendorId !== '' && filters.vendorId !== 'null' && filters.vendorId !== 'undefined') {
      stockQB.andWhere('v.id = :vendorId', { vendorId: filters.vendorId });
    }
    const stockData = await stockQB.groupBy('COALESCE(v.name, \'Direct/Unknown\')').getRawMany();
    const stockMap = new Map(stockData.map(s => [s.vendor_name, s]));

    // 3. Aggregate Sales data from baseData.details
    const vendorMap = new Map<string, any>();

    items.forEach((item: any) => {
      const vName = item.vendor_name || 'Direct/Unknown';
      if (!vendorMap.has(vName)) {
        vendorMap.set(vName, {
          total_quantity: 0,
          total_revenue: 0,
          total_cost: 0,
          cost_gst: 0,
          gst_amount: 0,
          total_mrp: 0
        });
      }

      const v = vendorMap.get(vName);
      v.total_quantity += (parseFloat(item.quantity) || 0);
      v.total_revenue += (parseFloat(item.revenue) || 0);
      v.total_cost += (parseFloat(item.totalCost) || 0);
      v.cost_gst += (parseFloat(item.cost_gst) || 0);
      v.gst_amount += (parseFloat(item.gst) || 0);
      v.total_mrp += (parseFloat(item.mrp) * (parseFloat(item.quantity) || 0));
    });

    // 4. Merge everything
    const allVendorNames = new Set([
      ...Array.from(purchaseMap.keys()),
      ...Array.from(stockMap.keys()),
      ...Array.from(vendorMap.keys())
    ]);

    const finalResults = Array.from(allVendorNames).map(vName => {
      const sale = vendorMap.get(vName) || { total_quantity: 0, total_revenue: 0, total_cost: 0, cost_gst: 0, gst_amount: 0, total_mrp: 0 };
      const purch = purchaseMap.get(vName) || { purchase_quantity: 0, purchase_cost: 0, purchase_mrp: 0 };
      const stk = stockMap.get(vName) || { current_stock_qty: 0 };

      const revenue = sale.total_revenue;
      const cost = sale.total_cost;
      const profit = revenue - cost;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

      return {
        vendor_name: vName,
        purchase_qty: parseFloat(purch.purchase_quantity) || 0,
        purchase_cost: parseFloat(purch.purchase_cost) || 0,
        purchase_mrp: parseFloat(purch.purchase_mrp) || 0,
        current_stock: parseFloat(stk.current_stock_qty) || 0,
        total_quantity: sale.total_quantity,
        total_revenue: Math.round(revenue * 100) / 100,
        total_cost: Math.round(cost * 100) / 100,
        cost_gst: Math.round(sale.cost_gst * 100) / 100,
        gst_amount: Math.round(sale.gst_amount * 100) / 100,
        total_mrp: Math.round(sale.total_mrp * 100) / 100,
        profit: Math.round(profit * 100) / 100,
        margin: Math.round(margin * 100) / 100
      };
    }).filter(v => v.purchase_qty !== 0 || v.total_quantity !== 0 || v.current_stock !== 0);

    return finalResults.sort((a, b) => b.total_revenue - a.total_revenue);
  }

  async topSellingReport(filters: { startDate: string, endDate: string, vendorId?: string, floorId?: string }) {
    const start = filters.startDate.split('T')[0];
    const end = filters.endDate.split('T')[0];

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
      .where('si.invoice_date BETWEEN :start AND :end', { start, end });

    if (filters.vendorId) {
      qb.andWhere('bb.vendor = :vendorId', { vendorId: filters.vendorId });
    }
    if (filters.floorId) {
      qb.andWhere('si.floor_id = :floorId', { floorId: filters.floorId });
    }

    qb.groupBy('sii.barcode_8digit')
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
 
  async slowMovingReport(days: number = 30, vendorId?: string) {
    const cutOffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const qb = AppDataSource.getRepository(BarcodeBatch)
      .createQueryBuilder('bb')
      .leftJoin('bb.product_group', 'pg')
      .leftJoin('bb.vendor', 'v')
      .select([
        'bb.barcode_alias_8digit as barcode',
        'bb.design_no as design',
        'v.name as vendor',
        'pg.name as "productGroup"',
        'bb.available_quantity as "availableQty"',
        'bb.cost_actual as cost',
        'bb.mrp as mrp',
        'bb.available_quantity * bb.cost_actual as "inventoryValue"',
        'bb.created_at as "receivedAt"',
        '(EXTRACT(EPOCH FROM (NOW() - bb.created_at)) / 86400)::int as "daysInStock"'
      ])
      .where('bb.status = :status', { status: 'active' })
      .andWhere('bb.available_quantity > 0')
      .andWhere('bb.created_at <= :date', { date: cutOffDate });

    if (vendorId) {
      qb.andWhere('bb.vendor = :vendorId', { vendorId });
    }

    qb.orderBy('bb.created_at', 'ASC')
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
  async salesReturnReport(filters: { startDate: string, endDate: string, vendorId?: string }) {
    const start = filters.startDate.split('T')[0];
    const end = filters.endDate.split('T')[0];

    const qb = AppDataSource.getRepository(SalesReturn)
      .createQueryBuilder('sr')
      .leftJoin('sr.salesman', 's')
      .leftJoin(SalesReturnItem, 'sri', 'sri.return_id = sr.id')
      .leftJoin('sri.product_item', 'bb') // Needed for vendor filtering
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
      .where('sr.return_date BETWEEN :start AND :end', { start, end });

    if (filters.vendorId) {
      qb.andWhere('bb.vendor = :vendorId', { vendorId: filters.vendorId });
    }

    qb.groupBy('sr.id')
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

      // IMPORTANT: To prevent doubling, Step 1 ONLY counts the Immediate Cash recorded 
      // in the invoice's original payment_details. 
      // All subsequent payments must be recorded via PaymentReceipts (Step 2).
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
        receipt_date: Between(start as any, end as any)
      }
    });
    
    receipts.forEach(receipt => {
      let paymentDetails = receipt.payment_details;
      if (typeof paymentDetails === 'string') {
        try { paymentDetails = JSON.parse(paymentDetails); } catch (e) { paymentDetails = null; }
      }

      let cashAmount = 0;
      if (paymentDetails && Array.isArray(paymentDetails)) {
        paymentDetails.forEach((pd: any) => {
          if (pd.mode === 'Cash') cashAmount += parseFloat(pd.amount) || 0;
        });
      } else if (receipt.payment_mode === 'Cash') {
        cashAmount = parseFloat(receipt.amount_received as any) || 0;
      }

      if (cashAmount > 0) {
        result.summary.receiptCash += cashAmount;
        result.details.push({
          id: receipt.id,
          date: receipt.receipt_date,
          source: 'Pending Payment',
          reference: receipt.receipt_number,
          customer: receipt.customer_name,
          mobile: receipt.customer_mobile,
          amount: cashAmount
        });
      }
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

  async vendorAnalysisReport(filters: { startDate: string, endDate: string, vendorId?: string, sortField?: string, sortDirection?: 'ASC' | 'DESC' }) {
    const start = `${filters.startDate.split('T')[0]}T00:00:00.000Z`;
    const end = `${filters.endDate.split('T')[0]}T23:59:59.999Z`;
    const { vendorId, sortField, sortDirection } = filters;

    // Standard grouping for global view (by Vendor) vs Drill-down (by Variation)
    // ... existing logic ...
    const groupByFields = vendorId 
      ? ['bb.design_no', 'sz.name', 'cl.name'] 
      : ['v.id', 'v.name'];

    const applyVendorFilter = (qb: any) => {
      if (vendorId) {
        qb.andWhere('v.id = :vendorId', { vendorId });
      }
      return qb;
    };

    const addVariationJoins = (qb: any) => {
      if (vendorId) {
        qb.leftJoin('bb.size', 'sz')
          .leftJoin('bb.color', 'cl');
      }
      return qb;
    };

    const selectFields = vendorId
      ? [
          'bb.design_no as id', 
          'bb.design_no as design_no',
          'sz.name as size_name', 
          'cl.name as color_name',
          'COALESCE(SUM(quantity_expr), 0) as qty',
          'COALESCE(SUM(value_expr), 0) as value',
          'COALESCE(SUM(mrp_expr), 0) as mrp_value',
          'MAX(bb.cost_actual) as cost_actual'
        ]
      : [
          'v.id as id',
          'v.name as name',
          'COALESCE(SUM(quantity_expr), 0) as qty',
          'COALESCE(SUM(value_expr), 0) as value',
          'COALESCE(SUM(mrp_expr), 0) as mrp_value',
          'MAX(bb.cost_actual) as cost_actual'
        ];

    const buildQuery = (repo: any, dateField: string, isRange = false) => {
      const qb = AppDataSource.getRepository(repo).createQueryBuilder('base');
      
      let bbAlias = 'base';
      if (repo === SalesInvoiceItem) {
        qb.innerJoin('base.invoice', 'si');
        qb.leftJoin('base.product_item', 'bb');
        bbAlias = 'bb';
      } else if (repo === SalesReturnItem) {
        qb.innerJoin('base.salesReturn', 'sr');
        qb.leftJoin('base.product_item', 'bb');
        bbAlias = 'bb';
      } else if (repo === PurchaseReturnItem) {
        qb.innerJoin('base.purchase_return', 'pr');
        qb.leftJoin('base.item', 'bb');
        bbAlias = 'bb';
      } else if (repo === BarcodeBatch) {
        bbAlias = 'base';
      }

      qb.leftJoin(`${bbAlias}.vendor`, 'v');
      
      if (vendorId) {
        qb.leftJoin(`${bbAlias}.size`, 'sz')
          .leftJoin(`${bbAlias}.color`, 'cl')
          .andWhere('v.id = :vendorId', { vendorId });
      }

      if (isRange) {
        qb.andWhere(`${dateField} >= :start AND ${dateField} <= :end`, { start, end });
      } else {
        qb.andWhere(`${dateField} < :start`, { start });
      }

      const qtyExpr = repo === BarcodeBatch ? `${bbAlias}.total_quantity` : 'base.quantity';
      const valExpr = repo === BarcodeBatch ? `${bbAlias}.total_quantity * ${bbAlias}.cost_actual` : 
                     (repo === SalesInvoiceItem ? 'base.total_value' : 
                     (repo === SalesReturnItem ? 'base.return_amount' : 'base.cost * base.quantity'));
      
      const mrpExpr = repo === BarcodeBatch ? `${bbAlias}.total_quantity * ${bbAlias}.mrp` : 
                      ((repo === SalesInvoiceItem || repo === SalesReturnItem) ? 'base.quantity * base.mrp' : 'base.quantity * ' + bbAlias + '.mrp');

      const selectClone = selectFields.map(s => {
        let sql = s.replace(/bb\./g, `${bbAlias}.`);
        sql = sql.replace('quantity_expr', qtyExpr).replace('value_expr', valExpr).replace('mrp_expr', mrpExpr);
        return sql;
      });

      const groupByExpr = groupByFields.map(f => f.replace(/bb\./g, `${bbAlias}.`)).join(', ');
      
      return qb.select(selectClone).groupBy(groupByExpr);
    };

    // 1-3. OPENING (Purchases, Sales, Returns)
    const opRaw = await buildQuery(BarcodeBatch, 'base.created_at').getRawMany();
    const osRaw = await buildQuery(SalesInvoiceItem, 'si.invoice_date').getRawMany();
    const orRaw = await buildQuery(SalesReturnItem, 'sr.return_date').getRawMany();
    const poRaw = await buildQuery(PurchaseReturnItem, 'pr.return_date').getRawMany();

    // 4-8. PERIOD (Purchases, Purchase Returns, Sales, Sales Returns)
    const ppRaw = await buildQuery(BarcodeBatch, 'base.created_at', true).getRawMany();
    const prRaw = await buildQuery(PurchaseReturnItem, 'pr.return_date', true).getRawMany();
    const psRaw = await buildQuery(SalesInvoiceItem, 'si.invoice_date', true).getRawMany();
    const srRaw = await buildQuery(SalesReturnItem, 'sr.return_date', true).getRawMany();

    const dataMap = new Map<string, any>();
    
    // If it's a global report, pre-load all vendors to handle names
    if (!vendorId) {
      const allVendors = await AppDataSource.getRepository(Vendor).find();
      allVendors.forEach(vend => {
        dataMap.set(vend.id, {
          vendor_id: vend.id,
          vendor_name: vend.name,
          opening_qty: 0, received_qty: 0, purchase_return_qty: 0, 
          sold_qty: 0, sales_return_qty: 0, closing_qty: 0, 
          sales_value: 0, purchase_value: 0, unit_cost: 0,
          received_mrp_value: 0, sold_mrp_value: 0
        });
      });
    }

    const getEntry = (d: any) => {
      const id = vendorId ? `${d.design_no}|${d.size_name || ''}|${d.color_name || ''}` : d.id;
      if (!id) return null;
      if (!dataMap.has(id)) {
        dataMap.set(id, {
          vendor_id: vendorId ? undefined : d.id,
          vendor_name: vendorId ? undefined : d.name,
          item_id: id,
          design_no: d.design_no,
          size_name: d.size_name,
          color_name: d.color_name,
          display_name: vendorId ? `${d.design_no} (${d.color_name || 'N/A'} / ${d.size_name || 'N/A'})` : d.name,
          opening_qty: 0, received_qty: 0, sold_qty: 0, returns_qty: 0, closing_qty: 0, 
          sales_value: 0, purchase_value: 0, unit_cost: 0,
          received_mrp_value: 0, sold_mrp_value: 0
        });
      }
      return dataMap.get(id);
    };

    opRaw.forEach(d => { 
      const v = getEntry(d); 
      if (v) {
        v.opening_qty += parseFloat(d.qty || 0); 
        // Populate unit_cost from opening if not already set
        if (!v.unit_cost) {
          const qty = parseFloat(d.qty);
          const val = parseFloat(d.value);
          v.unit_cost = qty > 0 ? (val / qty) : 0;
        }
      }
    });

    osRaw.forEach(d => { const v = getEntry(d); if (v) v.opening_qty -= parseFloat(d.qty || 0); });
    orRaw.forEach(d => { const v = getEntry(d); if (v) v.opening_qty += parseFloat(d.qty || 0); });
    poRaw.forEach(d => { const v = getEntry(d); if (v) v.opening_qty -= parseFloat(d.qty || 0); });

    ppRaw.forEach(d => { 
      const v = getEntry(d); 
      if (v) {
        v.received_qty += parseFloat(d.qty || 0);
        v.purchase_value += parseFloat(d.value || 0);
        v.received_mrp_value += parseFloat(d.mrp_value || 0);
        v.unit_cost = v.received_qty > 0 ? (v.purchase_value / v.received_qty) : 0;
      }
    });

    prRaw.forEach(d => { 
      const v = getEntry(d); 
      if (v) {
        v.purchase_return_qty += parseFloat(d.qty || 0);
        // Also subtract from purchase_value to get net purchase value
        v.purchase_value -= parseFloat(d.value || 0);
        v.received_mrp_value -= parseFloat(d.mrp_value || 0);
      }
    });

    psRaw.forEach(d => { 
      const v = getEntry(d); 
      if (v) {
        v.sold_qty += parseFloat(d.qty || 0); 
        v.sales_value += parseFloat(d.value || 0);
        v.sold_mrp_value += parseFloat(d.mrp_value || 0);
        // Fallback unit_cost from sales item
        if (!v.unit_cost) {
          v.unit_cost = parseFloat(d.cost_actual || d.cost || 0);
        }
      }
    });

    srRaw.forEach(d => { 
      const v = getEntry(d); 
      if (v) {
        v.sales_return_qty += parseFloat(d.qty || 0); 
        // SUBTRACT from sales_value to get NET SALES VALUE
        v.sales_value -= parseFloat(d.value || 0);
        v.sold_mrp_value -= parseFloat(d.mrp_value || 0);
      }
    });

    let results = Array.from(dataMap.values())
      .map(v => {
        const net_purchase_qty = (v.received_qty || 0) - (v.purchase_return_qty || 0);
        const net_sales_qty = (v.sold_qty || 0) - (v.sales_return_qty || 0);
        const raw_closing = (v.opening_qty || 0) + net_purchase_qty - net_sales_qty;
        
        // Final reporting: Do not show negative stock to the vendor/user. 
        // Negative stock usually indicates unrecorded purchases or old data errors.
        const opening_qty = Math.max(0, v.opening_qty || 0);
        const closing_qty = Math.max(0, raw_closing);

        return {
          ...v,
          opening_qty,
          net_purchase_qty,
          net_sales_qty,
          closing_qty,
          unit_cost: v.unit_cost || 0,
          total_cost: closing_qty * (v.unit_cost || 0)
        };
      })
      .filter(v => 
        // Only show items with actual stock OR activity in the period.
        // Hides purely negative "ghost" items from old data errors.
        v.opening_qty > 0.001 || 
        v.closing_qty > 0.001 || 
        Math.abs(v.received_qty || 0) > 0.001 || 
        Math.abs(v.purchase_return_qty || 0) > 0.001 ||
        Math.abs(v.sold_qty || 0) > 0.001 || 
        Math.abs(v.sales_return_qty || 0) > 0.001
      );

    // Apply Sorting
    if (sortField) {
      const dir = sortDirection?.toUpperCase() === 'DESC' ? -1 : 1;
      results.sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];
        
        // Handle numeric fields specifically if needed, but JS sort handles them fine if they are numbers
        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();
        
        if (valA < valB) return -1 * dir;
        if (valA > valB) return 1 * dir;
        return 0;
      });
    }

    return results;
  }

  async advanceAnalysis(filters: { startDate: string, endDate: string }) {
    const start = filters.startDate.split('T')[0];
    const end = filters.endDate.split('T')[0];

    const advances = await AppDataSource.getRepository(SalesOrderAdvance).find({
      where: {
        created_at: Raw((alias: string) => `${alias}::date BETWEEN :start AND :end`, { start, end })
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
         start: filters.startDate.split('T')[0],
         end: filters.endDate.split('T')[0]
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

  async designAnalysisReport(filters: { design_no: string, vendorId?: string }) {
    // 1. Fetch BarcodeBatches for this design
    const qb = AppDataSource.getRepository(BarcodeBatch)
      .createQueryBuilder('bb')
      .leftJoinAndSelect('bb.color', 'c')
      .leftJoinAndSelect('bb.size', 's')
      .where('bb.design_no = :designNo', { designNo: filters.design_no });

    if (filters.vendorId) {
      qb.andWhere('bb.vendor_id = :vendorId', { vendorId: filters.vendorId });
    }

    const batches = await qb.orderBy('bb.created_at', 'DESC').getMany();

    if (batches.length === 0) return [];

    const barcodes = batches.map(b => b.barcode_alias_8digit);

    // 2. Fetch Sales
    const sales = await AppDataSource.getRepository(SalesInvoiceItem)
      .createQueryBuilder('sii')
      .innerJoinAndSelect('sii.invoice', 'si')
      .where('sii.barcode_8digit IN (:...ids)', { ids: barcodes })
      .getMany();

    // 3. Fetch Sales Returns
    const salesReturns = await AppDataSource.getRepository(SalesReturnItem)
      .createQueryBuilder('sri')
      .innerJoinAndSelect('sri.salesReturn', 'sr')
      .where('sri.barcode_8digit IN (:...ids)', { ids: barcodes })
      .getMany();

    // 4. Fetch Purchase Returns
    const purchaseReturns = await AppDataSource.getRepository(PurchaseReturnItem)
      .createQueryBuilder('pri')
      .innerJoinAndSelect('pri.purchase_return', 'pr')
      .where('pri.barcode_id IN (:...ids)', { ids: barcodes })
      .getMany();

    // 5. Build Barcode Ledger
    return batches.map(b => {
      const alias = b.barcode_alias_8digit;
      const bSales = sales.filter(s => s.barcode_8digit === alias);
      const bSalesReturns = salesReturns.filter(sr => sr.barcode_8digit === alias);
      const bPurchaseReturns = purchaseReturns.filter(pr => pr.barcode_id === alias);

      // Status calculation
      let status = 'Available';
      let statusColor = 'emerald';
      let soldDate = null;
      let returnDate = null;

      if (bPurchaseReturns.length > 0) {
        status = 'Returned to Vendor';
        statusColor = 'rose';
        returnDate = bPurchaseReturns[0].created_at;
      } else if (bSales.length > 0) {
        const latestSale = bSales.sort((a,b) => b.created_at.getTime() - a.created_at.getTime())[0];
        const latestReturn = bSalesReturns.sort((a,b) => b.created_at.getTime() - a.created_at.getTime())[0];

        if (latestReturn && latestReturn.created_at > latestSale.created_at) {
          status = 'Available (Returned)';
          statusColor = 'emerald';
        } else {
          status = 'Sold';
          statusColor = 'blue';
          soldDate = latestSale.created_at;
        }
      }

      return {
        id: b.id,
        barcode_id: alias,
        color: b.color?.name,
        size: b.size?.name,
        cost: b.cost_actual,
        mrp: b.mrp,
        photos: b.photos || [],
        available_quantity: b.available_quantity,
        total_quantity: b.total_quantity,
        created_at: b.created_at,
        status,
        statusColor,
        sold_date: soldDate,
        return_date: returnDate
      };
    });
  }

  async walletLedgerReport(filters: { search?: string; startDate?: string; endDate?: string; type?: string; page?: number; limit?: number }) {
    const page = Number(filters.page) || 1;
    const limit = Math.min(200, Math.max(1, Number(filters.limit) || 50));
    const offset = (page - 1) * limit;

    const params: any[] = [];
    let p = 1;

    const where: string[] = [];
    if (filters.search) {
      params.push(`%${filters.search}%`);
      where.push(`(t.mobile ILIKE $${p} OR t.name ILIKE $${p} OR t.reference ILIKE $${p} OR t.invoice_no ILIKE $${p} OR t.external_no ILIKE $${p})`);
      p++;
    }
    if (filters.type && (filters.type === 'Advance' || filters.type === 'Credit Coupon')) {
      params.push(filters.type);
      where.push(`t.type = $${p}`);
      p++;
    }
    if (filters.startDate) {
      params.push(filters.startDate.split('T')[0]);
      where.push(`t.transaction_date::date >= $${p}::date`);
      p++;
    }
    if (filters.endDate) {
      params.push(filters.endDate.split('T')[0]);
      where.push(`t.transaction_date::date <= $${p}::date`);
      p++;
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const baseSql = `
      WITH t AS (
        -- Credit Coupons: Issuance (Credit)
        SELECT
          'Credit'::text AS entry_type,
          'Credit Coupon'::text AS type,
          cc.customer_mobile::text AS mobile,
          COALESCE(c.name, '-')::text AS name,
          cc.created_at::timestamptz AS transaction_date,
          cc.coupon_no::text AS external_no,
          cc.amount::numeric AS transaction_amount,
          cc.amount::numeric AS original_amount,
          GREATEST(0, (cc.amount::numeric - COALESCE(used.used_amount, 0)))::numeric AS remaining_amount,
          '-'::text AS invoice_no,
          COALESCE(
            'Return: ' || sr.return_number || ' | Invoice: ' || sr.invoice_number,
            'Manual Generation'
          )::text AS reference
        FROM credit_coupons cc
        LEFT JOIN customers c ON c.mobile = cc.customer_mobile
        LEFT JOIN sales_returns sr ON sr.id = cc.original_sales_return_id
        LEFT JOIN (
          SELECT coupon_id, COALESCE(SUM(amount_applied)::numeric, 0) AS used_amount
          FROM credit_coupon_applications
          GROUP BY coupon_id
        ) used ON used.coupon_id = cc.id

        UNION ALL

        -- Credit Coupons: Usage (Debit)
        SELECT
          'Debit'::text AS entry_type,
          'Credit Coupon'::text AS type,
          cc.customer_mobile::text AS mobile,
          COALESCE(c.name, '-')::text AS name,
          cc.created_at::timestamptz AS transaction_date,
          cc.coupon_no::text AS external_no,
          (-1 * cca.amount_applied)::numeric AS transaction_amount,
          cc.amount::numeric AS original_amount,
          GREATEST(0, (cc.amount::numeric - COALESCE(used.used_amount, 0)))::numeric AS remaining_amount,
          si.invoice_number::text AS invoice_no,
          'Applied to Invoice'::text AS reference
        FROM credit_coupon_applications cca
        INNER JOIN credit_coupons cc ON cc.id = cca.coupon_id
        INNER JOIN sales_invoices si ON si.id = cca.invoice_id
        LEFT JOIN customers c ON c.mobile = cc.customer_mobile
        LEFT JOIN (
          SELECT coupon_id, COALESCE(SUM(amount_applied)::numeric, 0) AS used_amount
          FROM credit_coupon_applications
          GROUP BY coupon_id
        ) used ON used.coupon_id = cc.id

        UNION ALL

        -- Advance: Issuance (Credit)
        SELECT
          'Credit'::text AS entry_type,
          'Advance'::text AS type,
          COALESCE(c.mobile, '-')::text AS mobile,
          COALESCE(c.name, '-')::text AS name,
          soa.created_at::timestamptz AS transaction_date,
          soa.receipt_number::text AS external_no,
          soa.amount::numeric AS transaction_amount,
          soa.amount::numeric AS original_amount,
          GREATEST(0, (soa.amount::numeric - COALESCE(used.used_amount, 0)))::numeric AS remaining_amount,
          '-'::text AS invoice_no,
          COALESCE('Sales Order: ' || so.order_number, 'Manual Advance')::text AS reference
        FROM sales_order_advances soa
        INNER JOIN sales_orders so ON so.id = soa.sales_order_id
        LEFT JOIN customers c ON c.id = so.customer_id
        LEFT JOIN (
          SELECT advance_id, COALESCE(SUM(amount_applied)::numeric, 0) AS used_amount
          FROM sales_order_advance_applications
          GROUP BY advance_id
        ) used ON used.advance_id = soa.id

        UNION ALL

        -- Advance: Usage (Debit)
        SELECT
          'Debit'::text AS entry_type,
          'Advance'::text AS type,
          COALESCE(c.mobile, '-')::text AS mobile,
          COALESCE(c.name, '-')::text AS name,
          soaa.created_at::timestamptz AS transaction_date,
          soa.receipt_number::text AS external_no,
          (-1 * soaa.amount_applied)::numeric AS transaction_amount,
          soa.amount::numeric AS original_amount,
          GREATEST(0, (soa.amount::numeric - COALESCE(used.used_amount, 0)))::numeric AS remaining_amount,
          si.invoice_number::text AS invoice_no,
          'Applied to Invoice'::text AS reference
        FROM sales_order_advance_applications soaa
        INNER JOIN sales_order_advances soa ON soa.id = soaa.advance_id
        INNER JOIN sales_invoices si ON si.id = soaa.invoice_id
        INNER JOIN sales_orders so ON so.id = soa.sales_order_id
        LEFT JOIN customers c ON c.id = so.customer_id
        LEFT JOIN (
          SELECT advance_id, COALESCE(SUM(amount_applied)::numeric, 0) AS used_amount
          FROM sales_order_advance_applications
          GROUP BY advance_id
        ) used ON used.advance_id = soa.id
      )
      SELECT *
      FROM t
      ${whereSql}
      ORDER BY t.transaction_date DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const countSql = `
      WITH t AS (
        -- Issuance
        SELECT 
           'Credit Coupon'::text AS type, cc.customer_mobile::text AS mobile, COALESCE(cust.name, '-')::text AS name, cc.coupon_no::text AS external_no, cc.created_at::timestamptz AS transaction_date, '-'::text AS invoice_no, 'Manual/Return'::text AS reference
        FROM credit_coupons cc
        LEFT JOIN customers cust ON cust.mobile = cc.customer_mobile
        
        UNION ALL
        
        -- Application
        SELECT 
           'Credit Coupon'::text AS type, cc.customer_mobile::text AS mobile, COALESCE(cust.name, '-')::text AS name, cc.coupon_no::text AS external_no, cca.created_at::timestamptz AS transaction_date, si.invoice_number::text AS invoice_no, 'Applied'::text AS reference
        FROM credit_coupon_applications cca 
        INNER JOIN credit_coupons cc ON cc.id = cca.coupon_id
        INNER JOIN sales_invoices si ON si.id = cca.invoice_id
        LEFT JOIN customers cust ON cust.mobile = cc.customer_mobile

        UNION ALL
        
        -- Advance Issuance
        SELECT 
           'Advance'::text AS type, c.mobile::text AS mobile, COALESCE(c.name, '-')::text AS name, soa.receipt_number::text AS external_no, soa.created_at::timestamptz AS transaction_date, '-'::text AS invoice_no, 'Advance'::text AS reference
        FROM sales_order_advances soa 
        INNER JOIN sales_orders so ON so.id = soa.sales_order_id 
        LEFT JOIN customers c ON c.id = so.customer_id
        
        UNION ALL
        
        -- Advance Application
        SELECT 
           'Advance'::text AS type, c.mobile::text AS mobile, COALESCE(c.name, '-')::text AS name, soa.receipt_number::text AS external_no, soaa.created_at::timestamptz AS transaction_date, si.invoice_number::text AS invoice_no, 'Applied'::text AS reference 
        FROM sales_order_advance_applications soaa 
        INNER JOIN sales_order_advances soa ON soa.id = soaa.advance_id 
        INNER JOIN sales_orders so ON so.id = soa.sales_order_id 
        INNER JOIN sales_invoices si ON si.id = soaa.invoice_id
        LEFT JOIN customers c ON c.id = so.customer_id
      )
      SELECT COUNT(*)::int AS total
      FROM t
      ${whereSql}
    `;

    const [rows, countRows] = await Promise.all([
      AppDataSource.query(baseSql, params),
      AppDataSource.query(countSql, params),
    ]);

    const total = Number(countRows?.[0]?.total || 0);
    return { data: rows, total, page, limit };
  }

  async pendingPaymentsReport() {
    const invoices = await AppDataSource.getRepository(SalesInvoice).find({
      where: {
        amount_pending: MoreThanOrEqual(1) // Show invoices with at least 1 rupee pending to avoid ghost balances
      },
      order: {
        invoice_date: 'DESC'
      },
      relations: ['customer']
    });

    if (invoices.length === 0) return { invoices: [], receipts: {} };

    const invoiceIds = invoices.map(inv => inv.id);

    // Fetch all receipt items for these invoices
    const receiptItems = await AppDataSource.getRepository(PaymentReceiptItem).find({
      where: {
        invoice_id: In(invoiceIds)
      },
      relations: ['receipt'],
      order: {
        receipt: {
          receipt_date: 'DESC'
        }
      }
    });

    // Fetch all sales returns for these invoices
    const salesReturns = await AppDataSource.getRepository(SalesReturn).find({
      where: {
        invoice_id: In(invoiceIds)
      },
      order: {
        return_date: 'DESC'
      }
    });

    // Grouping by invoice_id
    const receiptsMap: Record<string, any[]> = {};
    
    invoices.forEach(inv => {
      // Check if there was an initial payment at the time of sale
      // We can use the payment_details if available, or just the initial amount_paid
      // Since amount_paid in SalesInvoice is cumulative (usually), we need to be careful.
      // However, usually amount_paid starts with what was paid at sale.
      
      // Calculate sum of subsequent payments
      const subReceipts = receiptItems.filter(ri => ri.invoice_id === inv.id);
      const subTotal = subReceipts.reduce((sum, ri) => sum + Number(ri.amount_paid), 0);
      
      const subReturns = salesReturns.filter(sr => sr.invoice_id === inv.id);
      const returnTotal = subReturns.reduce((sum, sr) => sum + Number(sr.total_return_amount), 0);
      
      // Initial paid = Total Paid minus sum of subsequent payment items/returns?
      // Actually, in this system, it seems amount_paid IS updated by subsequent items.
      const initialPaid = Number(inv.amount_paid) - subTotal + returnTotal; // returns reduce amount_pending, not necessarily increase amount_paid
      
      // Wait, let's look at getPaymentAmount in frontend.
      // If we have payment_details on the invoice, that's our initial payment.
      if (inv.payment_details && inv.payment_details.length > 0) {
        if (!receiptsMap[inv.id]) receiptsMap[inv.id] = [];
        
        let details = inv.payment_details;
        if (typeof details === 'string') {
          try { details = JSON.parse(details); } catch(e) {}
        }
        
        if (Array.isArray(details)) {
          details.forEach((d: any) => {
            receiptsMap[inv.id].push({
              id: `initial-${inv.id}-${d.mode}`,
              receipt_date: inv.invoice_date,
              amount_received: d.amount,
              payment_mode: d.mode,
              receipt_number: 'Sale Payment',
              is_initial: true
            });
          });
        }
      } else if (initialPaid > 0) {
        // Fallback for invoices without details but with initial paid
        if (!receiptsMap[inv.id]) receiptsMap[inv.id] = [];
        receiptsMap[inv.id].push({
          id: `initial-${inv.id}`,
          receipt_date: inv.invoice_date,
          amount_received: initialPaid,
          payment_mode: inv.payment_mode || 'Mix',
          receipt_number: 'Sale Payment',
          is_initial: true
        });
      }
    });

    receiptItems.forEach(item => {
      if (!receiptsMap[item.invoice_id]) receiptsMap[item.invoice_id] = [];
      receiptsMap[item.invoice_id].push({
        id: item.id,
        receipt_date: item.receipt.receipt_date,
        amount_received: item.amount_paid, // This is what was actually paid for THIS invoice
        payment_mode: item.receipt.payment_mode,
        receipt_number: item.receipt.receipt_number,
        is_receipt: true
      });
    });

    salesReturns.forEach(ret => {
      if (!receiptsMap[ret.invoice_id]) receiptsMap[ret.invoice_id] = [];
      receiptsMap[ret.invoice_id].push({
        id: ret.id,
        receipt_date: ret.return_date,
        amount_received: ret.total_return_amount,
        payment_mode: 'Sales Return',
        receipt_number: ret.return_number,
        is_return: true
      });
    });

    return { invoices, receipts: receiptsMap };
  }
}

export const reportService = new ReportService();
