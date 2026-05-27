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
import { ProductMaster } from '../entities/ProductMaster';
import { CreditCoupon } from '../entities/CreditCoupon';
import { Between, MoreThanOrEqual, LessThanOrEqual, Raw, In, Not, MoreThan } from 'typeorm';
import logger from '../utils/logger';

export interface SalesReportFilters {
  startDate: string;
  endDate: string;
  vendorId?: string;
  floorId?: string;
  page?: number;
  limit?: number;
  summaryOnly?: boolean;
  exportMode?: boolean;
}

export class ReportService {
  // Daily Sales Report
  async dailySales(date: string) {
    const invoices = await AppDataSource.getRepository(SalesInvoice).find({
      where: { invoice_date: new Date(date) as any },
      relations: ['items', 'salesman', 'items.salesman', 'items.product_item'],
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

  async salesReport(filters: SalesReportFilters) {
    const startTime = Date.now();
    logger.info(`[Perf] salesReport started: ${JSON.stringify(filters)}`);

    const start = filters.startDate.split('T')[0];
    const end = filters.endDate.split('T')[0] + ' 23:59:59';
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const summaryOnly = filters.summaryOnly || false;
    const exportMode = filters.exportMode || false;

    // --- PHASE 1: HIGH-SPEED SQL SUMMARY ---
    // We calculate the core totals using separate queries to avoid "Join Inflation"
    // (where invoice totals are multiplied by the number of items).
    const invoiceSummaryQB = AppDataSource.getRepository(SalesInvoice)
      .createQueryBuilder('si')
      .select([
        'COUNT(si.id) as "invoiceCount"',
        'SUM(si.net_payable) as "totalSales"',
        'SUM(si.total_mrp) as "totalMRP"',
        'SUM(si.total_gst) as "totalGST"',
        'SUM(si.taxable_value) as "taxableValue"',
        'SUM(si.total_discount) as "totalDiscount"',
        'SUM(si.special_discount) as "totalSpecialDiscount"',
        'SUM(si.loyalty_redemption_amount) as "totalLoyalty"',
        'SUM(si.voucher_discount) as "totalVoucher"',
        'SUM(si.cgst_5) as "cgst_5"',
        'SUM(si.sgst_5) as "sgst_5"',
        'SUM(si.cgst_18) as "cgst_18"',
        'SUM(si.sgst_18) as "sgst_18"'
      ])
      .where('si.invoice_date BETWEEN :start AND :end', { start, end });

    const quantityQB = AppDataSource.getRepository(SalesInvoiceItem)
      .createQueryBuilder('sii')
      .innerJoin('sii.invoice', 'si')
      .select('SUM(sii.quantity) as "grossQuantity"')
      .where('si.invoice_date BETWEEN :start AND :end', { start, end });

    const returnSummaryQB = AppDataSource.getRepository(SalesReturn)
      .createQueryBuilder('sr')
      .select([
        'COUNT(sr.id) as "returnCount"',
        'SUM(sr.total_return_amount) as "totalReturnAmount"',
        'SUM(sr.total_discount_amount) as "totalReturnDiscount"'
      ])
      .where('sr.return_date BETWEEN :start AND :end', { start, end });

    const returnQtyQB = AppDataSource.getRepository('sales_return_items')
      .createQueryBuilder('sri')
      .innerJoin('sri.salesReturn', 'sr')
      .select('SUM(sri.quantity) as "returnQuantity"')
      .where('sr.return_date BETWEEN :start AND :end', { start, end });

    if (filters.floorId) {
      invoiceSummaryQB.andWhere('si.floor_id::text = :floorId', { floorId: filters.floorId });
      quantityQB.andWhere('si.floor_id::text = :floorId', { floorId: filters.floorId });
      // Returns do not have direct floor mappings, but keeping consistency where possible
    }

    if (filters.vendorId) {
      // If filtering by vendor, we only count the contribution of THAT vendor's items
      invoiceSummaryQB.innerJoin('si.items', 'agg_items')
                      .innerJoin('agg_items.product_item', 'agg_bb')
                      .andWhere('agg_bb.vendor::text = :vendorId', { vendorId: filters.vendorId });
      
      quantityQB.innerJoin('sii.product_item', 'bb')
                .andWhere('bb.vendor::text = :vendorId', { vendorId: filters.vendorId });
      
      // Note: For vendor-specific sales, si.net_payable is not accurate because it's the whole invoice.
      // However, for the high-level summary cards, we show the invoices that CONTAIN that vendor's items.
      // If we want item-level precision, it will be calculated in Phase 1.5.
    }

    const [rawSummary, rawQty, rawRetSummary, rawRetQty] = await Promise.all([
      invoiceSummaryQB.getRawOne(),
      quantityQB.getRawOne(),
      returnSummaryQB.getRawOne(),
      returnQtyQB.getRawOne()
    ]);
    
    const grossSales = parseFloat(rawSummary.totalSales) || 0;
    const returnAmount = parseFloat(rawRetSummary?.totalReturnAmount) || 0;
    
    const grossQty = parseInt(rawQty?.grossQuantity) || 0;
    const netReturnQty = parseInt(rawRetQty?.returnQuantity) || 0;

    const result = {
      totalSales: grossSales - returnAmount,
      grossSales: grossSales,
      totalReturnAmount: returnAmount,
      totalMRP: parseFloat(rawSummary.totalMRP) || 0,
      totalDiscount: parseFloat(rawSummary.totalDiscount) || 0,
      totalGST: parseFloat(rawSummary.totalGST) || 0,
      taxableValue: parseFloat(rawSummary.taxableValue) || 0,
      totalSpecialDiscount: parseFloat(rawSummary.totalSpecialDiscount) || 0,
      totalLoyalty: parseFloat(rawSummary.totalLoyalty) || 0,
      totalVoucher: parseFloat(rawSummary.totalVoucher) || 0,
      totalPending: 0,
      invoiceCount: parseInt(rawSummary.invoiceCount) || 0,
      cgst_5: parseFloat(rawSummary.cgst_5) || 0,
      sgst_5: parseFloat(rawSummary.sgst_5) || 0,
      cgst_18: parseFloat(rawSummary.cgst_18) || 0,
      sgst_18: parseFloat(rawSummary.sgst_18) || 0,
      paymentBreakdown: {
        Cash: 0, UPI: 0, Card: 0, Online: 0, Advance: 0, Approval: 0,
        'Credit Coupon': 0, 'Exchange': 0, 'Others': 0, 'Return Credit': 0
      },
      returnCreditNotes: 0,
      totalQuantity: grossQty - netReturnQty,
      grossQuantity: grossQty,
      returnQuantity: netReturnQty,
      topItems: [],
      approvalItemCount: 0,
      totalReturns: 0
    };

    // Quick Returns Summary - NOTE: returnAmount already deducted from totalSales above (line 186)
    // and netReturnQty already deducted from totalQuantity above (line 207).
    // This block only sets result.totalReturns for display in the Returns card.
    // DO NOT deduct again here.
    result.totalReturns = returnAmount; // Already computed from Phase 1 SQL

    // --- PHASE 1.5: GLOBAL SUMMARY AGGREGATION ---
    // We fetch ALL invoices in the range but WITHOUT the "Items" relation to keep it fast.
    // This ensures summary cards (Cash, Card, Pending) are 100% accurate for the whole range.
    const summaryListQB = AppDataSource.getRepository(SalesInvoice)
      .createQueryBuilder('si')
      .leftJoinAndSelect('si.receipt_items', 'ri')
      .leftJoinAndSelect('ri.receipt', 'receipt')
      .leftJoinAndSelect('si.sales_returns', 'sr')
      .leftJoinAndSelect('si.coupon_applications', 'ca')
      .leftJoinAndSelect('si.advance_applications', 'aa')
      .leftJoinAndSelect('si.credit_note_applications', 'cna')
      .where('si.invoice_date BETWEEN :start AND :end', { start, end });

    if (filters.floorId) summaryListQB.andWhere('si.floor_id = :floorId', { floorId: filters.floorId });
    if (filters.vendorId) {
      summaryListQB.innerJoin('si.items', 'agg_items')
                  .innerJoin('agg_items.product_item', 'agg_bb')
                  .andWhere('agg_bb.vendor::text = :vendorId', { vendorId: filters.vendorId });
    }

    const allInvoicesSummary = await summaryListQB.getMany();

    allInvoicesSummary.forEach(inv => {
      // 1. Payment Breakdown from payment_details JSON
      let paymentDetails = inv.payment_details;
      if (typeof paymentDetails === 'string') { try { paymentDetails = JSON.parse(paymentDetails); } catch (e) { paymentDetails = null; } }

      let detailsArray: any[] = [];
      if (paymentDetails) {
        if (Array.isArray(paymentDetails)) {
          detailsArray = paymentDetails.filter((pd: any) => {
            const k = (pd.mode || '').toString().toUpperCase();
            return !(k.includes('COUPON') || k.includes('ADVANCE') || k.includes('CREDIT NOTE') || k.includes('RETURN'));
          });
        } else if (typeof paymentDetails === 'object' && paymentDetails !== null) {
          const techKeys = ['TOTAL_MRP', 'NET_PAYABLE', 'ITEMS', 'ID', 'TOTAL_AMOUNT', 'ROUND_OFF', 'AMOUNT_PAID', 'AMOUNT_PENDING', 'SPECIAL_DISCOUNT', 'VOUCHER_DISCOUNT', 'LOYALTY_REDEMPTION_AMOUNT', 'TOTAL_GST', 'TAXABLE_VALUE'];
          detailsArray = Object.entries(paymentDetails)
            .filter(([key, val]) => {
              const k = key.toUpperCase();
              if (techKeys.includes(k)) return false;
              if (k.includes('COUPON') || k.includes('ADVANCE') || k.includes('CREDIT NOTE') || k.includes('RETURN')) return false;
              return (typeof val === 'number' || typeof val === 'string');
            })
            .map(([key, val]) => ({ mode: key, amount: val }));
        }
      }

      // 2. Applications from other tables
      const receiptPayments = (inv.receipt_items || []).map((ri: any) => ({
        mode: ri.receipt?.payment_mode || 'Receipt',
        amount: parseFloat(ri.amount_paid as any) || 0
      })).filter(p => {
        const k = (p.mode || '').toString().toUpperCase();
        return p.amount > 0 && !(k.includes('COUPON') || k.includes('ADVANCE') || k.includes('CREDIT NOTE') || k.includes('RETURN'));
      });

      const couponReceipts = (inv.coupon_applications || []).map((ca: any) => ({ mode: 'Credit Coupon', amount: parseFloat(ca.amount_applied as any) || 0 }));
      const advanceReceipts = (inv.advance_applications || []).map((aa: any) => ({ mode: 'Advance', amount: parseFloat(aa.amount_applied as any) || 0 }));
      const creditNoteReceipts = (inv.credit_note_applications || []).map((cna: any) => ({ mode: 'Credit Note', amount: parseFloat(cna.amount_applied as any) || 0 }));

      const totalExternalApplications = receiptPayments.reduce((s, r) => s + r.amount, 0) + couponReceipts.reduce((s, r) => s + r.amount, 0) + advanceReceipts.reduce((s, r) => s + r.amount, 0) + creditNoteReceipts.reduce((s, r) => s + r.amount, 0);
      
      const allSources = [...detailsArray.map((pd: any) => {
        const mode = (pd.mode || '').toString().toUpperCase();
        if (mode.includes('APPROVAL')) return { ...pd, amount: Math.max(0, (parseFloat(pd.amount as any) || 0) - totalExternalApplications) };
        return pd;
      }), ...receiptPayments, ...couponReceipts, ...advanceReceipts, ...creditNoteReceipts];

      let invBreakdown = { Cash: 0, UPI: 0, Card: 0, Online: 0, Advance: 0, Approval: 0, 'Credit Coupon': 0, 'Credit Note': 0, 'Exchange': 0, 'Others': 0 };

      allSources.forEach((pd: any) => {
        const rawMode = (pd.mode || '').toString().toUpperCase();
        const amount = parseFloat(pd.amount) || 0;
        if (amount <= 0) return;
        if (rawMode.includes('CASH')) invBreakdown.Cash += amount;
        else if (rawMode.includes('UPI') || rawMode.includes('PHONEPE') || rawMode.includes('GPAY') || rawMode.includes('PAYTM') || rawMode.includes('G PAY') || rawMode.includes('BHIM')) invBreakdown.UPI += amount;
        else if (rawMode.includes('COUPON')) invBreakdown['Credit Coupon'] += amount; 
        else if (rawMode.includes('CREDIT NOTE')) invBreakdown['Credit Note'] += amount;
        else if (rawMode.includes('CARD') || rawMode.includes('VISA') || rawMode.includes('POS') || rawMode.includes('MASTER') || rawMode.includes('DEBIT') || rawMode.includes('CREDIT')) invBreakdown.Card += amount;
        else if (rawMode.includes('RECEIPT') || rawMode.includes('RCP') || rawMode.includes('BANK') || rawMode.includes('ONLINE') || rawMode.includes('TRANSFER') || rawMode.includes('NEFT') || rawMode.includes('RTGS') || rawMode.includes('HDFC') || rawMode.includes('ICICI') || rawMode.includes('INTERNAL')) invBreakdown.Online += amount;
        else if (rawMode.includes('APPROVAL')) invBreakdown.Approval += amount;
        else if (rawMode.includes('ADVANCE')) invBreakdown.Advance += amount;
        else if (rawMode.includes('EXCHANGE')) invBreakdown.Exchange += amount;
        else invBreakdown.Others += amount;
      });

      const returnsAmt = (inv.sales_returns || []).reduce((s: number, r: any) => s + (Number(r.total_return_amount) || 0), 0);
      const totalPaidForInv = invBreakdown.Cash + invBreakdown.UPI + invBreakdown.Card + invBreakdown.Online + invBreakdown.Advance + invBreakdown['Credit Coupon'] + invBreakdown['Credit Note'] + invBreakdown.Exchange + invBreakdown.Others;
      let pending = Math.max(0, Number(inv.net_payable) - totalPaidForInv - returnsAmt);
      if (pending < 1) pending = 0;

      const isApproval = (inv as any).is_on_approval === true || invBreakdown.Approval > 0;

      // Accumulate into global result
      result.paymentBreakdown.Cash += invBreakdown.Cash;
      result.paymentBreakdown.UPI += invBreakdown.UPI;
      result.paymentBreakdown.Card += invBreakdown.Card;
      result.paymentBreakdown.Online += invBreakdown.Online;
      result.paymentBreakdown.Advance += invBreakdown.Advance;
      result.paymentBreakdown.Approval += isApproval ? pending : 0;
      result.paymentBreakdown['Credit Coupon'] += invBreakdown['Credit Coupon'];
      (result.paymentBreakdown as any).Exchange += invBreakdown.Exchange;
      (result.paymentBreakdown as any).Others += invBreakdown.Others;
      (result.paymentBreakdown as any)['Return Credit'] += returnsAmt;
      result.totalPending += pending;
    });

    if (summaryOnly) {
      return { ...result, detailedList: [] };
    }

    // --- PHASE 2: PAGINATED / SELECTIVE DETAILED LIST ---
    const qb = AppDataSource.getRepository(SalesInvoice)
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
      .where('si.invoice_date BETWEEN :start AND :end', { start, end });

    if (filters.floorId) qb.andWhere('si.floor_id::text = :floorId', { floorId: filters.floorId });
    if (filters.vendorId) qb.andWhere('bb.vendor::text = :vendorId', { vendorId: filters.vendorId });

    // Handle Pagination
    if (!exportMode) {
      qb.orderBy('si.created_at', 'DESC')
        .skip((page - 1) * limit)
        .take(limit);
    } else {
      qb.orderBy('si.created_at', 'ASC');
    }

    const invoices = await qb.getMany();

    const detailedList: any[] = [];
    invoices.forEach(inv => {
      // Re-use existing complex business logic for data integrity
      let invoiceItems = inv.items || [];
      if (filters.vendorId) {
        invoiceItems = invoiceItems.filter(item => (item as any).product_item?.vendor === filters.vendorId || (item as any).vendor_id === filters.vendorId);
        if (invoiceItems.length === 0) return;
      }

      const reconstructedMRP = invoiceItems.reduce((s, i) => s + (Number(i.mrp || i.selling_price || 0) * Number(i.quantity || 1)), 0);
      const reconstructedItemDisc = invoiceItems.reduce((s, i) => s + (Number(i.discount || 0) * Number(i.quantity || 1)), 0);
      
      const totalHeaderBundle = (parseFloat(inv.total_discount as any) || 0) + 
                               (parseFloat(inv.special_discount as any) || 0) + 
                               (parseFloat(inv.voucher_discount as any) || 0) + 
                               (parseFloat(inv.loyalty_redemption_amount as any) || 0);

      const totalDisc = (reconstructedItemDisc > 0.01) ? reconstructedItemDisc : totalHeaderBundle;
      const visualItemDiscount = Math.max(0, reconstructedItemDisc - (parseFloat(inv.special_discount as any) || 0) - (parseFloat(inv.loyalty_redemption_amount as any) || 0) - (parseFloat(inv.voucher_discount as any) || 0));
      const returnsAmt = (inv.sales_returns || []).reduce((s: number, r: any) => s + (Number(r.total_return_amount) || 0), 0);
      const originalNet = Math.round(reconstructedMRP - totalDisc + (parseFloat(inv.additional_charges_total as any) || 0));
      const finalNet = originalNet;

      // Payment Breakdown Logic (Existing)
      let paymentDetails = inv.payment_details;
      if (typeof paymentDetails === 'string') { try { paymentDetails = JSON.parse(paymentDetails); } catch (e) { paymentDetails = null; } }

      let detailsArray: any[] = [];
      if (paymentDetails) {
        if (Array.isArray(paymentDetails)) {
          detailsArray = paymentDetails.filter((pd: any) => {
            const k = (pd.mode || '').toString().toUpperCase();
            return !(k.includes('COUPON') || k.includes('ADVANCE') || k.includes('CREDIT NOTE') || k.includes('RETURN'));
          });
        } else if (typeof paymentDetails === 'object' && paymentDetails !== null) {
          const techKeys = ['TOTAL_MRP', 'NET_PAYABLE', 'ITEMS', 'ID', 'TOTAL_AMOUNT', 'ROUND_OFF', 'AMOUNT_PAID', 'AMOUNT_PENDING', 'SPECIAL_DISCOUNT', 'VOUCHER_DISCOUNT', 'LOYALTY_REDEMPTION_AMOUNT', 'TOTAL_GST', 'TAXABLE_VALUE'];
          detailsArray = Object.entries(paymentDetails)
            .filter(([key, val]) => {
              const k = key.toUpperCase();
              if (techKeys.includes(k)) return false;
              if (k.includes('COUPON') || k.includes('ADVANCE') || k.includes('CREDIT NOTE') || k.includes('RETURN')) return false;
              return (typeof val === 'number' || typeof val === 'string');
            })
            .map(([key, val]) => ({ mode: key, amount: val }));
        }
      }

      let invoicePaymentBreakdown = { Cash: 0, UPI: 0, Card: 0, Online: 0, Advance: 0, Approval: 0, 'Credit Coupon': 0, 'Credit Note': 0, 'Exchange': 0, 'Others': 0 };

      const receiptPayments = (inv.receipt_items || []).map((ri: any) => ({
        mode: ri.receipt?.payment_mode || 'Receipt',
        amount: parseFloat(ri.amount_paid as any) || 0
      })).filter(p => {
        const k = (p.mode || '').toString().toUpperCase();
        return p.amount > 0 && !(k.includes('COUPON') || k.includes('ADVANCE') || k.includes('CREDIT NOTE') || k.includes('RETURN'));
      });

      const couponReceipts = (inv.coupon_applications || []).map((ca: any) => ({ mode: 'Credit Coupon', amount: parseFloat(ca.amount_applied as any) || 0 }));
      const advanceReceipts = (inv.advance_applications || []).map((aa: any) => ({ mode: 'Advance', amount: parseFloat(aa.amount_applied as any) || 0 }));
      const creditNoteReceipts = (inv.credit_note_applications || []).map((cna: any) => ({ mode: 'Credit Note', amount: parseFloat(cna.amount_applied as any) || 0 }));

      const totalExternalApplications = receiptPayments.reduce((s, r) => s + r.amount, 0) + couponReceipts.reduce((s, r) => s + r.amount, 0) + advanceReceipts.reduce((s, r) => s + r.amount, 0) + creditNoteReceipts.reduce((s, r) => s + r.amount, 0);
      const allPaymentSources = [...detailsArray.map((pd: any) => {
        const mode = (pd.mode || '').toString().toUpperCase();
        if (mode.includes('APPROVAL')) return { ...pd, amount: Math.max(0, (parseFloat(pd.amount as any) || 0) - totalExternalApplications) };
        return pd;
      }), ...receiptPayments, ...couponReceipts, ...advanceReceipts, ...creditNoteReceipts];

      allPaymentSources.forEach((pd: any) => {
        const rawMode = (pd.mode || '').toString().toUpperCase();
        const amount = parseFloat(pd.amount) || 0;
        if (amount <= 0) return;
        if (rawMode.includes('CASH')) invoicePaymentBreakdown.Cash += amount;
        else if (rawMode.includes('UPI') || rawMode.includes('PHONEPE') || rawMode.includes('GPAY') || rawMode.includes('PAYTM') || rawMode.includes('G PAY') || rawMode.includes('BHIM')) invoicePaymentBreakdown.UPI += amount;
        else if (rawMode.includes('COUPON')) invoicePaymentBreakdown['Credit Coupon'] += amount; 
        else if (rawMode.includes('CREDIT NOTE')) invoicePaymentBreakdown['Credit Note'] += amount;
        else if (rawMode.includes('CARD') || rawMode.includes('VISA') || rawMode.includes('POS') || rawMode.includes('MASTER') || rawMode.includes('DEBIT') || rawMode.includes('CREDIT')) invoicePaymentBreakdown.Card += amount;
        else if (rawMode.includes('RECEIPT') || rawMode.includes('RCP') || rawMode.includes('BANK') || rawMode.includes('ONLINE') || rawMode.includes('TRANSFER') || rawMode.includes('NEFT') || rawMode.includes('RTGS') || rawMode.includes('HDFC') || rawMode.includes('ICICI') || rawMode.includes('INTERNAL')) invoicePaymentBreakdown.Online += amount;
        else if (rawMode.includes('APPROVAL')) invoicePaymentBreakdown.Approval += amount;
        else if (rawMode.includes('ADVANCE')) invoicePaymentBreakdown.Advance += amount;
        else if (rawMode.includes('EXCHANGE')) invoicePaymentBreakdown.Exchange += amount;
        else invoicePaymentBreakdown.Others += amount;
      });

      const finalRealPaid = invoicePaymentBreakdown.Cash + invoicePaymentBreakdown.UPI + invoicePaymentBreakdown.Card + invoicePaymentBreakdown.Online + invoicePaymentBreakdown.Advance + invoicePaymentBreakdown['Credit Coupon'] + invoicePaymentBreakdown['Credit Note'] + invoicePaymentBreakdown.Exchange + invoicePaymentBreakdown.Others;
      let adjustedPending = Math.max(0, originalNet - finalRealPaid - returnsAmt);
      if (adjustedPending < 1) adjustedPending = 0;

      const isApprovalInvoice = (inv as any).is_on_approval === true || invoicePaymentBreakdown.Approval > 0;

      detailedList.push({
        ...inv,
        salesman_name_display: inv.salesman?.name || (inv.items && inv.items[0] && (inv.items[0] as any).salesman?.name) || '-',
        gross_mrp: reconstructedMRP,
        base_discount: visualItemDiscount,
        special_discount: parseFloat(inv.special_discount as any) || 0,
        loyalty_redemption: parseFloat(inv.loyalty_redemption_amount as any) || 0,
        net_payable: finalNet,
        cash_payment: invoicePaymentBreakdown.Cash,
        upi_payment: invoicePaymentBreakdown.UPI,
        coupon_payment: invoicePaymentBreakdown['Credit Coupon'],
        advance_payment: invoicePaymentBreakdown.Advance,
        credit_note_payment: invoicePaymentBreakdown['Credit Note'],
        total_payment: finalRealPaid,
        amount_pending: adjustedPending,
        approval_amount: isApprovalInvoice ? adjustedPending : 0,
        is_on_approval: isApprovalInvoice,
        payment_breakdown: invoicePaymentBreakdown,
        payment_status: (adjustedPending <= 0.05) ? 'paid' : (finalRealPaid > 0.1 ? 'partial' : 'pending'),
        total_qty: inv.items ? inv.items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0) : 0,
        return_credit: returnsAmt
      });
    });

    return {
      ...result,
      avgInvoiceValue: result.invoiceCount > 0 ? result.totalSales / result.invoiceCount : 0,
      detailedList,
      page,
      limit,
      hasMore: detailedList.length === limit
    };
  }

  async inventoryReport(filters: {
    startDate?: string;
    endDate?: string;
    vendorId?: string;
    floorId?: string;
    page?: number;
    limit?: number; 
    exportMode?: boolean | string;
    design?: string;
    barcode?: string;
    productGroup?: string;
    size?: string;
    color?: string;
    poInvoiceNumber?: string;
    includePhotos?: boolean | string;
    skipSummary?: boolean | string;
    sortField?: string;
    sortDirection?: 'ASC' | 'DESC' | string;
  } = {}) {
    try {
      const exportMode = filters.exportMode === true || filters.exportMode === 'true';
      const includePhotos = filters.includePhotos === true || filters.includePhotos === 'true';
      const page = Number(filters.page) || 1;
      const limit = Number(filters.limit) || (exportMode ? 100000 : 50);

      const startTime = Date.now();
      logger.info(`[Perf] inventoryReport started: ${JSON.stringify(filters)}`);

      let summaryData: any = {};

      const startDateStr = filters.startDate?.split('T')[0] || '2000-01-01';
      const endDateStr = (filters.endDate?.split('T')[0] || '2099-12-31') + ' 23:59:59';

      // 1. Build dynamic WHERE sql clauses
      const whereClauses: string[] = ["1=1"];
      
      whereClauses.push(`po.order_date BETWEEN '${startDateStr}' AND '${endDateStr}'`);
      
      if (filters.vendorId) {
        whereClauses.push(`po.vendor::text = '${filters.vendorId}'`);
      }
      if (filters.floorId) {
        whereClauses.push(`pi.floor_id::text = '${filters.floorId}'`);
      }
      if (filters.design) {
        whereClauses.push(`pi.design_no ILIKE '%${filters.design}%'`);
      }
      if (filters.barcode) {
        whereClauses.push(`EXISTS (
          SELECT 1 FROM barcode_batches bb 
          WHERE bb.po_id = pi.po_id AND bb.design_no = pi.design_no AND bb.status != 'deleted'
            AND (bb.barcode_alias_8digit ILIKE '%${filters.barcode}%' OR bb.barcode_structured ILIKE '%${filters.barcode}%')
        )`);
      }
      if (filters.productGroup) {
        whereClauses.push(`pg.name ILIKE '%${filters.productGroup}%'`);
      }
      if (filters.size) {
        whereClauses.push(`sz.name ILIKE '%${filters.size}%'`);
      }
      if (filters.color) {
        whereClauses.push(`cl.name ILIKE '%${filters.color}%'`);
      }
      if (filters.poInvoiceNumber) {
        whereClauses.push(`po.invoice_number ILIKE '%${filters.poInvoiceNumber}%'`);
      }

      const whereSql = whereClauses.join(' AND ');

      // 2. Query total count for pagination
      const totalCountRes = await AppDataSource.query(`
        SELECT COUNT(*) as count FROM (
          SELECT 1
          FROM purchase_items pi
          INNER JOIN purchase_orders po ON po.id = pi.po_id
          LEFT JOIN vendors v ON v.id = po.vendor
          LEFT JOIN product_groups pg ON pg.id = pi.product_group
          LEFT JOIN colors cl ON cl.id = pi.color
          LEFT JOIN sizes sz ON sz.id = pi.size
          WHERE ${whereSql}
          GROUP BY 
            pi.po_id, pi.design_no, pi.color, pi.size, pi.cost_per_item, pi.mrp,
            po.invoice_number, po.order_date, v.name, pg.name, cl.name, sz.name
        ) as sub
      `);
      const total = Number(totalCountRes[0]?.count || 0);

      // 3. Resolve sorting
      const sortDir = filters.sortDirection === 'desc' ? 'DESC' : 'ASC';
      let orderByField = 'po.order_date';
      if (filters.sortField === 'availableQty') orderByField = 'po.order_date'; // fallback since availableQty is computed in JS
      else if (filters.sortField === 'total_qty' || filters.sortField === 'totalQty') orderByField = 'SUM(pi.quantity)';
      else if (filters.sortField === 'design') orderByField = 'pi.design_no';
      else if (filters.sortField === 'color') orderByField = 'cl.name';
      else if (filters.sortField === 'size') orderByField = 'sz.name';
      else if (filters.sortField === 'mrp') orderByField = 'pi.mrp';
      else if (filters.sortField === 'cost') orderByField = 'pi.cost_per_item';
      else if (filters.sortField === 'invoice_date') orderByField = 'po.order_date';

      // 4. Fetch detailed data — FAST BATCH APPROACH
      // Step 4a: Fetch paginated purchase items (fast: uses indexes on po_id, joins are small tables)
      const detailedItemsRes = await AppDataSource.query(`
        SELECT 
          MIN(pi.id::text) as "id",
          pi.design_no as "design",
          SUM(pi.quantity) as "total_qty",
          pi.cost_per_item as "cost",
          pi.mrp as "mrp",
          MAX(pi.hsn_code) as "hsn",
          po.invoice_number as "po_no",
          po.order_date as "po_date",
          v.name as "vendorName",
          pg.name as "productGroup",
          cl.name as "color",
          sz.name as "size",
          pi.po_id as "po_id",
          pi.color as "color_id",
          pi.size as "size_id"
        FROM purchase_items pi
        INNER JOIN purchase_orders po ON po.id = pi.po_id
        LEFT JOIN vendors v ON v.id = po.vendor
        LEFT JOIN product_groups pg ON pg.id = pi.product_group
        LEFT JOIN colors cl ON cl.id = pi.color
        LEFT JOIN sizes sz ON sz.id = pi.size
        WHERE ${whereSql}
        GROUP BY 
          pi.po_id, pi.design_no, pi.color, pi.size, pi.cost_per_item, pi.mrp,
          po.invoice_number, po.order_date, v.name, pg.name, cl.name, sz.name
        ORDER BY ${orderByField} ${sortDir}, pi.design_no ASC
        LIMIT ${limit} OFFSET ${(page - 1) * limit}
      `);

      // Step 4b: Batch-fetch barcode batches for only those POs
      // KEY OPTIMIZATION: Only fetch photos when explicitly requested (photos avg 225KB each = ~2GB for full export)
      const poIds = Array.from(new Set(detailedItemsRes.map((pi: any) => pi.po_id))).filter(Boolean);
      const photoColumn = includePhotos ? 'bb.photos[1] as photo,' : 'NULL as photo,';
      let barcodeBatches: any[] = [];
      if (poIds.length > 0) {
        const poIdList = poIds.map((id: any) => `'${id}'`).join(',');
        barcodeBatches = await AppDataSource.query(`
          SELECT 
            bb.barcode_alias_8digit,
            bb.barcode_structured,
            ${photoColumn}
            bb.po_id,
            bb.design_no,
            bb.color,
            bb.size
          FROM barcode_batches bb
          WHERE bb.status != 'deleted'
            AND bb.po_id IN (${poIdList})
        `);
      }

      // Step 4c: Batch-fetch sales aggregates for those barcode aliases (fast: uses new index on barcode_8digit)
      // Step 4b.5: Append orphaned sales (items sold but never purchased)
      if (page === 1) {
        const orphanedSalesRes = await AppDataSource.query(`
            SELECT 
              MIN(sii.id::text) as "id",
              bb.design_no as "design",
              0 as "total_qty",
              bb.cost_actual as "cost",
              MAX(sii.mrp) as "mrp",
              '' as "hsn",
              'OPENING-STOCK' as "po_no",
              MIN(sii.created_at) as "po_date",
              v.name as "vendorName",
              pg.name as "productGroup",
              c.name as "color",
              s.name as "size",
              'OPENING-STOCK' as "po_id",
              bb.color as "color_id",
              bb.size as "size_id",
              bb.barcode_alias_8digit as "barcode_alias_8digit",
              bb.barcode_structured as "barcode_structured"
            FROM (
               SELECT barcode_8digit, created_at, id::text, mrp FROM sales_invoice_items
               UNION ALL
               SELECT barcode_8digit, created_at, id::text, 0 as mrp FROM sales_return_items
               UNION ALL
               SELECT barcode_id as barcode_8digit, created_at, id::text, 0 as mrp FROM purchase_return_items
            ) sii
            LEFT JOIN barcode_batches bb ON bb.barcode_alias_8digit = sii.barcode_8digit
            LEFT JOIN vendors v ON v.id = bb.vendor
            LEFT JOIN product_groups pg ON pg.id = bb.product_group
            LEFT JOIN colors c ON c.id = bb.color
            LEFT JOIN sizes s ON s.id = bb.size
            WHERE sii.barcode_8digit NOT IN (
               SELECT bb2.barcode_alias_8digit 
               FROM barcode_batches bb2 
               INNER JOIN purchase_items pi2 ON pi2.po_id = bb2.po_id AND pi2.design_no = bb2.design_no 
                  AND COALESCE(pi2.color::text, '') = COALESCE(bb2.color::text, '') 
                  AND pi2.size = bb2.size
               WHERE bb2.status != 'deleted' AND bb2.barcode_alias_8digit IS NOT NULL
            )
            ${(() => {
              const clauses = [];
              if (filters.vendorId) clauses.push(`bb.vendor::text = '${filters.vendorId}'`);
              if (filters.design) clauses.push(`bb.design_no ILIKE '%${filters.design}%'`);
              if (filters.barcode) clauses.push(`(bb.barcode_alias_8digit ILIKE '%${filters.barcode}%' OR bb.barcode_structured ILIKE '%${filters.barcode}%')`);
              if (filters.productGroup) clauses.push(`pg.name ILIKE '%${filters.productGroup}%'`);
              if (filters.size) clauses.push(`s.name ILIKE '%${filters.size}%'`);
              if (filters.color) clauses.push(`c.name ILIKE '%${filters.color}%'`);
              if (filters.poInvoiceNumber) clauses.push(`'OPENING-STOCK' ILIKE '%${filters.poInvoiceNumber}%'`);
              return clauses.length > 0 ? ' AND ' + clauses.join(' AND ') : '';
            })()}
            GROUP BY bb.barcode_alias_8digit, bb.barcode_structured, bb.design_no, bb.cost_actual, v.name, pg.name, c.name, s.name, bb.color, bb.size
        `);
        
        console.log(`Found ${orphanedSalesRes.length} orphaned sales!`);
        orphanedSalesRes.forEach((row: any) => {
            detailedItemsRes.push(row);
            barcodeBatches.push({
               barcode_alias_8digit: row.barcode_alias_8digit,
               barcode_structured: row.barcode_structured,
               photo: null,
               po_id: row.po_id,
               design_no: row.design,
               color: row.color_id,
               size: row.size_id
            });
        });
      }

      const aliases = Array.from(new Set(barcodeBatches.map((bb: any) => bb.barcode_alias_8digit))).filter(Boolean);
      let salesAgg: any[] = [];
      let salesReturnAgg: any[] = [];
      let purchaseReturnAgg: any[] = [];
      if (aliases.length > 0) {
        const aliasesQuery = aliases.map((a: any) => `'${String(a).replace(/'/g, "''")}'`).join(',');
        [salesAgg, salesReturnAgg, purchaseReturnAgg] = await Promise.all([
          AppDataSource.query(`SELECT sii.barcode_8digit, SUM(sii.quantity)::int as qty FROM sales_invoice_items sii INNER JOIN sales_invoices si ON si.id = sii.invoice_id WHERE sii.barcode_8digit IN (${aliasesQuery}) GROUP BY sii.barcode_8digit`),
          AppDataSource.query(`SELECT sri.barcode_8digit, SUM(sri.quantity)::int as qty FROM sales_return_items sri INNER JOIN sales_returns sr ON sr.id = sri.return_id WHERE sri.barcode_8digit IN (${aliasesQuery}) GROUP BY sri.barcode_8digit`),
          AppDataSource.query(`SELECT pri.barcode_id as barcode_8digit, SUM(pri.quantity)::int as qty FROM purchase_return_items pri INNER JOIN purchase_returns pr ON pr.id = pri.return_id WHERE pri.barcode_id IN (${aliasesQuery}) GROUP BY pri.barcode_id`),
        ]);
      }

      // Step 4d: Build in-memory lookup maps (O(n) — extremely fast)
      const salesMap = new Map<string, number>();
      salesAgg.forEach((s: any) => salesMap.set(s.barcode_8digit, Number(s.qty)));
      const salesReturnMap = new Map<string, number>();
      salesReturnAgg.forEach((s: any) => salesReturnMap.set(s.barcode_8digit, Number(s.qty)));
      const purchaseReturnMap = new Map<string, number>();
      purchaseReturnAgg.forEach((s: any) => purchaseReturnMap.set(s.barcode_8digit, Number(s.qty)));

      const barcodesByKey = new Map<string, any[]>();
      barcodeBatches.forEach((bb: any) => {
        const key = `${bb.po_id}_${bb.design_no}_${bb.color || ''}_${bb.size || ''}`;
        if (!barcodesByKey.has(key)) barcodesByKey.set(key, []);
        barcodesByKey.get(key)!.push(bb);
      });

      // Track remaining quantities to distribute
      const remainingSoldMap = new Map<string, number>();
      const remainingReturnedMap = new Map<string, number>();
      
      barcodesByKey.forEach((matchingBarcodes, key) => {
          let sold = 0, returned = 0;
          const uniqueAliases = new Set(matchingBarcodes.map((bb: any) => bb.barcode_alias_8digit));
          uniqueAliases.forEach(alias => {
            if (alias) {
              sold += (salesMap.get(alias as string) || 0) - (salesReturnMap.get(alias as string) || 0);
              returned += purchaseReturnMap.get(alias as string) || 0;
            }
          });
          remainingSoldMap.set(key, sold);
          remainingReturnedMap.set(key, returned);
      });

      // Step 4e: Enrich purchase items with barcode/sales data in memory
      const enrichedItemsRes = detailedItemsRes.map((pi: any) => {
        const key = `${pi.po_id}_${pi.design}_${pi.color_id || ''}_${pi.size_id || ''}`;
        const matchingBarcodes = barcodesByKey.get(key) || [];
        let barcode_alias = 'NO BARCODE';
        let barcode = 'NO BARCODE';
        let photo: any = null;
        if (matchingBarcodes.length > 0) {
          barcode_alias = matchingBarcodes[0].barcode_alias_8digit || 'NO BARCODE';
          barcode = matchingBarcodes[0].barcode_structured || 'NO BARCODE';
          photo = matchingBarcodes[0].photo || null;
        }

        const rowTotalQty = Number(pi.total_qty || 0);
        let rowSold = 0;
        let rowReturned = 0;

        let remSold = remainingSoldMap.get(key) || 0;
        let remRet = remainingReturnedMap.get(key) || 0;

        if (remSold !== 0) {
           rowSold = remSold;
           remainingSoldMap.set(key, 0);
        }
        if (remRet !== 0) {
           rowReturned = remRet;
           remainingReturnedMap.set(key, 0);
        }

        return { ...pi, barcode_alias, barcode, soldQty: rowSold, returnedQty: rowReturned, photo, gstRate: Number(pi.mrp) <= 1000 ? 5 : 12 };
      });

      const detailedList = enrichedItemsRes.map((r: any) => {
        const cost = Number(r.cost || 0);
        const mrp = Number(r.mrp || 0);
        const gstRate = Number(r.gstRate || 12);
        const purchaseGstAmount = (cost * gstRate) / 100;
        const landedCost = cost + purchaseGstAmount;
        const actualProfitPerUnit = mrp - landedCost;
        
        const totalQty = Number(r.total_qty || 0);
        const soldQty = Number(r.soldQty || 0);
        const returnedQty = Number(r.returnedQty || 0);
        const availableQty = Math.max(0, totalQty - returnedQty - soldQty);
        
        // r.barcode_alias = the 8-digit alias (set from barcode_alias_8digit during enrichment)
        // r.barcode = the structured code (set from barcode_structured during enrichment)
        const barcodeAlias8 = r.barcode_alias || 'NO BARCODE';   // 8-digit alias for photo lookups
        let displayBarcodeStructured = r.barcode || 'NO BARCODE'; // full structured code for display
        if (displayBarcodeStructured.length > 2000) {
          displayBarcodeStructured = displayBarcodeStructured.substring(0, 2000) + '... (truncated)';
        }

        // Photo: pass through as-is (base64 string from DB)
        // Previously this was stripped because it was "too long" - but base64 images ARE long!
        const photo = includePhotos ? (r.photo || '') : '';

        return {
          id: r.id,
          itemCode: barcodeAlias8,
          barcode: barcodeAlias8,        // 8-digit alias — used by UI for fetchPhoto(item.barcode)
          barcode_alias: displayBarcodeStructured, // full structured code
          design: r.design,
          color: r.color || '-',
          size: r.size || '-',
          hsn: r.hsn || '-',
          vendorName: r.vendorName || '-',
          productGroup: r.productGroup || '-',
          totalQty,
          availableQty,
          soldQty,
          returnedQty,
          salesInvoices: '', 
          cost,
          mrp,
          poInvoiceNumber: r.po_no,
          poDate: r.po_date,
          gstRate,
          purchaseGstAmount,
          landedCost,
          inventoryValue: availableQty * landedCost,
          potentialProfit: availableQty * actualProfitPerUnit,
          soldProfit: soldQty * actualProfitPerUnit,
          photos: photo ? [photo] : []
        };
      });

      // 5. Optimized Summary Calculation
      if (filters.skipSummary !== 'true' && filters.skipSummary !== true) {
        const summaryRes = await AppDataSource.query(`
          WITH sales_by_barcode AS (
            SELECT sii.barcode_8digit, SUM(sii.quantity) as sold_qty
            FROM sales_invoice_items sii
            GROUP BY sii.barcode_8digit
          ),
          returns_by_barcode AS (
            SELECT sri.barcode_8digit, SUM(sri.quantity) as returned_qty
            FROM sales_return_items sri
            GROUP BY sri.barcode_8digit
          ),
          purchase_returns_by_barcode AS (
            SELECT pri.barcode_id, SUM(pri.quantity) as returned_to_vendor_qty
            FROM purchase_return_items pri
            GROUP BY pri.barcode_id
          ),
          barcode_stats AS (
            SELECT 
              bb.po_id,
              bb.design_no,
              SUM(COALESCE(s.sold_qty, 0) - COALESCE(r.returned_qty, 0)) as sold_qty,
              SUM(COALESCE(pr.returned_to_vendor_qty, 0)) as returned_qty
            FROM barcode_batches bb
            LEFT JOIN sales_by_barcode s ON s.barcode_8digit = bb.barcode_alias_8digit
            LEFT JOIN returns_by_barcode r ON r.barcode_8digit = bb.barcode_alias_8digit
            LEFT JOIN purchase_returns_by_barcode pr ON pr.barcode_id = bb.barcode_alias_8digit
            WHERE bb.status != 'deleted' AND bb.po_id IS NOT NULL
            GROUP BY bb.po_id, bb.design_no
          ),
          grouped_purchases AS (
            SELECT 
              pi.po_id,
              pi.design_no,
              SUM(pi.quantity) as quantity,
              pi.cost_per_item
            FROM purchase_items pi
            INNER JOIN purchase_orders po ON po.id = pi.po_id
            LEFT JOIN vendors v ON v.id = po.vendor
            LEFT JOIN product_groups pg ON pg.id = pi.product_group
            LEFT JOIN colors cl ON cl.id = pi.color
            LEFT JOIN sizes sz ON sz.id = pi.size
            WHERE ${whereSql}
            GROUP BY pi.po_id, pi.design_no, pi.cost_per_item
          )
          SELECT 
            SUM(gp.quantity) as "totalItems",
            (SELECT SUM(bs.sold_qty) FROM barcode_stats bs WHERE EXISTS (SELECT 1 FROM grouped_purchases gp2 WHERE gp2.po_id = bs.po_id AND gp2.design_no = bs.design_no)) as "totalSold",
            (SELECT SUM(bs.returned_qty) FROM barcode_stats bs WHERE EXISTS (SELECT 1 FROM grouped_purchases gp2 WHERE gp2.po_id = bs.po_id AND gp2.design_no = bs.design_no)) as "totalReturned",
            SUM(gp.quantity * gp.cost_per_item) as "totalCostValue"
          FROM grouped_purchases gp
        `);

        const summary = summaryRes[0] || {};
        const totalItems = Number(summary.totalItems || 0);
        const totalSold = Number(summary.totalSold || 0);
        const totalReturned = Number(summary.totalReturned || 0);
        const totalAvailable = Math.max(0, totalItems - totalReturned - totalSold);

        summaryData = {
          totalItems,
          totalAvailable,
          totalSold,
          totalReturnedItemsCount: totalReturned,
          totalCostValue: Number(summary.totalCostValue || 0),
          estProfit: 0 
        };
      }
      
      return {
        data: detailedList,
        total,
        summary: summaryData
      };
    } catch (error: any) {
      logger.error(`[Error] inventoryReport failed: ${error.message}`, { stack: error.stack, filters });
      throw error;
    }
  }

  async getInventoryPhoto(barcode: string) {
    const batch = await AppDataSource.getRepository(BarcodeBatch)
      .createQueryBuilder('bb')
      .select(['bb.photos'])
      .where('bb.barcode_alias_8digit = :barcode', { barcode })
      .getOne();
    
    return batch?.photos?.[0] || null;
  }

  async salesmanReport(filters: any) {
    const startDate = filters.start_date || filters.startDate || new Date(new Date().setDate(new Date().getDate() - 30)).toISOString();
    const endDate = filters.end_date || filters.endDate || new Date().toISOString();
    return this.salesmanPerformance(startDate, endDate);
  }

  async customerReport(limit: number = 5000) {
    const qb = AppDataSource.getRepository(Customer)
      .createQueryBuilder('c')
      .select([
        'c.id as customer_id',
        'c.name as customer_name',
        'c.mobile as customer_mobile',
        'c.card_no as card_no',
        'COALESCE(c.credit_balance, 0) + COALESCE((SELECT SUM(cc.amount::numeric - COALESCE(used.used_amount, 0)) FROM credit_coupons cc LEFT JOIN (SELECT coupon_id, SUM(amount_applied)::numeric as used_amount FROM credit_coupon_applications GROUP BY coupon_id) used ON used.coupon_id = cc.id WHERE cc.customer_mobile = c.mobile), 0) as credit_balance',
        'COALESCE(c.loyalty_points_balance, 0) as loyalty_points',
        'COALESCE((SELECT SUM(net_payable) FROM sales_invoices WHERE customer_mobile = c.mobile), 0) as total_spent',
        'COALESCE((SELECT COUNT(*) FROM sales_invoices WHERE customer_mobile = c.mobile), 0) as total_invoices',
        '(SELECT MAX(invoice_date) FROM sales_invoices WHERE customer_mobile = c.mobile) as last_purchase',
        'COALESCE((SELECT SUM(soa.amount) FROM sales_order_advances soa JOIN sales_orders so ON so.id = soa.sales_order_id WHERE so.customer_id = c.id), 0) - COALESCE((SELECT SUM(soaa.amount_applied) FROM sales_order_advance_applications soaa JOIN sales_order_advances soa ON soa.id = soaa.advance_id JOIN sales_orders so ON so.id = soa.sales_order_id WHERE so.customer_id = c.id), 0) as advance_balance'
      ])
      .orderBy('total_spent', 'DESC')
      .limit(limit);

    const results = await qb.getRawMany();
    return results.map(r => ({
      ...r,
      total_invoices: parseInt(r.total_invoices),
      total_spent: parseFloat(r.total_spent),
      credit_balance: parseFloat(r.credit_balance),
      advance_balance: parseFloat(r.advance_balance),
      loyalty_points: parseFloat(r.loyalty_points)
    }));
  }

  async floorwiseSalesReport(filters: { startDate: string, endDate: string }) {
    const start = filters.startDate.split('T')[0];
    const end = filters.endDate.split('T')[0] + ' 23:59:59';

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

  async purchaseReport(filters: { startDate: string, endDate: string, vendorId?: string, page?: number, limit?: number, summaryOnly?: boolean }) {
    const start = filters.startDate.split('T')[0];
    const end = filters.endDate.split('T')[0] + ' 23:59:59';
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const summaryOnly = filters.summaryOnly || false;

    // --- PHASE 1: SQL SUMMARY ---
    const summaryRaw = await AppDataSource.getRepository(PurchaseOrder)
      .createQueryBuilder('po')
      .select([
        'COALESCE(SUM(po.total_amount), 0) as total_purchase',
        'COALESCE(SUM(po.total_items), 0) as total_items',
        'COALESCE(SUM(po.taxable_value), 0) as total_taxable',
        'COALESCE(SUM(po.total_amount - po.taxable_value - COALESCE(po.ledger_freight, 0)), 0) as total_gst',
        'COUNT(po.id) as po_count',
        'COALESCE(AVG(po.total_amount), 0) as avg_po_value',
      ])
      .where('po.order_date BETWEEN :start AND :end', { start, end })
      .andWhere(filters.vendorId ? 'po.vendor = CAST(:vendorId AS uuid)' : '1=1', { vendorId: filters.vendorId })
      .getRawOne();

    const summary = {
      totalPurchase: parseFloat(summaryRaw.total_purchase),
      totalItems: parseFloat(summaryRaw.total_items),
      totalGST: parseFloat(summaryRaw.total_gst),
      totalTaxable: parseFloat(summaryRaw.total_taxable),
      poCount: parseInt(summaryRaw.po_count),
      avgPOValue: parseFloat(summaryRaw.avg_po_value)
    };

    if (summaryOnly) return { success: true, data: { summary, detailedList: [] } };

    // --- PHASE 2: PAGINATED DETAILS ---
    const details = await AppDataSource.getRepository(PurchaseOrder)
      .createQueryBuilder('po')
      .leftJoinAndSelect('po.vendor', 'vendor')
      .where('po.order_date BETWEEN :start AND :end', { start, end })
      .andWhere(filters.vendorId ? 'po.vendor = CAST(:vendorId AS uuid)' : '1=1', { vendorId: filters.vendorId })
      .orderBy('po.order_date', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return {
      success: true,
      data: {
        summary,
        detailedList: details,
        page,
        limit,
        hasMore: details.length === limit
      }
    };
  }
   async purchaseAnalysisReport(filters: { startDate: string, endDate: string, vendorId?: string, floorId?: string, exportMode?: boolean | string }) {
    const startDateStr = filters.startDate?.split('T')[0] || '2000-01-01';
    const endDateStr = (filters.endDate?.split('T')[0] || '2099-12-31') + ' 23:59:59';
    const exportMode = filters.exportMode === true || filters.exportMode === 'true';

    // 1. Calculate Summary using Unified Logic (Invoices + Opening Stock)
    const summaryData = await AppDataSource.query(`
      WITH combined_data AS (
        SELECT 
          po.id as po_id,
          pi.quantity,
          (pi.cost_per_item * pi.quantity) as cost_val,
          (pi.mrp * pi.quantity) as mrp_val
        FROM purchase_items pi
        INNER JOIN purchase_orders po ON po.id = pi.po_id
        WHERE po.status = 'Completed'
        AND po.order_date BETWEEN '${startDateStr}' AND '${endDateStr}'
        ${filters.vendorId ? "AND po.vendor::text = '" + filters.vendorId + "'" : ""}
        
        UNION ALL
        
        SELECT 
          NULL as po_id,
          bb.total_quantity as quantity,
          (bb.cost_actual * bb.total_quantity) as cost_val,
          (bb.mrp * bb.total_quantity) as mrp_val
        FROM barcode_batches bb
        WHERE bb.po_id IS NULL AND bb.status != 'deleted'
        AND bb.created_at BETWEEN '${startDateStr}' AND '${endDateStr}'
        ${filters.vendorId ? "AND bb.vendor::text = '" + filters.vendorId + "'" : ""}
      )
      SELECT 
        COUNT(DISTINCT po_id) as "poCount",
        SUM(quantity) as "totalQuantity",
        SUM(cost_val) as "totalCost",
        SUM(mrp_val) as "totalMRP"
      FROM combined_data
    `);
    const s = summaryData[0];

    // 2. Fetch Detailed Records (Unified UNION)
    const items = await AppDataSource.query(`
      WITH barcode_agg AS (
        SELECT 
          bb.po_id,
          bb.design_no,
          bb.color,
          bb.size,
          string_agg(bb.barcode_alias_8digit, ', ') as barcodes
        FROM barcode_batches bb
        WHERE bb.status != 'deleted' AND bb.po_id IS NOT NULL
        GROUP BY bb.po_id, bb.design_no, bb.color, bb.size
      ),
      combined_details AS (
        SELECT 
          pi.id::text as id,
          pi.design_no,
          po.order_date as date,
          pi.quantity,
          v.name as vendor_name,
          pi.cost_per_item as cost,
          pi.mrp,
          po.po_number,
          po.invoice_number as po_invoice_number,
          po.order_date as po_date,
          '' as photo,
          'PURCHASE' as source,
          cl.name as color,
          sz.name as size,
          pi.hsn_code as hsn,
          COALESCE(ba.barcodes, 'NO BARCODE') as barcode
        FROM purchase_items pi
        INNER JOIN purchase_orders po ON po.id = pi.po_id
        LEFT JOIN vendors v ON v.id = po.vendor
        LEFT JOIN colors cl ON cl.id = pi.color
        LEFT JOIN sizes sz ON sz.id = pi.size
        LEFT JOIN barcode_agg ba ON ba.po_id = pi.po_id AND ba.design_no = pi.design_no
          AND COALESCE(ba.color::text, '') = COALESCE(pi.color::text, '')
          AND COALESCE(ba.size::text, '') = COALESCE(pi.size::text, '')
        WHERE po.status = 'Completed'
        AND po.order_date BETWEEN '${startDateStr}' AND '${endDateStr}'
        ${filters.vendorId ? "AND po.vendor::text = '" + filters.vendorId + "'" : ""}
        
        UNION ALL
        
        SELECT 
          bb.id::text as id,
          bb.design_no,
          bb.created_at as date,
          bb.total_quantity as quantity,
          v.name as vendor_name,
          bb.cost_actual as cost,
          bb.mrp,
          'Opening' as po_number,
          'Opening Stock' as po_invoice_number,
          bb.created_at as po_date,
          '' as photo,
          'OPENING' as source,
          cl.name as color,
          sz.name as size,
          bb.hsn_code as hsn,
          bb.barcode_alias_8digit as barcode
        FROM barcode_batches bb
        LEFT JOIN vendors v ON v.id::text = bb.vendor::text
        LEFT JOIN colors cl ON cl.id = bb.color
        LEFT JOIN sizes sz ON sz.id = bb.size
        WHERE bb.po_id IS NULL AND bb.status != 'deleted'
        AND bb.created_at BETWEEN '${startDateStr}' AND '${endDateStr}'
        ${filters.vendorId ? "AND bb.vendor::text = '" + filters.vendorId + "'" : ""}
      )
      SELECT * FROM combined_details ORDER BY date DESC, design_no ASC
    `);

    const details = items.map((item: any) => {
      const quantity = parseFloat(item.quantity) || 0;
      const cost = parseFloat(item.cost) || 0;
      const mrp = parseFloat(item.mrp) || 0;
      return {
        ...item,
        quantity,
        cost,
        mrp,
        color: item.color || '-',
        size: item.size || '-',
        hsn: item.hsn || '-',
        barcode: item.barcode || 'NO BARCODE',
        totalCost: Math.round(cost * quantity * 100) / 100,
        totalMRP: Math.round(mrp * quantity * 100) / 100,
        margin: mrp > 0 ? ((mrp - cost) / mrp) * 100 : 0,
        photos: item.photo ? [item.photo] : []
      };
    });

    return {
      summary: {
        totalCost: Math.round(Number(s.totalCost || 0) * 100) / 100,
        totalMRP: Math.round(Number(s.totalMRP || 0) * 100) / 100,
        totalDiscount: Math.round((Number(s.totalMRP || 0) - Number(s.totalCost || 0)) * 100) / 100,
        avgMargin: s.totalMRP > 0 ? ((Number(s.totalMRP) - Number(s.totalCost)) / Number(s.totalMRP)) * 100 : 0,
        totalItems: Number(s.totalQuantity || 0),
        poCount: parseInt(s.poCount || 0),
        itemsSold: Number(s.totalQuantity || 0)
      },
      details
    };
  }

  // GST Report
  async gstReport(startDate: string, endDate: string) {
    const startStr = (startDate || '').split('T')[0] || '2000-01-01';
    const endStr = ((endDate || '').split('T')[0] || '2099-12-31') + ' 23:59:59';

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
        start: startStr, 
        end: endStr 
      });

    const result = await qb.getRawOne();
    return { startDate, endDate, ...result };
  }

  // Salesman Performance
  async salesmanPerformance(startDate: string, endDate: string) {
    const startStr = startDate.split('T')[0];
    const endStr = endDate.split('T')[0] + ' 23:59:59';

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
 
  async profitabilityReport(filters: { startDate: string, endDate: string, vendorId?: string, floorId?: string, exportMode?: boolean | string }) {
    const start = (filters.startDate || '').split('T')[0] || '2000-01-01';
    const end = ((filters.endDate || '').split('T')[0] || '2099-12-31') + ' 23:59:59';
    const exportMode = filters.exportMode === true || filters.exportMode === 'true';

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
      ]);

    if (exportMode) {
      qb.addSelect('bb.photos', 'photos');
      qb.groupBy('si.id, sii.id, bb.id, v.id, bb.photos');
    } else {
      qb.groupBy('si.id, sii.id, bb.id, v.id');
    }

    qb.where('si.invoice_date BETWEEN :start AND :end', { start, end })
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
    const end = filters.endDate.split('T')[0] + ' 23:59:59';

    // 2. Fetch independent data (Purchases & Stock) - Invoice-First Ground Truth
    // Unified Purchases query: UNION of Purchase Invoices + Opening Stock
    const purchasesData = await AppDataSource.query(`
      WITH combined_purchases AS (
        -- Part 1: Items from Completed Invoices
        SELECT 
          COALESCE(v.name, 'Direct/Unknown') as vendor_name,
          SUM(pi.quantity) as qty,
          SUM(pi.cost_per_item * pi.quantity) as cost,
          SUM(pi.mrp * pi.quantity) as mrp
        FROM purchase_items pi
        INNER JOIN purchase_orders po ON po.id = pi.po_id
        LEFT JOIN vendors v ON v.id = po.vendor
        WHERE po.status = 'Completed'
        AND po.order_date BETWEEN '${start}' AND '${end}'
        ${filters.vendorId ? "AND po.vendor::text = '" + filters.vendorId + "'" : ""}
        GROUP BY COALESCE(v.name, 'Direct/Unknown')

        UNION ALL

        -- Part 2: Opening Stock (No PO)
        SELECT 
          COALESCE(v.name, 'Direct/Unknown') as vendor_name,
          SUM(bb.total_quantity) as qty,
          SUM(bb.cost_actual * bb.total_quantity) as cost,
          SUM(bb.mrp * bb.total_quantity) as mrp
        FROM barcode_batches bb
        LEFT JOIN vendors v ON v.id::text = bb.vendor::text
        WHERE bb.po_id IS NULL AND bb.status != 'deleted'
        AND bb.created_at BETWEEN '${start}' AND '${end}'
        ${filters.vendorId ? "AND bb.vendor::text = '" + filters.vendorId + "'" : ""}
        GROUP BY COALESCE(v.name, 'Direct/Unknown')
      )
      SELECT 
        vendor_name,
        SUM(qty) as purchase_quantity,
        SUM(cost) as purchase_cost,
        SUM(mrp) as purchase_mrp
      FROM combined_purchases
      GROUP BY vendor_name
    `);
    const purchaseMap = new Map<string, any>(purchasesData.map((p: any) => [p.vendor_name, p]));

    // Current Stock (Live snapshot)
    const stockData = await AppDataSource.query(`
      SELECT 
        COALESCE(v.name, 'Direct/Unknown') as vendor_name,
        SUM(COALESCE(bb.available_quantity, 0)) as current_stock_qty
      FROM barcode_batches bb
      LEFT JOIN vendors v ON v.id::text = bb.vendor::text
      WHERE bb.status != 'deleted'
      ${filters.vendorId && filters.vendorId !== '' && filters.vendorId !== 'null' ? "AND v.id::text = '" + filters.vendorId + "'" : ""}
      GROUP BY COALESCE(v.name, 'Direct/Unknown')
    `);
    const stockMap = new Map<string, any>(stockData.map((s: any) => [s.vendor_name, s]));

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

    const finalResults = Array.from(allVendorNames).map((vName: any) => {
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
    const end = filters.endDate.split('T')[0] + ' 23:59:59';

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
  async salesReturnReport(filters: { startDate: string, endDate: string, vendorId?: string, page?: number, limit?: number }) {
    const start = (filters.startDate || '').split('T')[0] || '2000-01-01';
    const end = ((filters.endDate || '').split('T')[0] || '2099-12-31') + ' 23:59:59';
    const page = filters.page || 1;
    const limit = filters.limit || 50;

    // --- PHASE 1: SQL SUMMARY (Strictly Correct Aggregation) ---
    // We use a subquery to avoid double-counting header totals when joining items
    const summaryRaw = await AppDataSource.query(`
      SELECT 
        COALESCE(SUM(total_return_amount), 0) as total_return_amount,
        COALESCE(SUM(total_discount_amount), 0) as total_discount_amount,
        COALESCE(SUM(total_loyalty_amount), 0) as total_loyalty_amount,
        COUNT(id) as return_count,
        COALESCE(SUM(item_qty), 0) as total_quantity
      FROM (
        SELECT 
          sr.id,
          sr.total_return_amount,
          sr.total_discount_amount,
          sr.total_loyalty_amount,
          SUM(sri.quantity) as item_qty
        FROM sales_returns sr
        LEFT JOIN sales_return_items sri ON sri.return_id = sr.id
        LEFT JOIN barcode_batches bb ON bb.barcode_alias_8digit = sri.barcode_8digit
        WHERE sr.return_date BETWEEN $1 AND $2
        ${filters.vendorId ? "AND bb.vendor = $3" : ""}
        GROUP BY sr.id
      ) t
    `, filters.vendorId ? [start, end, filters.vendorId] : [start, end]);

    const sRaw = summaryRaw[0] || {};
    const summary = {
      totalReturnAmount: parseFloat(sRaw.total_return_amount || 0),
      totalDiscountAmount: parseFloat(sRaw.total_discount_amount || 0),
      totalLoyaltyAmount: parseFloat(sRaw.total_loyalty_amount || 0),
      returnCount: parseInt(sRaw.return_count || 0),
      totalQuantity: parseInt(sRaw.total_quantity || 0)
    };

    // --- PHASE 2: PAGINATED DETAILS ---
    const details = await AppDataSource.getRepository(SalesReturn)
      .createQueryBuilder('sr')
      .leftJoin('sr.salesman', 's')
      .leftJoin(SalesReturnItem, 'sri', 'sri.return_id = sr.id')
      .leftJoin('sri.product_item', 'bb')
      .leftJoin(CreditCoupon, 'cc', 'cc.original_sales_return_id = sr.id')
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
        'cc.amount as credit_coupon_amount',
        'sr.credit_note_number as credit_note_number',
        'COALESCE(SUM(sri.quantity), 0) as total_quantity',
        'sr.total_discount_amount as total_discount_amount',
        'sr.total_loyalty_amount as total_loyalty_amount'
      ])
      .where('sr.return_date BETWEEN :start AND :end', { start, end })
      .andWhere(filters.vendorId ? 'bb.vendor = :vendorId' : '1=1', { vendorId: filters.vendorId })
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
      .addGroupBy('cc.amount')
      .addGroupBy('sr.total_discount_amount')
      .addGroupBy('sr.total_loyalty_amount')
      .orderBy('sr.return_date', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getRawMany();

    return { 
      summary, 
      details,
      page,
      limit,
      hasMore: details.length === limit
    };
  }

  async cashReport(filters: { startDate: string, endDate: string }) {
    const start = new Date(`${filters.startDate.split('T')[0]}T00:00:00.000Z`);
    const end = new Date(`${filters.endDate.split('T')[0]}T23:59:59.999Z`);

    const result = {
      summary: {
        totalCash: 0,
        salesCash: 0,
        receiptCash: 0,
        advanceCash: 0,
        refundCash: 0
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

    // 4. Cash Refunds (Payouts for Coupons and Advances)
    const refunds = await AppDataSource.query(`
      SELECT 'Credit Coupon' as source, ccr.id, ccr.amount, ccr.created_at as date, cc.coupon_no as reference, cc.customer_mobile as mobile, c.name as customer
      FROM credit_coupon_refunds ccr
      INNER JOIN credit_coupons cc ON cc.id = ccr.coupon_id
      LEFT JOIN customers c ON c.mobile = cc.customer_mobile
      WHERE ccr.payment_mode = 'Cash' AND ccr.created_at BETWEEN $1 AND $2

      UNION ALL

      SELECT 'Advance' as source, soar.id, soar.amount, soar.created_at as date, COALESCE(soa.receipt_number, so.order_number) as reference, c.mobile as mobile, c.name as customer
      FROM sales_order_advance_refunds soar
      INNER JOIN sales_order_advances soa ON soa.id = soar.advance_id
      INNER JOIN sales_orders so ON so.id = soa.sales_order_id
      LEFT JOIN customers c ON c.id = so.customer_id
      WHERE soar.payment_mode = 'Cash' AND soar.created_at BETWEEN $1 AND $2
    `, [start, end]);

    refunds.forEach((ref: any) => {
      const amount = parseFloat(ref.amount) || 0;
      result.summary.refundCash += amount;
      result.details.push({
        id: ref.id,
        date: ref.date,
        source: `${ref.source} Refund`,
        reference: ref.reference || 'N/A',
        customer: ref.customer || 'Customer',
        mobile: ref.mobile || '',
        amount: -amount // Negative for cash out
      });
    });

    result.summary.totalCash = result.summary.salesCash + result.summary.receiptCash + result.summary.advanceCash - result.summary.refundCash;
    
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
      
      // For BarcodeBatch (Purchases), we use the same unified date logic as other reports
      const unifiedDate = repo === BarcodeBatch 
        ? `COALESCE((SELECT po.order_date FROM purchase_orders po WHERE po.id = ${bbAlias}.po_id), ${bbAlias}.created_at)`
        : dateField;

      if (vendorId) {
        qb.leftJoin(`${bbAlias}.size`, 'sz')
          .leftJoin(`${bbAlias}.color`, 'cl')
          .andWhere('v.id = :vendorId', { vendorId });
      }

      if (isRange) {
        qb.andWhere(`${unifiedDate} >= :start AND ${unifiedDate} <= :end`, { start, end });
      } else {
        qb.andWhere(`${unifiedDate} < :start`, { start });
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
    const end = filters.endDate.split('T')[0] + ' 23:59:59';

    const advances = await AppDataSource.getRepository(SalesOrderAdvance)
      .createQueryBuilder('soa')
      .leftJoinAndSelect('soa.salesOrder', 'so')
      .leftJoinAndSelect('so.customer', 'c')
      .where('soa.created_at::date BETWEEN :start AND :end', { start, end })
      .orderBy('soa.created_at', 'DESC')
      .getMany();

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
         end: filters.endDate.split('T')[0] + ' 23:59:59'
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
        barcode_structured: b.barcode_structured,
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
      params.push(filters.endDate.split('T')[0] + ' 23:59:59');
      where.push(`t.transaction_date::date <= $${p}::date`);
      p++;
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    const baseSql = `
      WITH raw_data AS (
        -- Credit Coupons: Issuance (Credit)
        SELECT
          cc.id::text AS instrument_id,
          'Credit'::text AS entry_type,
          'Credit Coupon'::text AS type,
          cc.customer_mobile::text AS mobile,
          COALESCE(c.name, '-')::text AS name,
          cc.created_at::timestamptz AS transaction_date,
          cc.coupon_no::text AS external_no,
          cc.amount::numeric AS transaction_amount,
          cc.amount::numeric AS original_amount,
          '-'::text AS invoice_no,
          COALESCE(
            'Return: ' || sr.return_number || ' | Invoice: ' || sr.invoice_number,
            'Manual Generation'
          )::text AS reference
        FROM credit_coupons cc
        LEFT JOIN customers c ON c.mobile = cc.customer_mobile
        LEFT JOIN sales_returns sr ON sr.id = cc.original_sales_return_id

        UNION ALL

        SELECT
          cc.id::text AS instrument_id,
          'Debit'::text AS entry_type,
          'Credit Coupon'::text AS type,
          cc.customer_mobile::text AS mobile,
          COALESCE(c.name, '-')::text AS name,
          cca.created_at::timestamptz AS transaction_date,
          cc.coupon_no::text AS external_no,
          (-1 * cca.amount_applied)::numeric AS transaction_amount,
          cc.amount::numeric AS original_amount,
          si.invoice_number::text AS invoice_no,
          'Applied to Invoice'::text AS reference
        FROM credit_coupon_applications cca
        INNER JOIN credit_coupons cc ON cc.id = cca.coupon_id
        INNER JOIN sales_invoices si ON si.id = cca.invoice_id
        LEFT JOIN customers c ON c.mobile = cc.customer_mobile

        UNION ALL

        -- Advance: Issuance (Credit)
        SELECT
          soa.id::text AS instrument_id,
          'Credit'::text AS entry_type,
          'Advance'::text AS type,
          COALESCE(c.mobile, '-')::text AS mobile,
          COALESCE(c.name, '-')::text AS name,
          soa.created_at::timestamptz AS transaction_date,
          COALESCE(soa.receipt_number, so.order_number)::text AS external_no,
          soa.amount::numeric AS transaction_amount,
          soa.amount::numeric AS original_amount,
          '-'::text AS invoice_no,
          COALESCE('Sales Order: ' || so.order_number, 'Manual Advance')::text AS reference
        FROM sales_order_advances soa
        INNER JOIN sales_orders so ON so.id = soa.sales_order_id
        LEFT JOIN customers c ON c.id = so.customer_id

        UNION ALL

        SELECT
          soa.id::text AS instrument_id,
          'Debit'::text AS entry_type,
          'Advance'::text AS type,
          COALESCE(c.mobile, '-')::text AS mobile,
          COALESCE(c.name, '-')::text AS name,
          soaa.created_at::timestamptz AS transaction_date,
          COALESCE(soa.receipt_number, so.order_number)::text AS external_no,
          (-1 * soaa.amount_applied)::numeric AS transaction_amount,
          soa.amount::numeric AS original_amount,
          si.invoice_number::text AS invoice_no,
          'Applied to Invoice'::text AS reference
        FROM sales_order_advance_applications soaa
        INNER JOIN sales_order_advances soa ON soa.id = soaa.advance_id
        INNER JOIN sales_invoices si ON si.id = soaa.invoice_id
        INNER JOIN sales_orders so ON so.id = soa.sales_order_id
        LEFT JOIN customers c ON c.id = so.customer_id

        UNION ALL

        SELECT
          cc.id::text AS instrument_id,
          'Debit'::text AS entry_type,
          'Credit Coupon'::text AS type,
          cc.customer_mobile::text AS mobile,
          COALESCE(c.name, '-')::text AS name,
          ccr.created_at::timestamptz AS transaction_date,
          cc.coupon_no::text AS external_no,
          (-1 * ccr.amount)::numeric AS transaction_amount,
          cc.amount::numeric AS original_amount,
          '-'::text AS invoice_no,
          ('Refund: ' || ccr.payment_mode)::text AS reference
        FROM credit_coupon_refunds ccr
        INNER JOIN credit_coupons cc ON cc.id = ccr.coupon_id
        LEFT JOIN customers c ON c.mobile = cc.customer_mobile

        UNION ALL

        SELECT
          soa.id::text AS instrument_id,
          'Debit'::text AS entry_type,
          'Advance'::text AS type,
          COALESCE(c.mobile, '-')::text AS mobile,
          COALESCE(c.name, '-')::text AS name,
          soar.created_at::timestamptz AS transaction_date,
          COALESCE(soa.receipt_number, so.order_number)::text AS external_no,
          (-1 * soar.amount)::numeric AS transaction_amount,
          soa.amount::numeric AS original_amount,
          '-'::text AS invoice_no,
          ('Refund: ' || soar.payment_mode)::text AS reference
        FROM sales_order_advance_refunds soar
        INNER JOIN sales_order_advances soa ON soa.id = soar.advance_id
        INNER JOIN sales_orders so ON so.id = soa.sales_order_id
        LEFT JOIN customers c ON c.id = so.customer_id
      ),
      t AS (
        SELECT 
          rd.*,
          SUM(rd.transaction_amount) OVER (
            PARTITION BY rd.mobile 
            ORDER BY rd.transaction_date ASC, rd.entry_type DESC
          )::numeric AS remaining_amount
        FROM raw_data rd
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

        UNION ALL

        -- Credit Coupon Refund
        SELECT 
           'Credit Coupon'::text AS type, cc.customer_mobile::text AS mobile, COALESCE(cust.name, '-')::text AS name, cc.coupon_no::text AS external_no, ccr.created_at::timestamptz AS transaction_date, '-'::text AS invoice_no, 'Refund'::text AS reference
        FROM credit_coupon_refunds ccr 
        INNER JOIN credit_coupons cc ON cc.id = ccr.coupon_id
        LEFT JOIN customers cust ON cust.mobile = cc.customer_mobile

        UNION ALL

        -- Advance Refund
        SELECT 
           'Advance'::text AS type, c.mobile::text AS mobile, COALESCE(c.name, '-')::text AS name, soa.receipt_number::text AS external_no, soar.created_at::timestamptz AS transaction_date, '-'::text AS invoice_no, 'Refund'::text AS reference 
        FROM sales_order_advance_refunds soar 
        INNER JOIN sales_order_advances soa ON soa.id = soar.advance_id 
        INNER JOIN sales_orders so ON so.id = soa.sales_order_id 
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
    // 1. Fetch all invoices that are not marked as fully paid in DB, 
    // OR have a balance > 1 based on DB fields.
    // We load all relations to enable Ground-Truth reconstruction.
    const invoices = await AppDataSource.getRepository(SalesInvoice).find({
      where: [
        { payment_status: Not('paid') },
        { amount_pending: MoreThan(1) }
      ],
      relations: [
        'items', 
        'items.product_item',
        'customer',
        'receipt_items', 
        'receipt_items.receipt', 
        'sales_returns', 
        'coupon_applications', 
        'advance_applications', 
        'credit_note_applications'
      ],
      order: { invoice_date: 'DESC' }
    });

    const normalizedInvoices: any[] = [];
    const receiptsMap: Record<string, any[]> = {};

    for (const inv of invoices) {
      // --- RECONSTRUCTION LOGIC (Mirrors salesReport) ---
      const invoiceItems = inv.items || [];
      const reconstructedMRP = invoiceItems.reduce((s, i) => s + (Number(i.mrp || i.selling_price || 0) * Number(i.quantity || 1)), 0);
      const reconstructedItemDisc = invoiceItems.reduce((s, i) => s + (Number(i.discount || 0) * Number(i.quantity || 1)), 0);
      
      const totalHeaderBundle = (parseFloat(inv.total_discount as any) || 0) + 
                               (parseFloat(inv.special_discount as any) || 0) + 
                               (parseFloat(inv.voucher_discount as any) || 0) + 
                               (parseFloat(inv.loyalty_redemption_amount as any) || 0);

      const totalDisc = (reconstructedItemDisc > 0.01) ? reconstructedItemDisc : totalHeaderBundle;
      const returnsAmt = (inv.sales_returns || []).reduce((s: number, r: any) => s + (Number(r.total_return_amount) || 0), 0);
      const calculatedNet = reconstructedMRP - totalDisc + (parseFloat(inv.additional_charges_total as any) || 0) - returnsAmt;
      const finalNet = Math.round(calculatedNet);

      // Payment Reconstruction
      let paymentDetails = inv.payment_details;
      if (typeof paymentDetails === 'string') {
        try { paymentDetails = JSON.parse(paymentDetails); } catch (e) { paymentDetails = null; }
      }

      let initialDetails: any[] = [];
      if (paymentDetails) {
        if (Array.isArray(paymentDetails)) {
          initialDetails = paymentDetails.filter((pd: any) => {
            const k = (pd.mode || '').toString().toUpperCase();
            return !(k.includes('COUPON') || k.includes('ADVANCE') || k.includes('CREDIT NOTE') || k.includes('RETURN'));
          });
        } else if (typeof paymentDetails === 'object' && paymentDetails !== null) {
          const techKeys = ['TOTAL_MRP', 'NET_PAYABLE', 'ITEMS', 'ID', 'TOTAL_AMOUNT', 'ROUND_OFF', 'AMOUNT_PAID', 'AMOUNT_PENDING', 'SPECIAL_DISCOUNT', 'VOUCHER_DISCOUNT', 'LOYALTY_REDEMPTION_AMOUNT', 'TOTAL_GST', 'TAXABLE_VALUE'];
          initialDetails = Object.entries(paymentDetails)
            .filter(([key, val]) => {
              const k = key.toUpperCase();
              return !techKeys.includes(k) && !(k.includes('COUPON') || k.includes('ADVANCE') || k.includes('CREDIT NOTE') || k.includes('RETURN')) && (typeof val === 'number' || typeof val === 'string');
            })
            .map(([key, val]) => ({ mode: key, amount: val }));
        }
      }

      const receiptPayments = (inv.receipt_items || []).map((ri: any) => ({
        id: ri.id,
        receipt_date: ri.receipt?.receipt_date,
        amount_received: parseFloat(ri.amount_paid as any) || 0,
        payment_mode: ri.receipt?.payment_mode || 'Receipt',
        receipt_number: ri.receipt?.receipt_number,
        is_receipt: true
      })).filter(p => {
        const k = (p.payment_mode || '').toString().toUpperCase();
        return p.amount_received > 0 && !(k.includes('COUPON') || k.includes('ADVANCE') || k.includes('CREDIT NOTE') || k.includes('RETURN') || k.includes('APPROVAL'));
      });

      const couponReceipts = (inv.coupon_applications || []).map((ca: any) => ({
        id: ca.id,
        receipt_date: ca.created_at,
        amount_received: parseFloat(ca.amount_applied as any) || 0,
        payment_mode: 'Credit Coupon',
        receipt_number: ca.coupon?.coupon_no || 'Coupon',
        is_wallet: true
      }));

      const advanceReceipts = (inv.advance_applications || []).map((aa: any) => ({
        id: aa.id,
        receipt_date: aa.created_at,
        amount_received: parseFloat(aa.amount_applied as any) || 0,
        payment_mode: 'Advance',
        receipt_number: aa.advance?.receipt_number || 'Advance',
        is_wallet: true
      }));

      const creditNoteReceipts = (inv.credit_note_applications || []).map((cna: any) => ({
        id: cna.id,
        receipt_date: cna.created_at,
        amount_received: parseFloat(cna.amount_applied as any) || 0,
        payment_mode: 'Credit Note',
        receipt_number: cna.creditNote?.credit_note_number || 'Note',
        is_wallet: true
      }));

      const returnReceipts = (inv.sales_returns || []).map((ret: any) => ({
        id: ret.id,
        receipt_date: ret.return_date,
        amount_received: parseFloat(ret.total_return_amount as any) || 0,
        payment_mode: 'Sales Return',
        receipt_number: ret.return_number,
        is_return: true
      }));

      const totalExternalPaid = receiptPayments.reduce((s, r) => s + r.amount_received, 0) + 
                               couponReceipts.reduce((s, r) => s + r.amount_received, 0) + 
                               advanceReceipts.reduce((s, r) => s + r.amount_received, 0) + 
                               creditNoteReceipts.reduce((s, r) => s + r.amount_received, 0);

      const initialPaymentsNormalized = initialDetails.map((pd: any) => {
        const mode = (pd.mode || '').toString().toUpperCase();
        let amount = parseFloat(pd.amount) || 0;
        
        // If it's an approval mode, we DON'T count it as "money received" (Paid).
        // It's just a flag that the balance is an approval balance.
        if (mode.includes('APPROVAL')) {
          return {
            id: `initial-${inv.id}-${pd.mode}`,
            receipt_date: inv.invoice_date,
            amount_received: 0, // EXPLICITLY 0 for paid total
            payment_mode: pd.mode,
            receipt_number: 'Sale Payment',
            is_initial: true,
            is_approval: true
          };
        }

        return {
          id: `initial-${inv.id}-${pd.mode}`,
          receipt_date: inv.invoice_date,
          amount_received: amount,
          payment_mode: pd.mode,
          receipt_number: 'Sale Payment',
          is_initial: true
        };
      }).filter(p => p.amount_received > 0 || (p as any).is_approval);

      const finalRealPaid = 
        initialPaymentsNormalized.reduce((s, p) => s + p.amount_received, 0) + 
        totalExternalPaid;

      const adjustedPending = Math.max(0, finalNet - finalRealPaid);

      // Only include in report if there is a real pending balance (> 1 rupee)
      if (adjustedPending > 1) {
        normalizedInvoices.push({
          ...inv,
          net_payable: finalNet,
          amount_paid: finalRealPaid,
          amount_pending: adjustedPending,
          payment_status: finalRealPaid > 0 ? 'partial' : 'pending'
        });

        receiptsMap[inv.id] = [
          ...initialPaymentsNormalized,
          ...receiptPayments,
          ...couponReceipts,
          ...advanceReceipts,
          ...creditNoteReceipts,
          ...returnReceipts
        ];

        // AUTO-CORRECTION: If DB is out of sync by more than 5 rupees, update it silently.
        const dbPending = parseFloat(inv.amount_pending as any) || 0;
        const dbNet = parseFloat(inv.net_payable as any) || 0;
        if (Math.abs(dbPending - adjustedPending) > 5 || Math.abs(dbNet - finalNet) > 5) {
          AppDataSource.getRepository(SalesInvoice).update(inv.id, {
            amount_pending: adjustedPending,
            amount_paid: finalRealPaid,
            net_payable: finalNet,
            payment_status: adjustedPending <= 1 ? 'paid' : (finalRealPaid > 0 ? 'partial' : 'pending')
          }).catch(e => console.error(`Failed to auto-correct invoice ${inv.invoice_number}:`, e));
        }
      } else if (inv.payment_status !== 'paid' || (inv.amount_pending as any) > 1) {
        // If it's reconstructed as PAID but DB says it's not, fix DB.
        AppDataSource.getRepository(SalesInvoice).update(inv.id, {
          amount_pending: 0,
          payment_status: 'paid',
          amount_paid: finalNet // Set paid = net to reflect closure
        }).catch(e => console.error(`Failed to auto-close invoice ${inv.invoice_number}:`, e));
      }
    }

    return { invoices: normalizedInvoices, receipts: receiptsMap };
  }

  // Customer Credit & Advance Report
  async customerCreditReport(filters: { startDate?: string, endDate?: string, customerId?: string }) {
    const startDateStr = filters.startDate ? filters.startDate + ' 00:00:00' : '2000-01-01 00:00:00';
    const endDateStr = filters.endDate ? filters.endDate + ' 23:59:59' : '2099-12-31 23:59:59';

    const results = await AppDataSource.query(`
      WITH all_mobiles AS (
        SELECT DISTINCT customer_mobile as mobile FROM credit_coupons
        UNION
        SELECT DISTINCT c.mobile 
        FROM sales_order_advances soa 
        INNER JOIN sales_orders so ON so.id = soa.sales_order_id
        INNER JOIN customers c ON c.id = so.customer_id
      )
      SELECT 
        c.id, 
        COALESCE(c.name, m.mobile, 'Unknown') as customer_name, 
        m.mobile as customer_mobile,
        COALESCE(cc_data.total_issued, 0) as coupon_issued,
        COALESCE(cc_data.total_spent, 0) as coupon_spent,
        (COALESCE(cc_data.total_issued, 0) - COALESCE(cc_data.total_spent, 0)) as coupon_balance,
        COALESCE(adv_data.total_issued, 0) as advance_issued,
        COALESCE(adv_data.total_spent, 0) as advance_spent,
        (COALESCE(adv_data.total_issued, 0) - COALESCE(adv_data.total_spent, 0)) as advance_balance,
        (COALESCE(cc_data.total_issued, 0) + COALESCE(adv_data.total_issued, 0)) as total_issued,
        (COALESCE(cc_data.total_spent, 0) + COALESCE(adv_data.total_spent, 0)) as total_spent,
        ((COALESCE(cc_data.total_issued, 0) - COALESCE(cc_data.total_spent, 0)) + (COALESCE(adv_data.total_issued, 0) - COALESCE(adv_data.total_spent, 0))) as total_balance
      FROM all_mobiles m
      LEFT JOIN customers c ON c.mobile = m.mobile
      LEFT JOIN (
        -- Coupon Aggregation
        SELECT 
          cc.customer_mobile,
          SUM(cc.amount) as total_issued,
          SUM(COALESCE(spent.spent_amount, 0)) as total_spent
        FROM credit_coupons cc
        LEFT JOIN (
          SELECT coupon_id, SUM(amount_applied) as spent_amount
          FROM credit_coupon_applications
          GROUP BY coupon_id
        ) spent ON spent.coupon_id = cc.id
        WHERE cc.created_at BETWEEN '${startDateStr}' AND '${endDateStr}'
        GROUP BY cc.customer_mobile
      ) cc_data ON cc_data.customer_mobile = m.mobile
      LEFT JOIN (
        -- Advance Aggregation
        SELECT 
          c.mobile,
          SUM(soa.amount) as total_issued,
          SUM(COALESCE(spent.spent_amount, 0)) as total_spent
        FROM sales_order_advances soa
        INNER JOIN sales_orders so ON so.id = soa.sales_order_id
        INNER JOIN customers c ON c.id = so.customer_id
        LEFT JOIN (
          SELECT advance_id, SUM(amount_applied) as spent_amount
          FROM sales_order_advance_applications
          GROUP BY advance_id
        ) spent ON spent.advance_id = soa.id
        WHERE soa.created_at BETWEEN '${startDateStr}' AND '${endDateStr}'
        GROUP BY c.mobile
      ) adv_data ON adv_data.mobile = m.mobile
      WHERE 
        (COALESCE(cc_data.total_issued, 0) > 0 OR COALESCE(adv_data.total_issued, 0) > 0)
        ${filters.customerId ? "AND c.id::text = '" + filters.customerId + "'" : ""}
      ORDER BY total_balance DESC
    `);

    // Calculate Summary Totals
    const summary = results.reduce((acc: any, curr: any) => {
      acc.totalCouponBalance += Number(curr.coupon_balance);
      acc.totalAdvanceBalance += Number(curr.advance_balance);
      acc.totalIssued += Number(curr.total_issued);
      acc.totalSpent += Number(curr.total_spent);
      return acc;
    }, { totalCouponBalance: 0, totalAdvanceBalance: 0, totalIssued: 0, totalSpent: 0, totalOutstanding: 0 });
    summary.totalOutstanding = summary.totalCouponBalance + summary.totalAdvanceBalance;

    // 2. Fetch Detailed Coupons with Applications
    const rawCoupons = await AppDataSource.query(`
      SELECT 
        cc.id,
        cc.coupon_no as coupon_code,
        cc.amount as issued_amount,
        cc.created_at,
        cc.status,
        cc.customer_mobile,
        c.id as customer_id,
        COALESCE(c.name, 'Unknown') as customer_name,
        COALESCE(spent.spent_amount, 0) as spent_amount,
        (cc.amount - COALESCE(spent.spent_amount, 0)) as balance_amount
      FROM credit_coupons cc
      LEFT JOIN customers c ON c.mobile = cc.customer_mobile
      LEFT JOIN (
        SELECT coupon_id, SUM(amount_applied) as spent_amount
        FROM credit_coupon_applications
        GROUP BY coupon_id
      ) spent ON spent.coupon_id = cc.id
      WHERE cc.created_at BETWEEN '${startDateStr}' AND '${endDateStr}'
      ${filters.customerId ? "AND c.id::text = '" + filters.customerId + "'" : ""}
      ORDER BY cc.created_at DESC
    `);

    let couponApps: any[] = [];
    if (rawCoupons.length > 0) {
      const couponIds = rawCoupons.map((c: any) => `'${c.id}'`).join(',');
      couponApps = await AppDataSource.query(`
        SELECT 
          cca.coupon_id,
          cca.amount_applied,
          cca.created_at as applied_at,
          si.invoice_number,
          si.id as invoice_id
        FROM credit_coupon_applications cca
        LEFT JOIN sales_invoices si ON si.id = cca.invoice_id
        WHERE cca.coupon_id IN (${couponIds})
        ORDER BY cca.created_at DESC
      `);
    }

    const coupons = rawCoupons.map((cc: any) => {
      const apps = couponApps.filter((a: any) => a.coupon_id === cc.id);
      return {
        id: cc.id,
        coupon_code: cc.coupon_code,
        customer_name: cc.customer_name,
        customer_mobile: cc.customer_mobile,
        created_at: cc.created_at,
        status: cc.status,
        issued_amount: parseFloat(cc.issued_amount) || 0,
        spent_amount: parseFloat(cc.spent_amount) || 0,
        balance_amount: parseFloat(cc.balance_amount) || 0,
        transactions: apps.map((app: any) => ({
          invoice_number: app.invoice_number || 'N/A',
          invoice_id: app.invoice_id,
          amount_applied: parseFloat(app.amount_applied) || 0,
          applied_at: app.applied_at
        }))
      };
    });

    // 3. Fetch Detailed Advances with Applications
    const rawAdvances = await AppDataSource.query(`
      SELECT 
        soa.id,
        soa.amount as issued_amount,
        soa.receipt_number,
        soa.created_at,
        c.mobile as customer_mobile,
        c.id as customer_id,
        COALESCE(c.name, 'Unknown') as customer_name,
        so.order_number as sales_order_number,
        COALESCE(spent.spent_amount, 0) as spent_amount,
        (soa.amount - COALESCE(spent.spent_amount, 0)) as balance_amount
      FROM sales_order_advances soa
      INNER JOIN sales_orders so ON so.id = soa.sales_order_id
      INNER JOIN customers c ON c.id = so.customer_id
      LEFT JOIN (
        SELECT advance_id, SUM(amount_applied) as spent_amount
        FROM sales_order_advance_applications
        GROUP BY advance_id
      ) spent ON spent.advance_id = soa.id
      WHERE soa.created_at BETWEEN '${startDateStr}' AND '${endDateStr}'
      ${filters.customerId ? "AND c.id::text = '" + filters.customerId + "'" : ""}
      ORDER BY soa.created_at DESC
    `);

    let advanceApps: any[] = [];
    if (rawAdvances.length > 0) {
      const advanceIds = rawAdvances.map((a: any) => `'${a.id}'`).join(',');
      advanceApps = await AppDataSource.query(`
        SELECT 
          soaa.advance_id,
          soaa.amount_applied,
          soaa.created_at as applied_at,
          si.invoice_number,
          si.id as invoice_id
        FROM sales_order_advance_applications soaa
        LEFT JOIN sales_invoices si ON si.id = soaa.invoice_id
        WHERE soaa.advance_id IN (${advanceIds})
        ORDER BY soaa.created_at DESC
      `);
    }

    const advances = rawAdvances.map((soa: any) => {
      const apps = advanceApps.filter((a: any) => a.advance_id === soa.id);
      return {
        id: soa.id,
        receipt_number: soa.receipt_number || soa.sales_order_number || 'N/A',
        sales_order_number: soa.sales_order_number || 'N/A',
        customer_name: soa.customer_name,
        customer_mobile: soa.customer_mobile,
        created_at: soa.created_at,
        status: soa.balance_amount > 0 ? 'active' : 'spent',
        issued_amount: parseFloat(soa.issued_amount) || 0,
        spent_amount: parseFloat(soa.spent_amount) || 0,
        balance_amount: parseFloat(soa.balance_amount) || 0,
        transactions: apps.map((app: any) => ({
          invoice_number: app.invoice_number || 'N/A',
          invoice_id: app.invoice_id,
          amount_applied: parseFloat(app.amount_applied) || 0,
          applied_at: app.applied_at
        }))
      };
    });

    return {
      summary,
      details: results.map((r: any) => ({
        ...r,
        coupon_issued: Number(r.coupon_issued),
        coupon_spent: Number(r.coupon_spent),
        coupon_balance: Number(r.coupon_balance),
        advance_issued: Number(r.advance_issued),
        advance_spent: Number(r.advance_spent),
        advance_balance: Number(r.advance_balance),
        total_issued: Number(r.total_issued),
        total_spent: Number(r.total_spent),
        total_balance: Number(r.total_balance)
      })),
      coupons,
      advances
    };
  }

  async customerLedger(customerId: string) {
    const customer = await AppDataSource.getRepository(Customer).findOneBy({ id: customerId });
    if (!customer) throw new Error('Customer not found');

    const invoices = await AppDataSource.getRepository(SalesInvoice).find({
      where: { customer_id: customerId },
      relations: ['items', 'items.product_item'],
      order: { invoice_date: 'DESC' }
    });

    const returns = await AppDataSource.getRepository(SalesReturn).createQueryBuilder('sr')
      .innerJoinAndSelect('sr.invoice', 'si')
      .leftJoinAndSelect('sr.items', 'items')
      .where('si.customer_id = :customerId', { customerId })
      .orderBy('sr.return_date', 'DESC')
      .getMany();

    const advances = await AppDataSource.getRepository(SalesOrderAdvance).createQueryBuilder('soa')
      .innerJoinAndSelect('soa.salesOrder', 'so')
      .where('so.customer_id = :customerId', { customerId })
      .orderBy('soa.created_at', 'DESC')
      .getMany();

    const coupons = await AppDataSource.getRepository(CreditCoupon).find({
      where: { customer_mobile: customer.mobile },
      order: { created_at: 'DESC' }
    });

    const creditSummary = await this.customerCreditReport({ customerId });
    const summary = creditSummary.details[0] || {
      coupon_balance: 0,
      advance_balance: 0,
      total_balance: 0,
      total_spent: 0
    };

    return {
      customer,
      invoices,
      returns,
      advances,
      coupons: coupons.map((c: any) => ({
        ...c,
        coupon_code: c.coupon_no
      })),
      summary
    };
  }

  async barcodeReconciliationReport(filters: { startDate?: string; endDate?: string; page?: number; limit?: number; exportMode?: boolean | string; vendorId?: string }) {
    const startDateStr = filters.startDate ? filters.startDate.split('T')[0] + ' 00:00:00' : '2000-01-01 00:00:00';
    const endDateStr = filters.endDate ? filters.endDate.split('T')[0] + ' 23:59:59' : '2099-12-31 23:59:59';
    const page = Number(filters.page) || 1;
    const limit = Number(filters.limit) || 50;
    const offset = (page - 1) * limit;
    const isExport = filters.exportMode === 'true' || filters.exportMode === true;

    const whereClauses = ['ur.record_date >= $1::timestamp', 'ur.record_date <= $2::timestamp'];
    const params: any[] = [startDateStr, endDateStr];

    if (filters.vendorId) {
      params.push(filters.vendorId);
      whereClauses.push(`ur.vendor_id = $${params.length}`);
    }

    const whereStr = whereClauses.join(' AND ');

    const baseCTE = `
      WITH barcode_numbered AS (
        SELECT 
          bb.id,
          bb.po_id,
          bb.design_no,
          bb.color,
          bb.size,
          bb.total_quantity,
          bb.available_quantity,
          bb.barcode_alias_8digit,
          bb.created_at,
          bb.vendor,
          bb.hsn_code
        FROM barcode_batches bb
        WHERE bb.status != 'deleted' AND bb.po_id IS NOT NULL
      ),
      barcode_numbered_rn AS (
        SELECT 
          bn.*,
          ROW_NUMBER() OVER (
            PARTITION BY bn.po_id, bn.design_no, bn.color, bn.size 
            ORDER BY bn.created_at ASC, bn.id ASC
          ) as rn
        FROM barcode_numbered bn
      ),
      mapped_po_barcodes AS (
        SELECT 
          bn.id::text as id,
          bn.barcode_alias_8digit as purchase_barcode,
          bn.available_quantity as available_qty,
          CASE WHEN bn.rn = 1 THEN 
            COALESCE(
              (
                SELECT SUM(pi.quantity) 
                FROM purchase_items pi 
                WHERE pi.po_id = bn.po_id 
                  AND pi.design_no = bn.design_no 
                  AND (pi.color = bn.color OR (pi.color IS NULL AND bn.color IS NULL)) 
                  AND pi.size = bn.size
              ),
              0
            )
          ELSE 0 END as purchase_qty,
          COALESCE(
            (
              SELECT po.order_date 
              FROM purchase_orders po 
              WHERE po.id = bn.po_id
            ),
            bn.created_at
          ) as record_date,
          bn.vendor::text as vendor_id,
          bn.design_no,
          bn.color as color_id,
          bn.size as size_id,
          bn.hsn_code as hsn
        FROM barcode_numbered_rn bn
      ),
      unprinted_purchase_items AS (
        SELECT 
          pi.id::text as id,
          'NO BARCODE' as purchase_barcode,
          0 as available_qty,
          pi.quantity as purchase_qty,
          po.order_date as record_date,
          po.vendor::text as vendor_id,
          pi.design_no,
          pi.color as color_id,
          pi.size as size_id,
          pi.hsn_code as hsn
        FROM purchase_items pi
        INNER JOIN purchase_orders po ON po.id = pi.po_id
        WHERE po.status = 'Completed'
          AND NOT EXISTS (
            SELECT 1 FROM barcode_batches bb
            WHERE bb.po_id = pi.po_id 
              AND bb.design_no = pi.design_no
              AND (bb.color = pi.color OR (bb.color IS NULL AND pi.color IS NULL))
              AND bb.size = pi.size
              AND bb.status != 'deleted'
          )
      ),
      opening_stock_barcodes AS (
        SELECT 
          bb.id::text as id,
          bb.barcode_alias_8digit as purchase_barcode,
          bb.available_quantity as available_qty,
          bb.total_quantity as purchase_qty,
          bb.created_at as record_date,
          bb.vendor::text as vendor_id,
          bb.design_no,
          bb.color as color_id,
          bb.size as size_id,
          bb.hsn_code as hsn
        FROM barcode_batches bb
        WHERE bb.status != 'deleted' AND bb.po_id IS NULL
      ),
      unified_report AS (
        SELECT * FROM mapped_po_barcodes
        UNION ALL
        SELECT * FROM unprinted_purchase_items
        UNION ALL
        SELECT * FROM opening_stock_barcodes
      )
    `;

    const countRes = await AppDataSource.query(`
      ${baseCTE}
      SELECT COUNT(ur.id) as count 
      FROM unified_report ur
      WHERE ${whereStr}
    `, params);
    const total = parseInt(countRes[0].count, 10);

    const limitParamIndex = params.length + 1;
    const offsetParamIndex = params.length + 2;
    if (!isExport) {
      params.push(limit);
      params.push(offset);
    }
    const limitStr = isExport ? '' : `LIMIT $${limitParamIndex} OFFSET $${offsetParamIndex}`;

    const data = await AppDataSource.query(`
      ${baseCTE}
      SELECT 
        ur.id,
        ur.purchase_barcode,
        ur.available_qty,
        ur.purchase_qty,
        COALESCE(SUM(sii.quantity), 0) as sale_qty,
        STRING_AGG(DISTINCT si.invoice_number, ', ') as invoice_number,
        MAX(si.invoice_date) as invoice_date,
        COALESCE(MAX(sii.barcode_8digit), '-') as sale_barcode,
        CASE WHEN ur.purchase_qty = COALESCE(SUM(sii.quantity), 0) THEN '0' ELSE ur.purchase_barcode END as match_status,
        v.name as vendor_name,
        ur.design_no as design_no,
        c.name as color_name,
        sz.name as size_name,
        ur.hsn as hsn
      FROM unified_report ur
      LEFT JOIN sales_invoice_items sii ON sii.barcode_8digit = ur.purchase_barcode AND ur.purchase_barcode != 'NO BARCODE'
      LEFT JOIN sales_invoices si ON si.id = sii.invoice_id
      LEFT JOIN vendors v ON v.id::text = ur.vendor_id
      LEFT JOIN colors c ON c.id = ur.color_id
      LEFT JOIN sizes sz ON sz.id = ur.size_id
      WHERE ${whereStr}
      GROUP BY 
        ur.id,
        ur.purchase_barcode,
        ur.available_qty,
        ur.purchase_qty,
        v.name,
        ur.design_no,
        c.name,
        sz.name,
        ur.hsn,
        ur.record_date
      ORDER BY ur.record_date DESC, ur.design_no ASC
      ${limitStr}
    `, params);

    return {
      data,
      total,
      page,
      limit
    };
  }
  async salesAnalysisReport(filters: { startDate?: string; endDate?: string; vendorId?: string; floorId?: string; design?: string; barcode?: string; page?: number; limit?: number; exportMode?: boolean | string; sortField?: string; sortDirection?: string }) {
    try {
      const exportMode = filters.exportMode === true || filters.exportMode === 'true';
      const page = Number(filters.page) || 1;
      const limit = Number(filters.limit) || (exportMode ? 100000 : 50);
      const start = filters.startDate ? new Date(filters.startDate) : new Date(0);
      const end = filters.endDate ? new Date(filters.endDate) : new Date();
      if (filters.endDate) end.setHours(23, 59, 59, 999);

      const whereClauses: string[] = ["1=1"];
      const params: any[] = [];
      let paramIdx = 1;

      whereClauses.push(`si.invoice_date >= $${paramIdx++} AND si.invoice_date <= $${paramIdx++}`);
      params.push(start.toISOString(), end.toISOString());

      if (filters.vendorId) {
        whereClauses.push(`bb.vendor::text = $${paramIdx++}`);
        params.push(filters.vendorId);
      }
      if (filters.floorId) {
        whereClauses.push(`si.floor_id::text = $${paramIdx++}`);
        params.push(filters.floorId);
      }
      if (filters.design) {
        whereClauses.push(`bb.design_no ILIKE $${paramIdx++}`);
        params.push(`%${filters.design}%`);
      }
      if (filters.barcode) {
        whereClauses.push(`(sii.barcode_8digit ILIKE $${paramIdx} OR bb.barcode_structured ILIKE $${paramIdx++})`);
        params.push(`%${filters.barcode}%`);
      }

      const whereSql = whereClauses.join(' AND ');

      let orderByField = 'si.invoice_date';
      let sortDir = 'DESC';
      if (filters.sortField === 'invoice_date') orderByField = 'si.invoice_date';
      if (filters.sortField === 'invoice_number') orderByField = 'si.invoice_number';
      if (filters.sortField === 'mrp') orderByField = 'sii.mrp';
      if (filters.sortDirection === 'ASC' || filters.sortDirection === 'asc') sortDir = 'ASC';

      // 1. Fetch Sales Items
      const salesQuery = `
        SELECT 
          sii.id,
          'SALE' as type,
          si.invoice_number as document_number,
          si.invoice_date as document_date,
          sii.barcode_8digit,
          bb.barcode_structured,
          bb.design_no,
          sii.quantity,
          sii.mrp,
          bb.cost_actual as cost,
          sii.discount,
          v.name as vendor_name,
          pg.name as product_group,
          c.name as color,
          s.name as size
        FROM sales_invoice_items sii
        INNER JOIN sales_invoices si ON si.id = sii.invoice_id
        LEFT JOIN barcode_batches bb ON bb.barcode_alias_8digit = sii.barcode_8digit
        LEFT JOIN vendors v ON v.id = bb.vendor
        LEFT JOIN product_groups pg ON pg.id = bb.product_group
        LEFT JOIN colors c ON c.id = bb.color
        LEFT JOIN sizes s ON s.id = bb.size
        WHERE ${whereSql}
      `;

      // 2. Fetch Sales Return Items
      const returnsWhereClauses = whereClauses.map(w => w.replace(/si\.invoice_date/g, 'sr.return_date').replace(/si\.floor_id/g, 'sr.floor_id').replace(/si\.invoice_number/g, 'sr.return_number').replace(/sii\./g, 'sri.'));
      const returnsWhereSql = returnsWhereClauses.join(' AND ');

      const returnsQuery = `
        SELECT 
          sri.id,
          'RETURN' as type,
          sr.return_number as document_number,
          sr.return_date as document_date,
          sri.barcode_8digit,
          bb.barcode_structured,
          bb.design_no,
          -sri.quantity as quantity,
          sri.mrp,
          bb.cost_actual as cost,
          sri.discount_amount as discount,
          v.name as vendor_name,
          pg.name as product_group,
          c.name as color,
          s.name as size
        FROM sales_return_items sri
        INNER JOIN sales_returns sr ON sr.id = sri.return_id
        LEFT JOIN barcode_batches bb ON bb.barcode_alias_8digit = sri.barcode_8digit
        LEFT JOIN vendors v ON v.id = bb.vendor
        LEFT JOIN product_groups pg ON pg.id = bb.product_group
        LEFT JOIN colors c ON c.id = bb.color
        LEFT JOIN sizes s ON s.id = bb.size
        WHERE ${returnsWhereSql}
      `;

      // 3. Combine and Paginate
      const combinedQuery = `
        WITH combined AS (
          ${salesQuery}
          UNION ALL
          ${returnsQuery}
        )
        SELECT * FROM combined
        ORDER BY document_date ${sortDir}, document_number ${sortDir}
        LIMIT ${limit} OFFSET ${(page - 1) * limit}
      `;

      const countQuery = `
        WITH combined AS (
          ${salesQuery}
          UNION ALL
          ${returnsQuery}
        )
        SELECT COUNT(*) as total FROM combined
      `;

      const [data, countRes] = await Promise.all([
        AppDataSource.query(combinedQuery, params),
        AppDataSource.query(countQuery, params)
      ]);

      const totalItems = parseInt(countRes[0]?.total || '0', 10);
      const totalPages = Math.ceil(totalItems / limit);

      const formattedData = data.map((r: any) => ({
        id: r.id,
        type: r.type, // 'SALE' or 'RETURN'
        document_number: r.document_number,
        document_date: r.document_date,
        itemCode: r.barcode_structured || r.barcode_8digit || 'NO BARCODE',
        barcode_alias: r.barcode_8digit || 'NO ALIAS',
        design: r.design_no || 'N/A',
        quantity: Number(r.quantity),
        mrp: Number(r.mrp),
        cost: Number(r.cost),
        discount: Number(r.discount),
        vendorName: r.vendor_name || '-',
        productGroup: r.product_group || '-',
        color: r.color || '-',
        size: r.size || '-',
      }));

      return {
        data: formattedData,
        summary: {},
        pagination: { totalItems, totalPages, currentPage: page, limit }
      };

    } catch (error: any) {
      logger.error(`Error generating sales analysis report: ${error.message}`);
      throw new Error(`Failed to generate sales analysis report: ${error.message}`);
    }
  }

  // Stock Ledger Report
  async stockLedgerReport(filters: { startDate?: string, endDate?: string, page?: number, limit?: number, vendor?: number, vendorId?: number, productGroup?: number, design?: string, size?: number, color?: number, barcode?: string } | any) {
    const start = (filters.startDate || '').split('T')[0] || '2000-01-01';
    const end = ((filters.endDate || '').split('T')[0] || '2099-12-31') + ' 23:59:59';
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const isExport = filters.limit === 100000;

    const whereClauses: string[] = ["t.barcode IS NOT NULL"];
    
    // Support both 'vendor' (legacy) and 'vendorId' (frontend standard)
    const targetVendor = filters.vendorId || filters.vendor;
    if (targetVendor) whereClauses.push(`po.vendor = '${targetVendor}'`);
    
    if (filters.productGroup) whereClauses.push(`bb_info.product_group = '${filters.productGroup}'`);
    if (filters.color) whereClauses.push(`bb_info.color = '${filters.color}'`);
    if (filters.size) whereClauses.push(`bb_info.size = '${filters.size}'`);
    if (filters.design) whereClauses.push(`bb_info.design_no ILIKE '%${filters.design}%'`);
    if (filters.barcode) {
      whereClauses.push(`(bb_info.barcode_structured ILIKE '%${filters.barcode}%' OR bb_info.barcode_alias_8digit ILIKE '%${filters.barcode}%')`);
    }
    const whereSql = whereClauses.join(' AND ');

    const query = `
      SELECT 
        agg.barcode,
        MAX(bb_info.barcode_structured) as structured_barcode,
        agg.design_no, 
        agg.product_group, 
        MAX(cl.name) as color,
        MAX(sz.name) as size,
        MAX(pi.hsn_code) as hsn,
        MAX(pi.cost_per_item) as cost,
        MAX(pi.mrp) as mrp,
        MAX(v.name) as vendor,
        COALESCE(MAX(po.invoice_number), MAX(agg.po_no)) as po_no,
        MAX(po.order_date) as po_date,
        agg.opening_stock,
        agg.purchased_qty,
        agg.sales_return_qty,
        agg.sold_qty,
        agg.purchase_return_qty,
        agg.closing_stock
      FROM (
        SELECT 
          t.barcode,
          t.design_no,
          t.product_group,
          MAX(t.po_no) as po_no,
          MAX(t.po_id::text)::uuid as po_id,
          MAX(t.color_id::text)::uuid as color_id,
          MAX(t.size_id::text)::uuid as size_id,
          SUM(t.opening_qty) as opening_stock,
          SUM(t.purchased_qty) as purchased_qty,
          SUM(t.sales_return_qty) as sales_return_qty,
          SUM(t.sold_qty) as sold_qty,
          SUM(t.purchase_return_qty) as purchase_return_qty,
          SUM(t.opening_qty + t.purchased_qty + t.sales_return_qty - t.sold_qty - t.purchase_return_qty) as closing_stock
        FROM (
        -- Purchases (opening) - BARCODED
        SELECT 
           bb.barcode_alias_8digit as barcode, 
           bb.design_no, pg.name as product_group,
           SUM(bb.total_quantity) as opening_qty, 0 as purchased_qty, 0 as sales_return_qty, 0 as sold_qty, 0 as purchase_return_qty,
           COALESCE(po.invoice_number, po.po_number) as po_no,
           po.id as po_id,
           bb.color as color_id,
           bb.size as size_id
        FROM barcode_batches bb
        LEFT JOIN product_groups pg ON pg.id = bb.product_group
        INNER JOIN purchase_orders po ON po.id = bb.po_id
        WHERE po.order_date < '${start}' AND po.status = 'Completed' AND bb.status != 'deleted' AND bb.barcode_alias_8digit IS NOT NULL
        GROUP BY bb.barcode_alias_8digit, bb.design_no, pg.name, po.invoice_number, po.po_number, po.id, bb.color, bb.size
        
        UNION ALL
        -- Purchases (opening) - ORPHANED (No barcodes)
        SELECT barcode, design_no, product_group, SUM(remainder) as opening_qty, 0 as purchased_qty, 0 as sales_return_qty, 0 as sold_qty, 0 as purchase_return_qty, po_no, po_id, color_id, size_id
        FROM (
          SELECT 
             'NO_BARCODE: ' || COALESCE(po.invoice_number, po.po_number) as barcode,
             pi.design_no, pg.name as product_group,
             pi.quantity - COALESCE(
               (SELECT SUM(bb.total_quantity) FROM barcode_batches bb WHERE bb.po_id = pi.po_id AND bb.design_no = pi.design_no AND COALESCE(bb.color::text, '') = COALESCE(pi.color::text, '') AND bb.size = pi.size AND bb.status != 'deleted'), 0
             ) as remainder,
             COALESCE(po.invoice_number, po.po_number) as po_no,
             po.id as po_id,
             pi.color as color_id,
             pi.size as size_id
          FROM purchase_items pi
          LEFT JOIN product_groups pg ON pg.id = pi.product_group
          INNER JOIN purchase_orders po ON po.id = pi.po_id
          WHERE po.order_date < '${start}' AND po.status = 'Completed'
        ) as sub
        WHERE remainder > 0
        GROUP BY barcode, design_no, product_group, po_no, po_id, color_id, size_id
        
        UNION ALL
        -- Purchases (period) - BARCODED
        SELECT 
           bb.barcode_alias_8digit as barcode, 
           bb.design_no, pg.name as product_group,
           0, SUM(bb.total_quantity), 0, 0, 0,
           COALESCE(po.invoice_number, po.po_number) as po_no,
           po.id as po_id,
           bb.color as color_id,
           bb.size as size_id
        FROM barcode_batches bb
        LEFT JOIN product_groups pg ON pg.id = bb.product_group
        INNER JOIN purchase_orders po ON po.id = bb.po_id
        WHERE po.order_date BETWEEN '${start}' AND '${end}' AND po.status = 'Completed' AND bb.status != 'deleted' AND bb.barcode_alias_8digit IS NOT NULL
        GROUP BY bb.barcode_alias_8digit, bb.design_no, pg.name, po.invoice_number, po.po_number, po.id, bb.color, bb.size
        
        UNION ALL
        -- Purchases (period) - ORPHANED (No barcodes)
        SELECT barcode, design_no, product_group, 0, SUM(remainder), 0, 0, 0, po_no, po_id, color_id, size_id
        FROM (
          SELECT 
             'NO_BARCODE: ' || COALESCE(po.invoice_number, po.po_number) as barcode,
             pi.design_no, pg.name as product_group,
             pi.quantity - COALESCE(
               (SELECT SUM(bb.total_quantity) FROM barcode_batches bb WHERE bb.po_id = pi.po_id AND bb.design_no = pi.design_no AND COALESCE(bb.color::text, '') = COALESCE(pi.color::text, '') AND bb.size = pi.size AND bb.status != 'deleted'), 0
             ) as remainder,
             COALESCE(po.invoice_number, po.po_number) as po_no,
             po.id as po_id,
             pi.color as color_id,
             pi.size as size_id
          FROM purchase_items pi
          LEFT JOIN product_groups pg ON pg.id = pi.product_group
          INNER JOIN purchase_orders po ON po.id = pi.po_id
          WHERE po.order_date BETWEEN '${start}' AND '${end}' AND po.status = 'Completed'
        ) as sub
        WHERE remainder > 0
        GROUP BY barcode, design_no, product_group, po_no, po_id, color_id, size_id
        
        UNION ALL
        -- Sales (opening)
        SELECT COALESCE(sii.barcode_8digit, bb.barcode_alias_8digit, 'UNBARCODED') as barcode, COALESCE(bb.design_no, 'UNKNOWN') as design_no, pg.name as product_group,
               -SUM(sii.quantity), 0, 0, 0, 0,
               NULL as po_no,
               bb.po_id,
               bb.color as color_id,
               bb.size as size_id
        FROM sales_invoice_items sii
        INNER JOIN sales_invoices si ON si.id = sii.invoice_id
        LEFT JOIN barcode_batches bb ON bb.barcode_alias_8digit = sii.barcode_8digit
        LEFT JOIN product_groups pg ON pg.id = bb.product_group
        WHERE si.invoice_date < '${start}'
        GROUP BY 1, 2, 3, 9, 10, 11, 12
        
        UNION ALL
        -- Sales (period)
        SELECT COALESCE(sii.barcode_8digit, bb.barcode_alias_8digit, 'UNBARCODED') as barcode, COALESCE(bb.design_no, 'UNKNOWN') as design_no, pg.name as product_group,
               0, 0, 0, SUM(sii.quantity), 0,
               NULL as po_no,
               bb.po_id,
               bb.color as color_id,
               bb.size as size_id
        FROM sales_invoice_items sii
        INNER JOIN sales_invoices si ON si.id = sii.invoice_id
        LEFT JOIN barcode_batches bb ON bb.barcode_alias_8digit = sii.barcode_8digit
        LEFT JOIN product_groups pg ON pg.id = bb.product_group
        WHERE si.invoice_date BETWEEN '${start}' AND '${end}'
        GROUP BY 1, 2, 3, 9, 10, 11, 12
        
        UNION ALL
        -- Sales Returns (opening)
        SELECT COALESCE(sri.barcode_8digit, bb.barcode_alias_8digit, 'UNBARCODED') as barcode, COALESCE(bb.design_no, 'UNKNOWN') as design_no, pg.name as product_group,
               SUM(sri.quantity), 0, 0, 0, 0,
               NULL as po_no,
               bb.po_id,
               bb.color as color_id,
               bb.size as size_id
        FROM sales_return_items sri
        INNER JOIN sales_returns sr ON sr.id = sri.return_id
        LEFT JOIN barcode_batches bb ON bb.barcode_alias_8digit = sri.barcode_8digit
        LEFT JOIN product_groups pg ON pg.id = bb.product_group
        WHERE sr.return_date < '${start}'
        GROUP BY 1, 2, 3, 9, 10, 11, 12
        
        UNION ALL
        -- Sales Returns (period)
        SELECT COALESCE(sri.barcode_8digit, bb.barcode_alias_8digit, 'UNBARCODED') as barcode, COALESCE(bb.design_no, 'UNKNOWN') as design_no, pg.name as product_group,
               0, 0, SUM(sri.quantity), 0, 0,
               NULL as po_no,
               bb.po_id,
               bb.color as color_id,
               bb.size as size_id
        FROM sales_return_items sri
        INNER JOIN sales_returns sr ON sr.id = sri.return_id
        LEFT JOIN barcode_batches bb ON bb.barcode_alias_8digit = sri.barcode_8digit
        LEFT JOIN product_groups pg ON pg.id = bb.product_group
        WHERE sr.return_date BETWEEN '${start}' AND '${end}'
        GROUP BY 1, 2, 3, 9, 10, 11, 12
        
        UNION ALL
        -- Purchase Returns (opening)
        SELECT COALESCE(bb.barcode_alias_8digit, 'UNBARCODED') as barcode, COALESCE(bb.design_no, 'UNKNOWN') as design_no, pg.name as product_group,
               -SUM(pri.quantity), 0, 0, 0, 0,
               NULL as po_no,
               bb.po_id,
               bb.color as color_id,
               bb.size as size_id
        FROM purchase_return_items pri
        INNER JOIN purchase_returns pr ON pr.id = pri.return_id
        LEFT JOIN barcode_batches bb ON bb.id = pri.item_id
        LEFT JOIN product_groups pg ON pg.id = bb.product_group
        WHERE pr.return_date < '${start}'
        GROUP BY 1, 2, 3, 9, 10, 11, 12
        
        UNION ALL
        -- Purchase Returns (period)
        SELECT COALESCE(bb.barcode_alias_8digit, 'UNBARCODED') as barcode, COALESCE(bb.design_no, 'UNKNOWN') as design_no, pg.name as product_group,
               0, 0, 0, 0, SUM(pri.quantity),
               NULL as po_no,
               bb.po_id,
               bb.color as color_id,
               bb.size as size_id
        FROM purchase_return_items pri
        INNER JOIN purchase_returns pr ON pr.id = pri.return_id
        LEFT JOIN barcode_batches bb ON bb.id = pri.item_id
        LEFT JOIN product_groups pg ON pg.id = bb.product_group
        WHERE pr.return_date BETWEEN '${start}' AND '${end}'
        GROUP BY 1, 2, 3, 9, 10, 11, 12
        ) t
        WHERE t.barcode IS NOT NULL
        GROUP BY t.barcode, t.design_no, t.product_group
      ) agg
      LEFT JOIN (
         SELECT DISTINCT ON (barcode_alias_8digit) 
            barcode_alias_8digit, barcode_structured, po_id, design_no, color, size, product_group
         FROM barcode_batches
      ) bb_info ON bb_info.barcode_alias_8digit = agg.barcode
      LEFT JOIN purchase_orders po ON po.id = COALESCE(bb_info.po_id, agg.po_id)
      LEFT JOIN purchase_items pi ON pi.po_id = COALESCE(bb_info.po_id, agg.po_id) AND pi.design_no = agg.design_no 
         AND (pi.color = COALESCE(bb_info.color, agg.color_id) OR (pi.color IS NULL AND COALESCE(bb_info.color, agg.color_id) IS NULL)) 
         AND (pi.size = COALESCE(bb_info.size, agg.size_id) OR (pi.size IS NULL AND COALESCE(bb_info.size, agg.size_id) IS NULL))
      LEFT JOIN colors cl ON cl.id = COALESCE(bb_info.color, agg.color_id)
      LEFT JOIN sizes sz ON sz.id = COALESCE(bb_info.size, agg.size_id)
      LEFT JOIN vendors v ON v.id = po.vendor
      WHERE ${whereSql.replace(/t\.barcode/g, 'agg.barcode')}
      GROUP BY agg.barcode, agg.design_no, agg.product_group, agg.opening_stock, agg.purchased_qty, agg.sales_return_qty, agg.sold_qty, agg.purchase_return_qty, agg.closing_stock
      HAVING agg.opening_stock != 0 OR agg.purchased_qty != 0 OR agg.sales_return_qty != 0 OR agg.sold_qty != 0 OR agg.purchase_return_qty != 0
      ORDER BY agg.barcode ASC
      LIMIT ${limit} OFFSET ${(page - 1) * limit}
    `;

    // Only get total count if we need pagination (not export mode)
    let totalCount = 0;
    if (!isExport) {
      const countQuery = `
        SELECT COUNT(*) as count FROM (
          SELECT t.barcode FROM (
            SELECT bb.barcode_alias_8digit as barcode FROM barcode_batches bb LEFT JOIN purchase_orders po ON po.id = bb.po_id WHERE po.order_date <= '${end}' AND bb.status != 'deleted'
            UNION ALL SELECT bb.barcode_alias_8digit as barcode FROM sales_invoice_items sii INNER JOIN sales_invoices si ON si.id = sii.invoice_id LEFT JOIN barcode_batches bb ON bb.barcode_alias_8digit = sii.barcode_8digit WHERE si.invoice_date <= '${end}'
            UNION ALL SELECT bb.barcode_alias_8digit as barcode FROM sales_return_items sri INNER JOIN sales_returns sr ON sr.id = sri.return_id LEFT JOIN barcode_batches bb ON bb.barcode_alias_8digit = sri.barcode_8digit WHERE sr.return_date <= '${end}'
            UNION ALL SELECT bb.barcode_alias_8digit as barcode FROM purchase_return_items pri INNER JOIN purchase_returns pr ON pr.id = pri.return_id LEFT JOIN barcode_batches bb ON bb.id = pri.item_id WHERE pr.return_date <= '${end}'
          ) as t
          LEFT JOIN (
             SELECT DISTINCT ON (barcode_alias_8digit) 
                barcode_alias_8digit, barcode_structured, po_id, design_no, color, size, product_group
             FROM barcode_batches
          ) bb_info ON bb_info.barcode_alias_8digit = t.barcode
          LEFT JOIN purchase_orders po ON po.id = bb_info.po_id
          WHERE ${whereSql}
          GROUP BY t.barcode
        ) as cnt
      `;
      const countRes = await AppDataSource.query(countQuery);
      totalCount = parseInt(countRes[0]?.count || 0);
    }

    const rows = await AppDataSource.query(query);
    
    // Convert to integers
    const data = rows.map((r: any) => ({
      barcode: r.barcode || 'N/A',
      structured_barcode: r.structured_barcode || 'N/A',
      design_no: r.design_no || 'N/A',
      product_group: r.product_group || '-',
      color: r.color || '-',
      size: r.size || '-',
      hsn: r.hsn || '-',
      cost: Number(r.cost || 0),
      mrp: Number(r.mrp || 0),
      vendor: r.vendor || '-',
      po_no: r.po_no || '-',
      po_date: r.po_date || '-',
      opening_stock: parseInt(r.opening_stock) || 0,
      purchased_qty: parseInt(r.purchased_qty) || 0,
      sales_return_qty: parseInt(r.sales_return_qty) || 0,
      sold_qty: parseInt(r.sold_qty) || 0,
      purchase_return_qty: parseInt(r.purchase_return_qty) || 0,
      closing_stock: parseInt(r.closing_stock) || 0
    }));

    // Calculate Summary
    const summary = data.reduce((acc: any, row: any) => {
      acc.totalOpening += row.opening_stock;
      acc.totalPurchased += row.purchased_qty;
      acc.totalSalesReturn += row.sales_return_qty;
      acc.totalSold += row.sold_qty;
      acc.totalPurchaseReturn += row.purchase_return_qty;
      acc.totalClosing += row.closing_stock;
      return acc;
    }, { totalOpening: 0, totalPurchased: 0, totalSalesReturn: 0, totalSold: 0, totalPurchaseReturn: 0, totalClosing: 0 });

    return {
      data,
      summary,
      pagination: {
        page,
        limit,
        totalItems: isExport ? data.length : totalCount,
        totalPages: isExport ? 1 : Math.ceil(totalCount / limit)
      }
    };
  }
}

export const reportService = new ReportService();
