import { AppDataSource } from '../config/data-source';
import { SalesInvoice } from '../entities/SalesInvoice';
import { SalesInvoiceItem } from '../entities/SalesInvoiceItem';
import { BarcodeBatch } from '../entities/BarcodeBatch';
import { Customer } from '../entities/Customer';
import { EBooking } from '../entities/EBooking';
import { Voucher } from '../entities/Voucher';
import { voucherService } from './voucher.service';
import { ILike } from 'typeorm';
import { LoyaltyConfig, LoyaltyHistory, LoyaltyTransactionType } from './../entities';
import { creditCouponService } from './creditCoupon.service';
import logger from '../utils/logger';

export class SalesService {
  private invoiceRepo = AppDataSource.getRepository(SalesInvoice);

  async getInvoices(filters: { 
    start_date?: string; 
    end_date?: string; 
    search?: string; 
    payment_status?: string; 
    page?: number; 
    limit?: number; 
    gte_invoice_date?: string; 
    lte_invoice_date?: string;
    gt_amount_pending?: string | number;
    lte_amount_pending?: string | number;
    customer_mobile?: string;
    customer_name?: string;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    const qb = this.invoiceRepo.createQueryBuilder('si');

    if (filters.start_date || filters.gte_invoice_date) qb.andWhere('DATE(si.invoice_date) >= :start', { start: filters.start_date || filters.gte_invoice_date });
    if (filters.end_date || filters.lte_invoice_date) qb.andWhere('DATE(si.invoice_date) <= :end', { end: filters.end_date || filters.lte_invoice_date });
    if (filters.payment_status) qb.andWhere('si.payment_status = :ps', { ps: filters.payment_status });
    if (filters.search) {
      qb.andWhere('(si.invoice_number ILIKE :search OR si.customer_name ILIKE :search OR si.customer_mobile ILIKE :search)', { search: `%${filters.search}%` });
    }
    if (filters.gt_amount_pending !== undefined) {
      qb.andWhere('si.amount_pending > :gtap', { gtap: parseFloat(filters.gt_amount_pending.toString()) });
    }
    if (filters.lte_amount_pending !== undefined) {
      qb.andWhere('si.amount_pending <= :lteap', { lteap: parseFloat(filters.lte_amount_pending.toString()) });
    }
    if (filters.customer_mobile) {
      qb.andWhere('si.customer_mobile = :mobile', { mobile: filters.customer_mobile });
    }
    if (filters.customer_name) {
      qb.andWhere('si.customer_name = :name', { name: filters.customer_name });
    }

    qb.leftJoinAndSelect('si.salesman', 'salesman');

    qb.orderBy('si.created_at', 'DESC').skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  async getInvoiceById(id: string) {
    return this.invoiceRepo.findOne({ 
      where: { id }, 
      relations: [
        'items', 
        'salesman', 
        'items.salesman', 
        'items.product_item', 
        'items.product_item.product_group'
      ] 
    });
  }

  async createInvoice(data: any, userId: string) {
    return AppDataSource.transaction(async (manager) => {
      // Generate invoice number
      let invoiceNumber = data.invoice_number;
      if (!invoiceNumber) {
        const year = new Date().getFullYear();
        const prefix = `INV${year}`;
        const records = await manager.query(`SELECT invoice_number FROM sales_invoices WHERE invoice_number LIKE $1 ORDER BY invoice_number DESC LIMIT 1`, [`${prefix}%`]);
        let nextNum = 1;
        if (records.length > 0 && records[0].invoice_number) {
          const lastPortion = records[0].invoice_number.substring(prefix.length);
          const parsed = parseInt(lastPortion, 10);
          if (!isNaN(parsed)) nextNum = parsed + 1;
        }
        invoiceNumber = `${prefix}${nextNum.toString().padStart(6, '0')}`;
      }

      // Create invoice
      const invoice = manager.create(SalesInvoice, {
        invoice_number: invoiceNumber,
        invoice_date: data.invoice_date || new Date(),
        customer_mobile: data.customer_mobile,
        customer_name: data.customer_name,
        customer_id: data.customer_id || null,
        total_mrp: data.total_mrp || 0,
        total_discount: data.total_discount || 0,
        taxable_value: data.taxable_value || 0,
        total_gst: data.total_gst || 0,
        gst_type: data.gst_type || 'CGST_SGST',
        cgst_5: data.cgst_5 || 0,
        sgst_5: data.sgst_5 || 0,
        cgst_18: data.cgst_18 || 0,
        sgst_18: data.sgst_18 || 0,
        igst_5: data.igst_5 || 0,
        igst_18: data.igst_18 || 0,
        net_payable: data.net_payable || 0,
        payment_mode: data.payment_mode || (data.payment_details && data.payment_details.length > 0 ? data.payment_details[0].mode : null),
        amount_paid: data.amount_paid || 0,
        payment_details: data.payment_details || null,
        amount_pending: data.amount_paid !== undefined ? (data.net_payable - data.amount_paid) : (data.net_payable || 0),
        payment_status: data.amount_paid >= data.net_payable ? 'paid' : data.amount_paid > 0 ? 'partial' : 'pending',
        sales_order_id: data.sales_order_id || null,
        voucher_id: data.voucher_id || null,
        voucher_discount: data.voucher_discount || 0,
        pan_no: data.pan_no || null,
        aadhar_no: data.aadhar_no || null,
        salesman_id: data.salesman_id || null,
        created_by: userId,
      });

      const savedInvoice = await manager.save(invoice);

      // Create line items & deduct inventory
      if (data.items && data.items.length > 0) {
        for (const item of data.items) {
          // Deduct inventory
          if (item.barcode_8digit) {
            const batch = await manager.findOne(BarcodeBatch, { where: { barcode_alias_8digit: item.barcode_8digit } });
            if (batch) {
              const qty = item.quantity || 1;
              if (batch.available_quantity < qty) {
                throw new Error(`Insufficient stock for barcode ${item.barcode_8digit}. Available: ${batch.available_quantity}`);
              }
              batch.available_quantity -= qty;
              await manager.save(batch);
            }
          }

          const invoiceItem = manager.create(SalesInvoiceItem, {
            invoice_id: savedInvoice.id,
            sr_no: item.sr_no,
            barcode_8digit: item.barcode_8digit,
            design_no: item.design_no,
            product_description: item.product_description || '',
            hsn_code: item.hsn_code || null,
            quantity: item.quantity || 1,
            mrp: item.mrp || 0,
            discount: item.discount || 0,
            taxable_value: item.taxable_value || 0,
            gst_percentage: item.gst_percentage || 0,
            gst_type: item.gst_type || 'CGST_SGST',
            cgst_percentage: item.cgst_percentage || 0,
            cgst_amount: item.cgst_amount || 0,
            sgst_percentage: item.sgst_percentage || 0,
            sgst_amount: item.sgst_amount || 0,
            igst_percentage: item.igst_percentage || 0,
            igst_amount: item.igst_amount || 0,
            total_value: item.total_value || 0,
            selling_price: item.selling_price || item.mrp || 0,
            salesman_id: item.salesman_id || null,
            delivered: item.delivered || false,
            delivery_date: item.delivery_date || null,
            expected_delivery_date: item.expected_delivery_date || null,
          });
          await manager.save(invoiceItem);
        }
      }

      // Update customer data & Calculate Loyalty Points
      if (data.customer_mobile) {
        let customer = await manager.findOne(Customer, { where: { mobile: data.customer_mobile } });
        if (customer) {
          customer.last_purchase_date = new Date();
          
          const loyaltyConfig = await manager.findOne(LoyaltyConfig, { where: { active: true } });
          const pointsPerRupee = loyaltyConfig ? Number(loyaltyConfig.points_per_rupee) : 0;
          const redemptionValue = loyaltyConfig ? Number(loyaltyConfig.redemption_value_per_point) : 1;

          // 1. Handle Point Redemption
          if (data.loyalty_points_redeemed && data.loyalty_points_redeemed > 0) {
            const pointsToRedeem = Number(data.loyalty_points_redeemed);
            const currentBalance = Number(customer.loyalty_points_balance) || 0;

            if (pointsToRedeem > currentBalance) {
               throw new Error(`Insufficient loyalty points balance. Available: ${currentBalance}`);
            }

            customer.loyalty_points_balance = currentBalance - pointsToRedeem;
            savedInvoice.loyalty_points_redeemed = pointsToRedeem;
            savedInvoice.loyalty_redemption_amount = pointsToRedeem * redemptionValue;
            
            const redemptionHistory = manager.create(LoyaltyHistory, {
              customer_id: customer.id,
              points: -pointsToRedeem,
              type: LoyaltyTransactionType.REDEEM,
              reference_id: savedInvoice.id,
              notes: `Points redeemed on invoice ${savedInvoice.invoice_number}`
            });
            await manager.save(redemptionHistory);
          }

          // 2. Handle Point Earning (1% of net payable)
          if (loyaltyConfig && pointsPerRupee > 0) {
            const pointsEarned = parseFloat((savedInvoice.net_payable * pointsPerRupee).toFixed(2));
            if (pointsEarned > 0) {
              savedInvoice.loyalty_points_earned = pointsEarned;
              customer.loyalty_points = (Number(customer.loyalty_points) || 0) + pointsEarned;
              customer.loyalty_points_balance = (Number(customer.loyalty_points_balance) || 0) + pointsEarned;

              const earningHistory = manager.create(LoyaltyHistory, {
                customer_id: customer.id,
                points: pointsEarned,
                type: LoyaltyTransactionType.EARN,
                reference_id: savedInvoice.id,
                notes: `Points earned from invoice ${savedInvoice.invoice_number}`
              });
              await manager.save(earningHistory);
            }
          }

          await manager.save(savedInvoice);

          customer.total_purchases = parseFloat((Number(customer.total_purchases) || 0).toFixed(2)) + parseFloat(Number(savedInvoice.net_payable).toFixed(2));
          customer.total_visits = (Number(customer.total_visits) || 0) + 1;
          
          await manager.save(customer);
        }
      }

      // Mark bookings as invoiced
      if (data.booking_ids && data.booking_ids.length > 0) {
        for (const bookingId of data.booking_ids) {
          const booking = await manager.findOne(EBooking, { where: { id: bookingId } });
          if (booking) {
            booking.status = 'invoiced';
            booking.invoice_number = invoiceNumber;
            await manager.save(booking);
          }
        }
      }

      // Redeem voucher if applicable
      if (data.voucher_code) {
        await voucherService.redeemVoucher(data.voucher_code, savedInvoice.id, manager);
      }

      // Redeem credit coupon if applicable
      if (data.coupon_no) {
        await creditCouponService.redeem(data.coupon_no, savedInvoice.id, manager);
      }

      logger.info(`Invoice created: ${invoiceNumber}`, { items: data.items?.length || 0, total: data.net_payable });

      return savedInvoice;
    });
  }
  async getInvoiceItems(filters: any) {
    const qb = AppDataSource.getRepository(SalesInvoiceItem).createQueryBuilder('sii')
      .leftJoinAndSelect('sii.invoice', 'si');
    if (filters.invoice_id) {
      const ids = filters.invoice_id.split(',').map((id: string) => id.trim()).filter(Boolean);
      if (ids.length === 1) {
        qb.andWhere('sii.invoice_id = :id', { id: ids[0] });
      } else if (ids.length > 1) {
        qb.andWhere('sii.invoice_id IN (:...ids)', { ids });
      }
    }
    if (filters.barcode_8digit) qb.andWhere('sii.barcode_8digit = :barcode', { barcode: filters.barcode_8digit });
    if (filters.delivered !== undefined) {
      qb.andWhere('sii.delivered = :delivered', { delivered: filters.delivered === 'true' || filters.delivered === true });
    }
    if (filters['gte_sales_invoice.invoice_date']) qb.andWhere('DATE(si.invoice_date) >= :sd', { sd: filters['gte_sales_invoice.invoice_date'] });
    if (filters['lte_sales_invoice.invoice_date']) qb.andWhere('DATE(si.invoice_date) <= :ed', { ed: filters['lte_sales_invoice.invoice_date'] });
    if (filters.limit) qb.take(parseInt(filters.limit, 10));
    return qb.getMany();
  }
  async updateInvoiceItems(filters: any, data: any) {
    const qb = AppDataSource.getRepository(SalesInvoiceItem).createQueryBuilder()
      .update(SalesInvoiceItem)
      .set(data);
    if (filters.id) {
      const ids = filters.id.split(',');
      qb.where('id IN (:...ids)', { ids });
    }
    if (filters.invoice_id) qb.andWhere('invoice_id = :invoice_id', { invoice_id: filters.invoice_id });
    return qb.execute();
  }
}

export const salesService = new SalesService();
