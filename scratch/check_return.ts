import { AppDataSource } from './src/config/data-source';
import { SalesReturn } from './src/entities/SalesReturn';
import { SalesReturnItem } from './src/entities/SalesReturnItem';
import { SalesInvoice } from './src/entities/SalesInvoice';

async function check() {
    await AppDataSource.initialize();
    const ret = await AppDataSource.getRepository(SalesReturn).findOne({
        where: { return_number: 'SRET2627000046' },
        relations: ['items']
    });
    console.log('Return SRET2627000046:', JSON.stringify(ret, null, 2));

    if (ret) {
        const inv = await AppDataSource.getRepository(SalesInvoice).findOne({
            where: { invoice_number: ret.invoice_number },
            relations: ['items']
        });
        console.log('Invoice:', JSON.stringify(inv, null, 2));
    }
    await AppDataSource.destroy();
}

check();
