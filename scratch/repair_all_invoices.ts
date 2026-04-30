import { AppDataSource } from '../src/config/data-source';
import { SalesInvoice } from '../src/entities/SalesInvoice';
import { SalesReturn } from '../src/entities/SalesReturn';

async function repairHistoricalData() {
  await AppDataSource.initialize();
  console.log('Database initialized. Starting global audit...');

  const invoiceRepo = AppDataSource.getRepository(SalesInvoice);
  
  // 1. Find ALL invoices
  const allInvoices = await invoiceRepo.find({
    relations: [
      'items', 
      'receipt_items', 
      'receipt_items.receipt', 
      'sales_returns', 
      'coupon_applications', 
      'advance_applications', 
      'credit_note_applications'
    ]
  });

  console.log(`Auditing ${allInvoices.length} invoices...`);
  let fixCount = 0;

  for (const inv of allInvoices) {
    // --- Ground Truth Reconstruction ---
    const itemDisc = Number(inv.total_discount || 0);
    const headerDiscounts = Number(inv.special_discount || 0) + 
                           Number(inv.loyalty_redemption_amount || 0) + 
                           Number(inv.voucher_discount || 0);
    
    const finalDiscount = (itemDisc > 0.1) ? itemDisc : headerDiscounts;
    const returnsAmt = (inv.sales_returns || []).reduce((s: number, r: any) => s + (Number(r.total_return_amount) || 0), 0);
    
    const calculatedNet = Number(inv.total_mrp || 0) - finalDiscount + (parseFloat(inv.additional_charges_total as any) || 0) - returnsAmt;
    const finalNet = Math.round(calculatedNet);

    // Paid reconstruction (EXCLUDING APPROVAL)
    let paymentDetails = inv.payment_details;
    if (typeof paymentDetails === 'string') {
      try { paymentDetails = JSON.parse(paymentDetails); } catch (e) { paymentDetails = null; }
    }

    let directPaid = 0;
    if (paymentDetails) {
      if (Array.isArray(paymentDetails)) {
        directPaid = paymentDetails.reduce((sum, pd) => {
          const mode = (pd.mode || '').toString().toUpperCase();
          if (mode.includes('APPROVAL')) return sum;
          return sum + (parseFloat(pd.amount) || 0);
        }, 0);
      } else if (typeof paymentDetails === 'object') {
        const techKeys = ['TOTAL_MRP', 'NET_PAYABLE', 'ITEMS', 'ID', 'TOTAL_AMOUNT', 'ROUND_OFF', 'AMOUNT_PAID', 'AMOUNT_PENDING', 'SPECIAL_DISCOUNT', 'VOUCHER_DISCOUNT', 'LOYALTY_REDEMPTION_AMOUNT', 'TOTAL_GST', 'TAXABLE_VALUE'];
        directPaid = Object.entries(paymentDetails).reduce((sum, [key, val]) => {
          const k = key.toUpperCase();
          if (techKeys.includes(k) || k.includes('APPROVAL')) return sum;
          return sum + (parseFloat(val as any) || 0);
        }, 0);
      }
    }

    const receiptPaid = (inv.receipt_items || []).reduce((sum, ri) => {
      const k = (ri.receipt?.payment_mode || '').toString().toUpperCase();
      if (k.includes('APPROVAL')) return sum;
      return sum + (parseFloat(ri.amount_paid as any) || 0);
    }, 0);

    const externalPaid = receiptPaid + 
                        (inv.coupon_applications || []).reduce((s, a) => s + (parseFloat(a.amount_applied as any) || 0), 0) + 
                        (inv.advance_applications || []).reduce((s, a) => s + (parseFloat(a.amount_applied as any) || 0), 0) + 
                        (inv.credit_note_applications || []).reduce((s, a) => s + (parseFloat(a.amount_applied as any) || 0), 0);

    const finalRealPaid = directPaid + externalPaid;
    const adjustedPending = Math.max(0, finalNet - finalRealPaid);
    
    const dbPending = parseFloat(inv.amount_pending as any) || 0;
    const dbNet = parseFloat(inv.net_payable as any) || 0;
    const dbStatus = inv.payment_status;

    const correctStatus = adjustedPending <= 1 ? 'paid' : (finalRealPaid > 0 ? 'partial' : 'pending');

    if (Math.abs(dbPending - adjustedPending) > 1 || Math.abs(dbNet - finalNet) > 1 || dbStatus !== correctStatus) {
      console.log(`Repairing Invoice ${inv.invoice_number}: DB Pending ${dbPending} -> Real ${adjustedPending}, Status ${dbStatus} -> ${correctStatus}`);
      await invoiceRepo.update(inv.id, {
        net_payable: finalNet,
        amount_paid: finalRealPaid,
        amount_pending: adjustedPending,
        payment_status: correctStatus
      });
      fixCount++;
    }
  }

  console.log(`Audit complete. Total fixes applied: ${fixCount}`);
  process.exit(0);
}

repairHistoricalData().catch(e => {
  console.error(e);
  process.exit(1);
});
