import { AppDataSource } from '../src/config/data-source';
import { SalesInvoice } from '../src/entities/SalesInvoice';
import { SalesInvoiceItem } from '../src/entities/SalesInvoiceItem';
import { SalesReturn } from '../src/entities/SalesReturn';

async function inspectInvoice() {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const invNum = 'INV2627000535';
    const invoice = await AppDataSource.getRepository(SalesInvoice).findOne({
      where: { invoice_number: invNum },
      relations: ['items', 'customer']
    });

    if (!invoice) {
      console.log('Invoice not found');
      return;
    }

    const returns = await AppDataSource.getRepository(SalesReturn).find({
      where: [
        { invoice_id: invoice.id },
        { invoice_number: invNum }
      ],
      relations: ['items']
    });

    console.log('INVOICE DATA:');
    console.log(JSON.stringify({
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      net_payable: invoice.net_payable,
      amount_paid: invoice.amount_paid,
      amount_pending: invoice.amount_pending,
      total_mrp: invoice.total_mrp,
      total_discount: invoice.total_discount,
      additional_charges_total: invoice.additional_charges_total
    }, null, 2));

    console.log('\nITEMS:');
    console.log(JSON.stringify(invoice.items.map(i => ({
      product_description: i.product_description,
      quantity: i.quantity,
      mrp: i.mrp,
      discount: i.discount,
      total_value: i.total_value,
      on_approval: i.on_approval
    })), null, 2));

    console.log('\nRETURNS:');
    console.log(JSON.stringify(returns.map(r => ({
      return_number: r.return_number,
      total_return_amount: r.total_return_amount,
      items: r.items.map(ri => ({
        product_description: ri.product_description,
        quantity: ri.quantity,
        return_amount: ri.return_amount
      }))
    })), null, 2));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await AppDataSource.destroy();
  }
}

inspectInvoice();
