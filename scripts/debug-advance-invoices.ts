import { AppDataSource } from '../src/config/data-source';

async function main() {
  await AppDataSource.initialize();
  const rows = await AppDataSource.query(
    `
      SELECT
        id,
        invoice_number,
        invoice_date,
        payment_mode,
        payment_details
      FROM sales_invoices
      WHERE (payment_mode ILIKE '%advance%')
         OR (payment_details::text ILIKE '%advance%')
         OR (payment_details::text ILIKE '%order%advance%')
      ORDER BY created_at DESC
      LIMIT 10
    `
  );

  console.log(JSON.stringify(rows, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

