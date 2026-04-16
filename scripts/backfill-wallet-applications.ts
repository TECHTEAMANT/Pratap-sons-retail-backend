import { AppDataSource } from '../src/config/data-source';
import { CreditCoupon } from '../src/entities/CreditCoupon';
import { CreditCouponApplication } from '../src/entities/CreditCouponApplication';
import { Customer } from '../src/entities/Customer';
import { SalesInvoice } from '../src/entities/SalesInvoice';
import { SalesOrderAdvance } from '../src/entities/SalesOrderAdvance';
import { SalesOrderAdvanceApplication } from '../src/entities/SalesOrderAdvanceApplication';

function normalizeMode(mode: unknown) {
  return String(mode || '').trim().toLowerCase();
}

async function backfill() {
  await AppDataSource.initialize();
  await AppDataSource.synchronize();

  const invoiceRepo = AppDataSource.getRepository(SalesInvoice);
  const invoices = await invoiceRepo.createQueryBuilder('si')
    .select(['si.id', 'si.customer_mobile', 'si.payment_details', 'si.coupon_no', 'si.coupon_amount'])
    .where(`(si.payment_details IS NOT NULL) OR (si.coupon_no IS NOT NULL)`)
    .orderBy('si.created_at', 'DESC')
    .limit(5000)
    .getMany();

  console.log(`Found ${invoices.length} invoices to scan (latest first)`);

  let appliedCoupons = 0;
  let appliedAdvances = 0;
  let skipped = 0;

  for (const inv of invoices) {
    await AppDataSource.transaction(async (manager) => {
      const couponRepo = manager.getRepository(CreditCoupon);
      const couponAppRepo = manager.getRepository(CreditCouponApplication);
      const advRepo = manager.getRepository(SalesOrderAdvance);
      const advAppRepo = manager.getRepository(SalesOrderAdvanceApplication);
      const customerRepo = manager.getRepository(Customer);

      const detailsArray: any[] = Array.isArray(inv.payment_details) ? inv.payment_details : [];

      for (const pm of detailsArray) {
        const mode = normalizeMode(pm?.mode);
        const referenceRaw = pm?.reference || pm?.coupon_no || pm?.receipt_number || pm?.external_no;
        const reference = String(referenceRaw || '').trim();
        const amount = Number(pm?.amount || 0);
        if (amount <= 0) continue;

        if ((mode === 'credit coupon' || mode.includes('coupon')) && reference) {
          const coupon = await couponRepo.findOne({ where: { coupon_no: String(reference) } });
          if (!coupon) continue;

          const existing = await couponAppRepo.findOne({ where: { coupon_id: coupon.id, invoice_id: inv.id } });
          if (existing) continue;

          const [{ used }] = await manager.query(
            `SELECT COALESCE(SUM(amount_applied)::numeric, 0) as used FROM credit_coupon_applications WHERE coupon_id = $1`,
            [coupon.id]
          );
          const remaining = Math.max(0, Number(coupon.amount) - Number(used || 0));
          const applyAmt = Math.min(amount, remaining);
          if (applyAmt <= 0) return;

          await couponAppRepo.save(couponAppRepo.create({
            coupon_id: coupon.id,
            invoice_id: inv.id,
            amount_applied: applyAmt
          }));

          const newRemaining = remaining - applyAmt;
          coupon.status = newRemaining <= 0 ? 'redeemed' : 'active';
          coupon.updated_at = new Date();
          await couponRepo.save(coupon);

          appliedCoupons += 1;
        }

        if (mode === 'order advance' || mode === 'advance' || mode.includes('advance')) {
          let adv: SalesOrderAdvance | null = null;

          if (reference) {
            adv = await advRepo.findOne({ where: { receipt_number: String(reference) } });
          }

          if (!adv) {
            const candidates: { id: string }[] = await manager.query(
              `
                SELECT soa.id
                FROM sales_order_advances soa
                INNER JOIN sales_orders so ON so.id = soa.sales_order_id
                LEFT JOIN (
                  SELECT advance_id, COALESCE(SUM(amount_applied)::numeric, 0) AS used_amount
                  FROM sales_order_advance_applications
                  GROUP BY advance_id
                ) used ON used.advance_id = soa.id
                WHERE so.order_number = $1
                  AND (soa.amount::numeric - COALESCE(used.used_amount, 0)) > 0
                ORDER BY soa.created_at ASC
                LIMIT 1
              `,
              [reference]
            );
            if (candidates.length > 0) {
              adv = await advRepo.findOne({ where: { id: candidates[0].id } });
            }
          }

          if (!adv && !reference) {
            const customer = inv.customer_mobile
              ? await customerRepo.findOne({ where: { mobile: String(inv.customer_mobile).trim() } })
              : null;
            if (customer) {
              const candidates: { id: string; receipt_number: string | null; remaining_amount: any }[] = await manager.query(
                `
                  SELECT
                    soa.id,
                    soa.receipt_number,
                    (soa.amount::numeric - COALESCE(used.used_amount, 0))::numeric AS remaining_amount
                  FROM sales_order_advances soa
                  INNER JOIN sales_orders so ON so.id = soa.sales_order_id
                  LEFT JOIN (
                    SELECT advance_id, COALESCE(SUM(amount_applied)::numeric, 0) AS used_amount
                    FROM sales_order_advance_applications
                    GROUP BY advance_id
                  ) used ON used.advance_id = soa.id
                  WHERE so.customer_id = $1
                    AND (soa.amount::numeric - COALESCE(used.used_amount, 0)) > 0
                  ORDER BY soa.created_at ASC
                `,
                [customer.id]
              );

              let remainingToApply = amount;
              for (const c of candidates) {
                if (remainingToApply <= 0) break;
                const applyAmt = Math.min(Number(c.remaining_amount || 0), remainingToApply);
                if (applyAmt <= 0) continue;

                const existing = await advAppRepo.findOne({ where: { advance_id: c.id, invoice_id: inv.id } });
                if (existing) continue;

                await advAppRepo.save(advAppRepo.create({
                  advance_id: c.id,
                  invoice_id: inv.id,
                  amount_applied: applyAmt
                }));

                remainingToApply -= applyAmt;
                appliedAdvances += 1;
              }
            }

            continue;
          }

          if (!adv) continue;

          const existing = await advAppRepo.findOne({ where: { advance_id: adv.id, invoice_id: inv.id } });
          if (existing) continue;

          const [{ used }] = await manager.query(
            `SELECT COALESCE(SUM(amount_applied)::numeric, 0) as used FROM sales_order_advance_applications WHERE advance_id = $1`,
            [adv.id]
          );
          const remaining = Math.max(0, Number(adv.amount) - Number(used || 0));
          const applyAmt = Math.min(amount, remaining);
          if (applyAmt <= 0) return;

          await advAppRepo.save(advAppRepo.create({
            advance_id: adv.id,
            invoice_id: inv.id,
            amount_applied: applyAmt
          }));

          const newRemaining = remaining - applyAmt;
          adv.status = newRemaining <= 0 ? 'redeemed' : 'active';
          adv.redeemed_invoice_id = newRemaining <= 0 ? inv.id : null;
          await advRepo.save(adv);

          appliedAdvances += 1;
        }
      }

      if (inv.coupon_no && Number(inv.coupon_amount || 0) > 0) {
        const coupon = await couponRepo.findOne({ where: { coupon_no: String(inv.coupon_no) } });
        if (coupon) {
          const existing = await couponAppRepo.findOne({ where: { coupon_id: coupon.id, invoice_id: inv.id } });
          if (!existing) {
            const [{ used }] = await manager.query(
              `SELECT COALESCE(SUM(amount_applied)::numeric, 0) as used FROM credit_coupon_applications WHERE coupon_id = $1`,
              [coupon.id]
            );
            const remaining = Math.max(0, Number(coupon.amount) - Number(used || 0));
            const applyAmt = Math.min(Number(inv.coupon_amount || 0), remaining);
            if (applyAmt > 0) {
              await couponAppRepo.save(couponAppRepo.create({
                coupon_id: coupon.id,
                invoice_id: inv.id,
                amount_applied: applyAmt
              }));
              const newRemaining = remaining - applyAmt;
              coupon.status = newRemaining <= 0 ? 'redeemed' : 'active';
              coupon.updated_at = new Date();
              await couponRepo.save(coupon);
              appliedCoupons += 1;
            }
          }
        }
      }
    }).catch(() => {
      skipped += 1;
    });
  }

  console.log(`Backfill complete`);
  console.log(`Applied coupon links: ${appliedCoupons}`);
  console.log(`Applied advance links: ${appliedAdvances}`);
  console.log(`Skipped invoices (errors): ${skipped}`);
}

backfill()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
