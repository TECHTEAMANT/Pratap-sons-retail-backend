
import { AppDataSource } from '../src/config/data-source';
import { SalesInvoice } from '../src/entities/SalesInvoice';
import { SalesInvoiceItem } from '../src/entities/SalesInvoiceItem';
import { PaymentReceiptItem } from '../src/entities/PaymentReceiptItem';

async function globalReconciliation() {
    try {
        await AppDataSource.initialize();
        console.log("Database initialized for global reconciliation");

        const invoices = await AppDataSource.getRepository(SalesInvoice).find({
            relations: ['items', 'sales_returns']
        });

        console.log(`Analyzing ${invoices.length} invoices...`);
        let fixCount = 0;

        for (const inv of invoices) {
            // 1. Recalculate true Net (without doubling discounts)
            // (Sum of items is the truth)
            const itemSum = inv.items.reduce((s, i) => s + (Number(i.mrp) - Number(i.discount)) * (Number(i.quantity) || 1), 0);
            const returnsSum = (inv.sales_returns || []).reduce((s, r) => s + (Number(r.total_return_amount) || 0), 0);
            
            const trueNet = Math.max(0, Math.round(itemSum - returnsSum + Number(inv.additional_charges_total || 0)));
            
            // 2. Recalculate true Pending
            // Pending = Net - Paid
            const truePending = Math.max(0, trueNet - Number(inv.amount_paid));

            // 3. If there is a meaningful discrepancy, fix it
            if (Math.abs(Number(inv.net_payable) - trueNet) > 1 || Math.abs(Number(inv.amount_pending) - truePending) > 1) {
                console.log(`Fixing ${inv.invoice_number}: Net ${inv.net_payable}->${trueNet}, Pend ${inv.amount_pending}->${truePending}`);
                
                inv.net_payable = trueNet;
                inv.amount_pending = truePending;
                
                if (truePending <= 0.05) {
                    inv.payment_status = trueNet <= 0.05 ? 'returned' : 'paid';
                } else if (Number(inv.amount_paid) > 0.1) {
                    inv.payment_status = 'partial';
                } else {
                    inv.payment_status = 'pending';
                }
                
                await AppDataSource.getRepository(SalesInvoice).save(inv);
                fixCount++;
            }
        }

        console.log(`Reconciliation complete. Fixed ${fixCount} records.`);
        await AppDataSource.destroy();
    } catch (err) {
        console.error("Reconciliation failed:", err);
    }
}

globalReconciliation();
