/**
 * backfillCardNo.ts
 * Run once to assign loyalty card numbers to all existing customers who don't have one.
 * Usage: npx ts-node src/scripts/backfillCardNo.ts
 */

import 'reflect-metadata';
import { AppDataSource } from '../config/data-source';
import { Customer } from '../entities/Customer';

async function run() {
  await AppDataSource.initialize();
  const repo = AppDataSource.getRepository(Customer);

  const customers = await repo.find({ where: { card_no: null as any } });
  console.log(`Found ${customers.length} customers without card numbers.`);

  let count = 0;
  for (const customer of customers) {
    let card_no: string;
    do {
      const num = Math.floor(1000000000 + Math.random() * 9000000000);
      card_no = `PSH${num}`;
    } while (await repo.findOneBy({ card_no }));

    customer.card_no = card_no;
    await repo.save(customer);
    count++;
    console.log(`[${count}/${customers.length}] ${customer.mobile} → ${card_no}`);
  }

  console.log(`✅ Done. Assigned card numbers to ${count} customers.`);
  await AppDataSource.destroy();
}

run().catch((err) => { console.error(err); process.exit(1); });
