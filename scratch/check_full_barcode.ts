import { AppDataSource } from '../src/config/data-source';
import { BarcodeBatch } from '../src/entities/BarcodeBatch';
import { In } from 'typeorm';

async function checkFullBarcode() {
    await AppDataSource.initialize();
    const repo = AppDataSource.getRepository(BarcodeBatch);
    const codes = ['00001617', '00001618', '00006594'];
    const results = await repo.find({ where: { barcode_alias_8digit: In(codes) } });
    console.log(JSON.stringify(results, null, 2));
    await AppDataSource.destroy();
}

checkFullBarcode().catch(console.error);
