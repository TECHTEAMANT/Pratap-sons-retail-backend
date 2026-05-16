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
    const end = filters.endDate.split('T')[0];
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
      .select('SUM(sii.quantity) as "totalQuantity"')
      .where('si.invoice_date BETWEEN :start AND :end', { start, end });

    if (filters.floorId) {
      invoiceSummaryQB.andWhere('si.floor_id::text = :floorId', { floorId: filters.floorId });
      quantityQB.andWhere('si.floor_id::text = :floorId', { floorId: filters.floorId });
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

    const [rawSummary, rawQty] = await Promise.all([
      invoiceSummaryQB.getRawOne(),
      quantityQB.getRawOne()
    ]);
    
    const result = {
      totalSales: parseFloat(rawSummary.totalSales) || 0,
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
      approvalItemCount: 0,
      totalQuantity: parseFloat(rawQty.totalQuantity) || 0,
      totalReturns: 0
    };

    // Quick Returns Summary

    const returnsSummary = await AppDataSource.getRepository(SalesReturn)
      .createQueryBuilder('sr')
      .select('SUM(sr.total_return_amount) as total')
      .where('sr.return_date BETWEEN :start AND :end', { start: `${start}T00:00:00.000Z`, end: `${end}T23:59:59.999Z` })
      .getRawOne();
    result.totalReturns = parseFloat(returnsSummary.total) || 0;

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
      const includePhotos = filters.includePhotos === true || filters.includePhotos === 'true' || (exportMode && filters.includePhotos === undefined);
      const page = Number(filters.page) || 1;
      const limit = exportMode ? 100000 : (Number(filters.limit) || 50);

      const startTime = Date.now();
      logger.info(`[Perf] inventoryReport started: ${JSON.stringify(filters)}`);

      let summaryData = { totalAvailable: 0, totalSold: 0, totalReturnedItemsCount: 0, totalCostValue: 0, estProfit: 0, totalItems: 0 };
      
      // --- PHASE 1: SUMMARY DATA ---
      if (filters.skipSummary === 'true' || filters.skipSummary === true) {
        logger.info(`[Perf] inventoryReport Phase 1 skipped (skipSummary=true)`);
      } else {
        const phase1Start = Date.now();
        const start = (filters.startDate || '').split('T')[0] || '2000-01-01';
        const end = (filters.endDate || '').split('T')[0] || '2099-12-31';

        // 1. TOTAL PURCHASED (Ground Truth from Purchase Invoices)
        const totalPurchasedRes = await AppDataSource.query(`
          SELECT 
            COALESCE(SUM(po.total_items), 0) as "totalItems",
            COALESCE(SUM(po.total_amount), 0) as "totalCostValue"
          FROM purchase_orders po
          WHERE po.order_date BETWEEN '${start}' AND '${end}'
          AND po.status = 'Completed'
          ${filters.vendorId ? 'AND po.vendor::text = $1' : ''}
          ${filters.floorId ? ('AND EXISTS (SELECT 1 FROM purchase_items pi WHERE pi.po_id = po.id AND pi.floor_id::text = $' + (filters.vendorId ? 2 : 1) + ')') : ''}
        `, [...(filters.vendorId ? [filters.vendorId] : []), ...(filters.floorId ? [filters.floorId] : [])]);

        // 2. TOTAL SOLD (Real Sales Data from Invoices)
        const totalSoldRes = await AppDataSource.query(`
          SELECT COALESCE(SUM(sii.quantity), 0) as "totalSold"
          FROM sales_invoice_items sii
          INNER JOIN sales_invoices si ON si.id::text = sii.invoice_id::text
          INNER JOIN barcode_batches bb ON bb.barcode_alias_8digit = sii.barcode_8digit
          WHERE (si.invoice_date BETWEEN '${start}' AND '${end}')
          AND bb.status != 'deleted'
          ${filters.vendorId ? 'AND bb.vendor::text = $1' : ''}
          ${filters.floorId ? ('AND bb.floor::text = $' + (filters.vendorId ? 2 : 1)) : ''}
        `, [...(filters.vendorId ? [filters.vendorId] : []), ...(filters.floorId ? [filters.floorId] : [])]);

        // 3. TOTAL PURCHASE RETURNED (Real Return Data)
        const totalReturnedRes = await AppDataSource.query(`
          SELECT COALESCE(SUM(pri.quantity), 0) as "totalReturned"
          FROM purchase_return_items pri
          INNER JOIN purchase_returns pr ON pr.id::text = pri.return_id::text
          INNER JOIN barcode_batches bb ON bb.barcode_alias_8digit = pri.barcode_id
          WHERE (pr.return_date BETWEEN '${start}' AND '${end}')
          AND bb.status != 'deleted'
          ${filters.vendorId ? 'AND bb.vendor::text = $1' : ''}
          ${filters.floorId ? ('AND bb.floor::text = $' + (filters.vendorId ? 2 : 1)) : ''}
        `, [...(filters.vendorId ? [filters.vendorId] : []), ...(filters.floorId ? [filters.floorId] : [])]);

        // 4. TOTAL SALES RETURNED (Items that came back to stock)
        const totalSalesReturnedRes = await AppDataSource.query(`
          SELECT COALESCE(SUM(sri.quantity), 0) as "totalSalesReturned"
          FROM sales_return_items sri
          INNER JOIN sales_returns sr ON sr.id::text = sri.return_id::text
          INNER JOIN barcode_batches bb ON bb.barcode_alias_8digit = sri.barcode_8digit
          WHERE (sr.return_date BETWEEN '${start}' AND '${end}')
          AND bb.status != 'deleted'
          ${filters.vendorId ? 'AND bb.vendor::text = $1' : ''}
          ${filters.floorId ? ('AND bb.floor::text = $' + (filters.vendorId ? 2 : 1)) : ''}
        `, [...(filters.vendorId ? [filters.vendorId] : []), ...(filters.floorId ? [filters.floorId] : [])]);

        // 5. PROFIT CALCULATION (Based on Sales Invoices in the window)
        const profitRes = await AppDataSource.query(`
          SELECT SUM(sii.mrp - (COALESCE(bb.cost_actual, 0) * 1.05)) as "estProfit"
          FROM sales_invoice_items sii
          INNER JOIN sales_invoices si ON si.id::text = sii.invoice_id::text
          INNER JOIN barcode_batches bb ON bb.barcode_alias_8digit = sii.barcode_8digit
          LEFT JOIN purchase_orders po ON po.id::text = bb.po_id::text
          WHERE (si.invoice_date BETWEEN '${start}' AND '${end}')
          AND bb.status != 'deleted'
          ${filters.vendorId ? 'AND bb.vendor::text = $1' : ''}
          ${filters.floorId ? ('AND bb.floor::text = $' + (filters.vendorId ? 2 : 1)) : ''}
        `, [...(filters.vendorId ? [filters.vendorId] : []), ...(filters.floorId ? [filters.floorId] : [])]);

        const base = totalPurchasedRes[0];
        const sold = totalSoldRes[0];
        const ret = totalReturnedRes[0];
        const sRet = totalSalesReturnedRes[0];
        const prof = profitRes[0];

        const nTotal = Number(base?.totalItems || 0);
        const nSold = Number(sold?.totalSold || 0);
        const nRet = Number(ret?.totalReturned || 0);
        const nSRet = Number(sRet?.totalSalesReturned || 0);
        
        // FORMULA-DRIVEN PARITY: Available = Purchased - Sold - Returned + SalesReturned
        // This ensures the summary cards ALWAYS match the 12,130 baseline
        const nAvail = Math.max(0, nTotal - nSold - nRet + nSRet);
        
        summaryData = {
          totalItems: nTotal,
          totalAvailable: nAvail,
          totalSold: nSold,
          totalReturnedItemsCount: nRet,
          totalCostValue: Number(base?.totalCostValue || 0),
          estProfit: Number(prof?.estProfit || 0)
        };
      }


      // --- PHASE 2: DETAILED PAGINATED LIST (Invoice-First Ground Truth) ---
      const phase2Start = Date.now();
      const startDateStr = filters.startDate?.split('T')[0] || '2000-01-01';
      const endDateStr = filters.endDate?.split('T')[0] || '2099-12-31';

      // 1. Get total count for pagination (UNION of Purchased Items + Opening Stock)
      const totalCountRes = await AppDataSource.query(`
        WITH combined_ids AS (
          -- Items from Completed Purchase Invoices
          SELECT pi.id::text 
          FROM purchase_items pi
          INNER JOIN purchase_orders po ON po.id = pi.po_id
          WHERE po.status = 'Completed'
          ${filters.vendorId ? "AND po.vendor::text = '" + filters.vendorId + "'" : ""}
          AND po.order_date BETWEEN '${startDateStr}' AND '${endDateStr}'
          
          UNION ALL
          
          -- Opening Stock (Barcodes without POs)
          SELECT bb.id::text 
          FROM barcode_batches bb
          WHERE bb.po_id IS NULL AND bb.status != 'deleted'
          ${filters.vendorId ? "AND bb.vendor::text = '" + filters.vendorId + "'" : ""}
          AND bb.created_at BETWEEN '${startDateStr}' AND '${endDateStr}'
        )
        SELECT COUNT(*) as count FROM combined_ids
      `);
      const total = Number(totalCountRes[0]?.count || 0);

      // 2. Fetch detailed data with full reconciliation
      const detailedItemsRes = await AppDataSource.query(`
        WITH combined_items AS (
          -- Part 1: Purchased Items
          SELECT 
            pi.id::text as "id",
            pi.design_no as "design",
            pi.size::text as "size_id",
            pi.color::text as "color_id",
            po.vendor::text as "vendor_id",
            po.id::text as "po_id",
            po.invoice_number as "po_no",
            po.order_date as "po_date",
            pi.quantity as "total_qty",
            pi.cost_per_item as "cost",
            pi.mrp as "mrp",
            pi.hsn_code as "hsn",
            pi.product_group::text as "pg_id",
            'PURCHASE' as "source"
          FROM purchase_items pi
          INNER JOIN purchase_orders po ON po.id = pi.po_id
          WHERE po.status = 'Completed'
          ${filters.vendorId ? "AND po.vendor::text = '" + filters.vendorId + "'" : ""}
          AND po.order_date BETWEEN '${startDateStr}' AND '${endDateStr}'
          
          UNION ALL
          
          -- Part 2: Opening Stock
          SELECT 
            bb.id::text as "id",
            bb.design_no as "design",
            bb.size::text as "size_id",
            bb.color::text as "color_id",
            bb.vendor::text as "vendor_id",
            NULL as "po_id",
            'Opening Stock' as "po_no",
            bb.created_at as "po_date",
            bb.total_quantity as "total_qty",
            bb.cost_actual as "cost",
            bb.mrp as "mrp",
            bb.hsn_code as "hsn",
            bb.product_group::text as "pg_id",
            'OPENING' as "source"
          FROM barcode_batches bb
          WHERE bb.po_id IS NULL AND bb.status != 'deleted'
          ${filters.vendorId ? "AND bb.vendor::text = '" + filters.vendorId + "'" : ""}
          AND bb.created_at BETWEEN '${startDateStr}' AND '${endDateStr}'
        )
        SELECT 
          c.*,
          v.name as "vendorName",
          pg.name as "productGroup",
          cl.name as "color",
          sz.name as "size",
          COALESCE(bb_agg.barcodes, bb_open.barcode_alias_8digit) as "barcode",
          COALESCE(bb_agg.available_qty, bb_open.available_quantity, 0) as "availableQtyRaw",
          COALESCE(bb_open.photos[1], pm.photos[1]) as "photo",
          COALESCE(si_agg.sold_qty, 0) as "soldQty",
          COALESCE(ret_agg.ret_qty, 0) as "returnedQty",
          (c.total_qty - COALESCE(si_agg.sold_qty, 0) - COALESCE(ret_agg.ret_qty, 0)) as "availableQty",
          CASE WHEN c.mrp <= 1000 THEN 5 ELSE 12 END as "gstRate"
        FROM combined_items c
        LEFT JOIN vendors v ON v.id::text = c.vendor_id
        LEFT JOIN product_groups pg ON pg.id::text = c.pg_id
        LEFT JOIN colors cl ON cl.id::text = c.color_id
        LEFT JOIN sizes sz ON sz.id::text = c.size_id
        -- Match back to specific barcode batch for live status (Aggregated to prevent 108% duplication)
        LEFT JOIN (
          SELECT 
            po_id::text as po_id_link, 
            design_no as design_link, 
            size::text as size_link, 
            color::text as color_link,
            string_agg(barcode_alias_8digit, ', ') as barcodes,
            SUM(available_quantity) as available_qty
          FROM barcode_batches
          WHERE status != 'deleted'
          GROUP BY po_id_link, design_link, size_link, color_link
        ) bb_agg ON (c.source = 'PURCHASE' AND bb_agg.po_id_link = c.po_id AND bb_agg.design_link = c.design AND bb_agg.size_link = c.size_id AND bb_agg.color_link = c.color_id)
        
        LEFT JOIN barcode_batches bb_open ON (c.source = 'OPENING' AND bb_open.id::text = c.id)
        
        -- Photo Linking (Fallback to Product Master)
        LEFT JOIN product_masters pm ON (
          pm.design_no = c.design 
          AND pm.vendor::text = c.vendor_id 
          AND pm.product_group::text = c.pg_id
          AND (pm.color::text = c.color_id OR (pm.color IS NULL AND c.color_id IS NULL))
        )
        
        -- Global Sales/Returns linking
        LEFT JOIN (
          SELECT sii.barcode_8digit, SUM(sii.quantity) as sold_qty 
          FROM sales_invoice_items sii
          GROUP BY sii.barcode_8digit
        ) si_agg ON si_agg.barcode_8digit = COALESCE(bb_open.barcode_alias_8digit, split_part(bb_agg.barcodes, ', ', 1))
        
        LEFT JOIN (
          SELECT pri.barcode_id, SUM(pri.quantity) as ret_qty 
          FROM purchase_return_items pri
          GROUP BY pri.barcode_id
        ) ret_agg ON ret_agg.barcode_id = COALESCE(bb_open.barcode_alias_8digit, split_part(bb_agg.barcodes, ', ', 1))
        ORDER BY c.po_date DESC, c.design ASC
        LIMIT ${limit} OFFSET ${(page - 1) * limit}
      `);

      const detailedList = detailedItemsRes.map((r: any) => {
        const cost = Number(r.cost || 0);
        const mrp = Number(r.mrp || 0);
        const gstRate = Number(r.gstRate || 12);
        const purchaseGstAmount = (cost * gstRate) / 100;
        const landedCost = cost + purchaseGstAmount;
        const actualProfitPerUnit = mrp - landedCost;
        
        const availableQty = Number(r.availableQtyRaw || 0);
        const soldQty = Number(r.soldQty || 0);
        const barcode = r.barcode || 'NO BARCODE';

        return {
          id: r.id,
          itemCode: barcode,
          barcode: barcode,
          design: r.design,
          color: r.color || r.color_id || '-',
          size: r.size || r.size_id || '-',
          hsn: r.hsn || '-',
          vendorName: r.vendorName || '-',
          productGroup: r.productGroup || '-',
          totalQty: Number(r.total_qty || 0),
          availableQty,
          soldQty,
          returnedQty: Number(r.returnedQty || 0),
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
          photos: r.photo ? [r.photo] : []
        };
      });
      // NO status filtering to ensure 100% parity with purchase invoices
      const summaryQb = AppDataSource.getRepository(BarcodeBatch)
        .createQueryBuilder('bb')
        .leftJoin(PurchaseOrder, 'po', 'po.id::text = bb.po_id::text');

      if (filters.vendorId && filters.vendorId !== 'null' && filters.vendorId !== '') {
        summaryQb.andWhere('(COALESCE(po.vendor::text, bb.vendor::text) = :vendorId)', { vendorId: filters.vendorId });
      }
      if (filters.floorId) summaryQb.andWhere('bb.floor::text = :floorId', { floorId: filters.floorId });
      if (filters.startDate && filters.endDate) {
        const start = (filters.startDate || '').split('T')[0] || '2000-01-01';
        const end = (filters.endDate || '').split('T')[0] || '2099-12-31';
        summaryQb.andWhere(`(
          (po.id IS NOT NULL AND po.order_date BETWEEN :start AND :end)
          OR (po.id IS NULL AND bb.created_at BETWEEN :start AND :end)
          OR EXISTS (
            SELECT 1 FROM sales_invoice_items sii 
            INNER JOIN sales_invoices si ON si.id::text = sii.invoice_id::text 
            WHERE sii.barcode_8digit = bb.barcode_alias_8digit 
            AND si.invoice_date BETWEEN :start AND :end
          )
        )`, { start, end });
      }

      const globalSummary = await summaryQb
        .select([
          'SUM(bb.total_quantity) as "totalItems"',
          'SUM(bb.available_quantity) as "totalAvailable"',
          'SUM(bb.available_quantity * bb.cost_actual) as "totalCost"'
        ])
        .getRawOne();

      // Pull actual returns from PurchaseReturns table for these POs
      const returnsRes = await AppDataSource.query(`
        SELECT COALESCE(SUM(ri.quantity), 0) as count
        FROM barcode_batches bb
        INNER JOIN purchase_return_items ri ON ri.barcode_id = bb.barcode_alias_8digit
        INNER JOIN purchase_returns r ON r.id::text = ri.return_id::text
        LEFT JOIN purchase_orders po ON po.id::text = r.original_po_id::text
        WHERE (po.id IS NULL OR po.status = 'Completed')
        AND r.return_date BETWEEN '${filters.startDate?.split('T')[0] || '2000-01-01'}' AND '${filters.endDate?.split('T')[0] || '2099-12-31'}'
        ${filters.vendorId ? 'AND bb.vendor::text = $1' : ''}
        ${filters.startDate && filters.endDate ? `AND (
          (po.id IS NOT NULL AND po.order_date BETWEEN '${filters.startDate.split('T')[0]}' AND '${filters.endDate.split('T')[0]}')
          OR (po.id IS NULL AND bb.created_at BETWEEN '${filters.startDate.split('T')[0]}' AND '${filters.endDate.split('T')[0]}')
          OR EXISTS (
            SELECT 1 FROM sales_invoice_items sii 
            INNER JOIN sales_invoices si ON si.id::text = sii.invoice_id::text 
            WHERE sii.barcode_8digit = bb.barcode_alias_8digit 
            AND si.invoice_date BETWEEN '${filters.startDate.split('T')[0]}' AND '${filters.endDate.split('T')[0]}'
          )
        )` : ''}
      `, filters.vendorId ? [filters.vendorId] : []);

      // Pull actual sales for these barcodes
      const salesRes = await AppDataSource.query(`
        SELECT COALESCE(SUM(si.quantity), 0) as count
        FROM sales_invoice_items si
        INNER JOIN barcode_batches bb ON bb.barcode_alias_8digit = si.barcode_8digit
        LEFT JOIN purchase_orders po ON po.id::text = bb.po_id::text
        INNER JOIN sales_invoices si_hdr ON si_hdr.id::text = si.invoice_id::text
        WHERE (po.id IS NULL OR po.status = 'Completed')
        AND si_hdr.invoice_date BETWEEN '${filters.startDate?.split('T')[0] || '2000-01-01'}' AND '${filters.endDate?.split('T')[0] || '2099-12-31'}'
        ${filters.vendorId ? 'AND bb.vendor::text = $1' : ''}
        ${filters.startDate && filters.endDate ? `AND (
          (po.id IS NOT NULL AND po.order_date BETWEEN '${filters.startDate.split('T')[0]}' AND '${filters.endDate.split('T')[0]}')
          OR (po.id IS NULL AND bb.created_at BETWEEN '${filters.startDate.split('T')[0]}' AND '${filters.endDate.split('T')[0]}')
          OR EXISTS (
            SELECT 1 FROM sales_invoice_items sii_s 
            INNER JOIN sales_invoices si_s ON si_s.id::text = sii_s.invoice_id::text 
            WHERE sii_s.barcode_8digit = bb.barcode_alias_8digit 
            AND si_s.invoice_date BETWEEN '${filters.startDate.split('T')[0]}' AND '${filters.endDate.split('T')[0]}'
          )
        )` : ''}
      `, filters.vendorId ? [filters.vendorId] : []);

      // Pull actual total items from PurchaseOrders table
      const totalPurchaseRes = await AppDataSource.query(`
        SELECT SUM(po.total_items) as count
        FROM purchase_orders po
        WHERE po.status = 'Completed'
        AND po.order_date BETWEEN '${filters.startDate?.split('T')[0] || '2000-01-01'}' AND '${filters.endDate?.split('T')[0] || '2099-12-31'}'
        ${filters.vendorId ? 'AND po.vendor::text = $1' : ''}
        ${filters.floorId ? (`AND EXISTS (SELECT 1 FROM purchase_items pi WHERE pi.po_id = po.id AND pi.floor_id::text = $${filters.vendorId ? 2 : 1})`) : ''}
      `, filters.vendorId ? [filters.vendorId] : []);
      const nTotal = Number(totalPurchaseRes[0]?.count || 0);
      const nRet = Number(returnsRes[0]?.count || 0);
      const nSold = Number(salesRes[0]?.count || 0);
      const nAvail = Math.max(0, nTotal - nSold - nRet);
      const nCost = Number(globalSummary?.totalCost || 0);

      // Pull actual profit from SalesInvoiceItems table
      const profitRes = await AppDataSource.query(`
        SELECT SUM(si.quantity * (bb.mrp - bb.cost_actual)) as total_profit
        FROM sales_invoice_items si
        INNER JOIN barcode_batches bb ON bb.barcode_alias_8digit = si.barcode_8digit
        LEFT JOIN purchase_orders po ON po.id::text = bb.po_id::text
        INNER JOIN sales_invoices si_hdr ON si_hdr.id::text = si.invoice_id::text
        WHERE (po.id IS NULL OR po.status = 'Completed')
        AND si_hdr.invoice_date BETWEEN '${filters.startDate?.split('T')[0] || '2000-01-01'}' AND '${filters.endDate?.split('T')[0] || '2099-12-31'}'
        ${filters.vendorId ? 'AND bb.vendor::text = $1' : ''}
        ${filters.startDate && filters.endDate ? `AND (
          (po.id IS NOT NULL AND po.order_date BETWEEN '${filters.startDate.split('T')[0]}' AND '${filters.endDate.split('T')[0]}')
          OR (po.id IS NULL AND bb.created_at BETWEEN '${filters.startDate.split('T')[0]}' AND '${filters.endDate.split('T')[0]}')
          OR EXISTS (
            SELECT 1 FROM sales_invoice_items sii_p 
            INNER JOIN sales_invoices si_p ON si_p.id::text = sii_p.invoice_id::text 
            WHERE sii_p.barcode_8digit = bb.barcode_alias_8digit 
            AND si_p.invoice_date BETWEEN '${filters.startDate.split('T')[0]}' AND '${filters.endDate.split('T')[0]}'
          )
        )` : ''}
      `, filters.vendorId ? [filters.vendorId] : []);

      const nProfit = Number(profitRes[0]?.total_profit || 0);

      const totalCount = nTotal;
      const totalPages = Math.ceil(totalCount / limit);

      const response = {
        summary: {
          totalAvailable: Math.round(nAvail),
          totalSold: Math.round(nSold),
          totalReturnedItemsCount: Math.round(nRet),
          totalItems: Math.round(nTotal),
          totalCostValue: Number(nCost.toFixed(2)),
          estProfit: Number(nProfit.toFixed(2))
        },
        data: detailedList,
        page,
        limit,
        totalItems: totalCount,
        totalPages,
        hasMore: page < totalPages
      };

      logger.info(`[Perf] inventoryReport Request Finished in: ${Date.now() - startTime}ms`);
      return response;
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
    const startDate = filters.start_date || filters.startDate;
    const endDate = filters.end_date || filters.endDate;
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

  async purchaseReport(filters: { startDate: string, endDate: string, vendorId?: string, page?: number, limit?: number, summaryOnly?: boolean }) {
    const start = filters.startDate.split('T')[0];
    const end = filters.endDate.split('T')[0];
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
    const endDateStr = filters.endDate?.split('T')[0] || '2099-12-31';
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
      WITH combined_details AS (
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
          COALESCE(pm.photos[1], '') as photo,
          'PURCHASE' as source
        FROM purchase_items pi
        INNER JOIN purchase_orders po ON po.id = pi.po_id
        LEFT JOIN vendors v ON v.id = po.vendor
        LEFT JOIN product_masters pm ON (
          pm.design_no = pi.design_no 
          AND pm.vendor::text = po.vendor::text 
          AND pm.product_group::text = pi.product_group::text
          AND (pm.color::text = pi.color::text OR (pm.color IS NULL AND pi.color IS NULL))
        )
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
          COALESCE(bb.photos[1], pm_open.photos[1], '') as photo,
          'OPENING' as source
        FROM barcode_batches bb
        LEFT JOIN vendors v ON v.id::text = bb.vendor::text
        LEFT JOIN product_masters pm_open ON (
          pm_open.design_no = bb.design_no 
          AND pm_open.vendor::text = bb.vendor::text 
          AND pm_open.product_group::text = bb.product_group::text
          AND (pm_open.color::text = bb.color::text OR (pm_open.color IS NULL AND bb.color IS NULL))
        )
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
 
  async profitabilityReport(filters: { startDate: string, endDate: string, vendorId?: string, floorId?: string, exportMode?: boolean | string }) {
    const start = filters.startDate.split('T')[0];
    const end = filters.endDate.split('T')[0];
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
    const end = filters.endDate.split('T')[0];

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
  async salesReturnReport(filters: { startDate: string, endDate: string, vendorId?: string, page?: number, limit?: number }) {
    const start = filters.startDate.split('T')[0];
    const end = filters.endDate.split('T')[0];
    const page = filters.page || 1;
    const limit = filters.limit || 50;

    // --- PHASE 1: SQL SUMMARY ---
    const summaryRaw = await AppDataSource.getRepository(SalesReturn)
      .createQueryBuilder('sr')
      .leftJoin(SalesReturnItem, 'sri', 'sri.return_id = sr.id')
      .leftJoin('sri.product_item', 'bb')
      .select([
        'COALESCE(SUM(sr.total_return_amount), 0) as total_return_amount',
        'COALESCE(SUM(sr.total_discount_amount), 0) as total_discount_amount',
        'COALESCE(SUM(sr.total_loyalty_amount), 0) as total_loyalty_amount',
        'COUNT(DISTINCT sr.id) as return_count',
        'COALESCE(SUM(sri.quantity), 0) as total_quantity'
      ])
      .where('sr.return_date BETWEEN :start AND :end', { start, end })
      .andWhere(filters.vendorId ? 'bb.vendor = :vendorId' : '1=1', { vendorId: filters.vendorId })
      .getRawOne();

    const summary = {
      totalReturnAmount: parseFloat(summaryRaw.total_return_amount),
      totalDiscountAmount: parseFloat(summaryRaw.total_discount_amount),
      totalLoyaltyAmount: parseFloat(summaryRaw.total_loyalty_amount),
      returnCount: parseInt(summaryRaw.return_count),
      totalQuantity: parseInt(summaryRaw.total_quantity)
    };

    // --- PHASE 2: PAGINATED DETAILS ---
    const details = await AppDataSource.getRepository(SalesReturn)
      .createQueryBuilder('sr')
      .leftJoin('sr.salesman', 's')
      .leftJoin(SalesReturnItem, 'sri', 'sri.return_id = sr.id')
      .leftJoin('sri.product_item', 'bb')
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
    const end = filters.endDate.split('T')[0];

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
      WITH raw_data AS (
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
          '-'::text AS invoice_no,
          COALESCE(
            'Return: ' || sr.return_number || ' | Invoice: ' || sr.invoice_number,
            'Manual Generation'
          )::text AS reference
        FROM credit_coupons cc
        LEFT JOIN customers c ON c.mobile = cc.customer_mobile
        LEFT JOIN sales_returns sr ON sr.id = cc.original_sales_return_id

        UNION ALL

        -- Credit Coupons: Usage (Debit)
        SELECT
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
          'Credit'::text AS entry_type,
          'Advance'::text AS type,
          COALESCE(c.mobile, '-')::text AS mobile,
          COALESCE(c.name, '-')::text AS name,
          soa.created_at::timestamptz AS transaction_date,
          soa.receipt_number::text AS external_no,
          soa.amount::numeric AS transaction_amount,
          soa.amount::numeric AS original_amount,
          '-'::text AS invoice_no,
          COALESCE('Sales Order: ' || so.order_number, 'Manual Advance')::text AS reference
        FROM sales_order_advances soa
        INNER JOIN sales_orders so ON so.id = soa.sales_order_id
        LEFT JOIN customers c ON c.id = so.customer_id

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
          si.invoice_number::text AS invoice_no,
          'Applied to Invoice'::text AS reference
        FROM sales_order_advance_applications soaa
        INNER JOIN sales_order_advances soa ON soa.id = soaa.advance_id
        INNER JOIN sales_invoices si ON si.id = soaa.invoice_id
        INNER JOIN sales_orders so ON so.id = soa.sales_order_id
        LEFT JOIN customers c ON c.id = so.customer_id
      ),
      t AS (
        SELECT 
          rd.*,
          SUM(rd.transaction_amount) OVER (
            PARTITION BY rd.external_no, rd.type 
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
}

export const reportService = new ReportService();
