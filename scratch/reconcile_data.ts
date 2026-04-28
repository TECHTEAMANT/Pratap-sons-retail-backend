
import { AppDataSource } from '../src/config/data-source';
import { SalesInvoice } from '../src/entities/SalesInvoice';

async function fixInvoices() {
    try {
        await AppDataSource.initialize();
        console.log("Database initialized");

        const repo = AppDataSource.getRepository(SalesInvoice);
        
        // Fix INV2627000535
        const inv = await repo.findOne({ where: { invoice_number: 'INV2627000535' } });
        if (inv) {
            console.log(`Found ${inv.invoice_number}. Net: ${inv.net_payable}, Paid: ${inv.amount_paid}, Pending: ${inv.amount_pending}`);
            inv.amount_pending = Number(inv.net_payable) - Number(inv.amount_paid);
            inv.payment_status = 'pending';
            await repo.save(inv);
            console.log("Updated INV2627000535");
        }

        // Clean up common double-discount issues in Header (if special discount was added to total discount)
        // This is safer to do selectively or via the report logic fix I already did.

        await AppDataSource.destroy();
    } catch (err) {
        console.error(err);
    }
}

fixInvoices();
