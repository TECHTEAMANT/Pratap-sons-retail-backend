import { AppDataSource } from '../config/data-source';
import { Customer } from '../entities/Customer';

export class WalletService {
  /**
   * Get all available credits (wallet) for a customer
   */
  async getWallet(mobile: string) {
    // 1. Get the customer
    const customer = await AppDataSource.getRepository(Customer).findOne({ where: { mobile } });
    if (!customer) return { totalBalance: 0, coupons: [], advances: [], credit_balance: 0 };

    const couponRows = await AppDataSource.query(
      `
        SELECT
          cc.id,
          cc.coupon_no,
          cc.customer_mobile,
          cc.created_at,
          cc.amount::numeric AS original_amount,
          GREATEST(
            0,
            cc.amount::numeric - COALESCE(SUM(cca.amount_applied::numeric), 0)
          ) AS remaining_amount
        FROM credit_coupons cc
        LEFT JOIN credit_coupon_applications cca
          ON cca.coupon_id = cc.id
        WHERE cc.customer_mobile = $1
        GROUP BY cc.id, cc.coupon_no, cc.customer_mobile, cc.created_at
        HAVING (cc.amount::numeric - COALESCE(SUM(cca.amount_applied::numeric), 0)) > 0
        ORDER BY cc.created_at DESC
      `,
      [mobile]
    );

    const advanceRows = await AppDataSource.query(
      `
        SELECT
          soa.id,
          soa.receipt_number,
          soa.created_at,
          so.order_number,
          soa.amount::numeric AS original_amount,
          GREATEST(
            0,
            soa.amount::numeric - COALESCE(SUM(soaa.amount_applied::numeric), 0)
          ) AS remaining_amount
        FROM sales_order_advances soa
        INNER JOIN sales_orders so
          ON so.id = soa.sales_order_id
        LEFT JOIN sales_order_advance_applications soaa
          ON soaa.advance_id = soa.id
        WHERE so.customer_id = $1
        GROUP BY soa.id, soa.receipt_number, soa.created_at, so.order_number
        HAVING (soa.amount::numeric - COALESCE(SUM(soaa.amount_applied::numeric), 0)) > 0
        ORDER BY soa.created_at DESC
      `,
      [customer.id]
    );

    // 4. Calculate total balance
    const couponTotal = couponRows.reduce((sum: number, c: any) => sum + Number(c.remaining_amount), 0);
    const advanceTotal = advanceRows.reduce((sum: number, a: any) => sum + Number(a.remaining_amount), 0);
    
    // Note: Customer.credit_balance is also updated in SalesReturnService, 
    // but it seems to track the same value as CreditNotes. 
    // We will return it for information but use coupons/advances for spending.
    const credit_balance = Number(customer.credit_balance || 0);

    return {
      mobile: customer.mobile,
      name: customer.name,
      credit_balance,
      couponTotal,
      advanceTotal,
      totalBalance: couponTotal + advanceTotal,
      coupons: couponRows.map((c: any) => ({
        id: c.id,
        coupon_no: c.coupon_no,
        amount: Number(c.remaining_amount),
        created_at: c.created_at,
        type: 'Credit Coupon'
      })),
      advances: advanceRows.map((a: any) => ({
        id: a.id,
        receipt_number: a.receipt_number,
        amount: Number(a.remaining_amount),
        order_number: a.order_number,
        created_at: a.created_at,
        type: 'Order Advance'
      }))
    };
  }
}

export const walletService = new WalletService();
