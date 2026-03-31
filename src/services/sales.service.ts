import { AppDataSource } from '../config/data-source';
import { SalesInvoice } from '../entities/SalesInvoice';
import { SalesInvoiceItem } from '../entities/SalesInvoiceItem';
import { getFiscalYearPrefix } from '../utils/fiscalYear';
import { BarcodeBatch } from '../entities/BarcodeBatch';
import { Customer } from '../entities/Customer';
import { EBooking, EBookingItem, LoyaltyConfig, LoyaltyHistory, LoyaltyTransactionType } from '../entities';
import { Voucher } from '../entities/Voucher';
import { voucherService } from './voucher.service';
import { creditCouponService } from './creditCoupon.service';
import { ILike, In } from 'typeorm';
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

    if (filters.start_date || filters.gte_invoice_date) qb.andWhere('si.invoice_date >= :start', { start: filters.start_date || filters.gte_invoice_date });
    if (filters.end_date || filters.lte_invoice_date) qb.andWhere('si.invoice_date <= :end', { end: filters.end_date || filters.lte_invoice_date });
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

    // Join only first-level relations directly
    qb.leftJoinAndSelect('si.salesman', 'salesman')
      .leftJoinAndSelect('si.creator', 'creator')
      .leftJoinAndSelect('si.customer', 'customer');

    // Use take/skip with distinct query if there are many relations (though now we removed deep joins)
    qb.orderBy('si.created_at', 'DESC').skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    // Fetch items separately for the retrieved invoices to avoid Cartesian product explosion
    if (data.length > 0) {
      const invoiceIds = data.map(inv => inv.id);
      const allItems = await AppDataSource.getRepository(SalesInvoiceItem).find({
        where: { invoice_id: In(invoiceIds) },
        relations: ['product_item', 'product_item.product_group', 'salesman']
      });

      // Group items by invoice_id
      const itemMap = new Map<string, SalesInvoiceItem[]>();
      allItems.forEach(item => {
        const list = itemMap.get(item.invoice_id) || [];
        list.push(item);
        itemMap.set(item.invoice_id, list);
      });

      // Attach items back to invoices
      data.forEach(inv => {
        inv.items = itemMap.get(inv.id) || [];
      });
    }

    return { data, total, page, limit };
  }

  async getInvoiceById(id: string) {
    return this.invoiceRepo.findOne({ 
      where: { id }, 
      relations: [
        'items', 
        'salesman', 
        'creator',
        'items.salesman', 
        'items.product_item', 
        'items.product_item.product_group',
        'customer'
      ] 
    });
  }

  async createInvoice(data: any, userId: string) {
    return AppDataSource.transaction(async (manager) => {
      // Generate invoice number
      let invoiceNumber = data.invoice_number;
      if (!invoiceNumber) {
        const prefix = `INV${getFiscalYearPrefix()}`;
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
        amount_paid: Math.min(Number(data.amount_paid) || 0, Number(data.net_payable) || 0),
        payment_details: data.payment_details || null,
        amount_pending: data.amount_paid !== undefined ? Math.max(0, Number(data.net_payable) - Number(data.amount_paid)) : (Number(data.net_payable) || 0),
        payment_status: data.amount_paid >= data.net_payable ? 'paid' : data.amount_paid > 0 ? 'partial' : 'pending',
        sales_order_id: data.sales_order_id || null,
        voucher_id: data.voucher_id || null,
        voucher_discount: data.voucher_discount || 0,
        voucher_code: data.voucher_code || null,
        coupon_no: data.coupon_no || null,
        pan_no: data.pan_no || null,
        aadhar_no: data.aadhar_no || null,
        customer_gstin: data.customer_gstin || null,
        salesman_id: data.salesman_id || null,
        created_by: userId,
        special_discount: data.special_discount || 0,
        loyalty_points_earned: data.loyalty_points_earned || 0,
        loyalty_points_redeemed: data.loyalty_points_redeemed || 0,
        loyalty_redemption_amount: data.loyalty_redemption_amount || 0,
        additional_charges_base: Number(data.additional_charges_base) || 0,
        additional_charges_gst_rate: Number(data.additional_charges_gst_rate) || 0,
        additional_charges_gst: Number(data.additional_charges_gst) || 0,
        additional_charges_total: Number(data.additional_charges_total) || 0,
        floor_id: data.floor_id || null,
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
            gst_logic: item.gst_logic || null,
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
            on_approval: item.on_approval || false,
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

      // Mark bookings/items as handled
      if (data.booking_ids && data.booking_ids.length > 0) {
        // Collect all barcodes in the current invoice for matching
        const invoiceBarcodes = (data.items || []).map((item: any) => item.barcode_8digit).filter(Boolean);
        const usedBarcodes = new Map<string, number>();

        for (const bookingId of data.booking_ids) {
          const booking = await manager.findOne(EBooking, { 
            where: { id: bookingId },
            relations: ['items'] 
          });
          
          if (booking) {
            // Update individual item statuses
            if (booking.items && booking.items.length > 0) {
              for (const bookingItem of booking.items) {
                const bc = bookingItem.barcode_8digit;
                // Check if this item exists in the current invoice
                const currentCount = usedBarcodes.get(bc) || 0;
                const matchesInInvoice = invoiceBarcodes.filter((b: string) => b === bc).length;

                if (currentCount < matchesInInvoice) {
                  // Item was purchased
                  bookingItem.status = 'invoiced';
                  bookingItem.invoice_id = savedInvoice.id;
                  usedBarcodes.set(bc, currentCount + 1);
                } else {
                  // Item was booked but not purchased in this invoice -> mark as cancelled
                  bookingItem.status = 'cancelled';
                }
                await manager.save(bookingItem);
              }
            }

            booking.status = 'invoiced'; // The overall booking is now handled
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
  async updateInvoiceItems(ids: string[], data: any) {
    const itemRepo = AppDataSource.getRepository(SalesInvoiceItem);
    const allowedFields = ['delivered', 'delivery_date', 'expected_delivery_date'];
    const updatePayload: any = {};
    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        updatePayload[field] = data[field];
      }
    }
    
    if (Object.keys(updatePayload).length === 0) return;

    await itemRepo.update(ids, updatePayload);
  }
  async updateInvoice(id: string, data: any, userId: string) {
    return AppDataSource.transaction(async (manager) => {
      // 1. Fetch old invoice and its items
      const oldInvoice = await manager.findOne(SalesInvoice, {
        where: { id },
        relations: ['customer']
      });
      if (!oldInvoice) throw new Error('Invoice not found');

      // 2. Revert inventory for all old items
      const oldItems = await manager.find(SalesInvoiceItem, { where: { invoice_id: id } });
      if (oldItems && oldItems.length > 0) {
        for (const item of oldItems) {
          if (item.barcode_8digit) {
            const batch = await manager.findOne(BarcodeBatch, { where: { barcode_alias_8digit: item.barcode_8digit } });
            if (batch) {
              const qty = Number(item.quantity) || 1;
              batch.available_quantity += qty;
              await manager.save(batch);
            }
          }
        }
      }

      // 3. Revert Loyalty Points and Purchase History from old invoice
      const oldEarnedPoints = parseFloat(oldInvoice.loyalty_points_earned?.toString() || '0');
      const oldRedeemedPoints = parseFloat(oldInvoice.loyalty_points_redeemed?.toString() || '0');
      
      let customerToUpdate: Customer | null = null;
      if (oldInvoice.customer_mobile) {
        customerToUpdate = await manager.findOne(Customer, { where: { mobile: oldInvoice.customer_mobile } });
        if (customerToUpdate) {
          console.log(`[SalesService] Reverting loyalty for ${oldInvoice.customer_mobile}. Balance before: ${customerToUpdate.loyalty_points_balance}`);
          
          // Revert earned points (Deduct from balance and total earned)
          if (oldEarnedPoints > 0) {
            customerToUpdate.loyalty_points = parseFloat(customerToUpdate.loyalty_points?.toString() || '0') - oldEarnedPoints;
            customerToUpdate.loyalty_points_balance = parseFloat(customerToUpdate.loyalty_points_balance?.toString() || '0') - oldEarnedPoints;
            console.log(`[SalesService] Reverted earned: ${oldEarnedPoints}`);
          }
          
          // Revert redeemed points (Restore to balance)
          if (oldRedeemedPoints > 0) {
            customerToUpdate.loyalty_points_balance = parseFloat(customerToUpdate.loyalty_points_balance?.toString() || '0') + oldRedeemedPoints;
            console.log(`[SalesService] Reverted redeemed: ${oldRedeemedPoints}`);
          }
          
          // Revert total purchase amount
          const oldNet = parseFloat(oldInvoice.net_payable?.toString() || '0');
          customerToUpdate.total_purchases = Math.max(0, parseFloat(customerToUpdate.total_purchases?.toString() || '0') - oldNet);
          
          await manager.save(customerToUpdate);
          console.log(`[SalesService] Balance after restoration: ${customerToUpdate.loyalty_points_balance}`);
          
          // Delete old loyalty history records for this invoice
          await manager.delete(LoyaltyHistory, { reference_id: oldInvoice.id });
        }
      }

      // 4. Update the main invoice record (excluding invoice_number and created_by)
      const updateData: any = {
        invoice_date: data.invoice_date || oldInvoice.invoice_date,
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
        payment_mode: data.payment_mode || (data.payment_details && data.payment_details.length > 0 ? data.payment_details[0].mode : oldInvoice.payment_mode),
        amount_paid: Math.min(Number(data.amount_paid) || 0, Number(data.net_payable) || 0),
        payment_details: data.payment_details || null,
        amount_pending: data.amount_paid !== undefined ? Math.max(0, Number(data.net_payable) - Number(data.amount_paid)) : (Number(data.net_payable) || 0),
        payment_status: Number(data.amount_paid) >= Number(data.net_payable) ? 'paid' : Number(data.amount_paid) > 0 ? 'partial' : 'pending',
        pan_no: data.pan_no || null,
        aadhar_no: data.aadhar_no || null,
        customer_gstin: data.customer_gstin || null,
        salesman_id: data.salesman_id || null,
        modified_by: userId,
        loyalty_points_earned: data.loyalty_points_earned || 0,
        loyalty_points_redeemed: data.loyalty_points_redeemed || 0,
        loyalty_redemption_amount: data.loyalty_redemption_amount || 0,
        special_discount: data.special_discount || 0,
        voucher_id: data.voucher_id || null,
        voucher_discount: data.voucher_discount || 0,
        voucher_code: data.voucher_code || null,
        coupon_no: data.coupon_no || null,
        additional_charges_base: Number(data.additional_charges_base) || 0,
        additional_charges_gst_rate: Number(data.additional_charges_gst_rate) || 0,
        additional_charges_gst: Number(data.additional_charges_gst) || 0,
        additional_charges_total: Number(data.additional_charges_total) || 0,
      };

      // 5. Handle Voucher/Coupon changes
      if (oldInvoice.voucher_code && oldInvoice.voucher_code !== data.voucher_code) {
        await voucherService.releaseVoucher(oldInvoice.id, manager);
      }
      if (oldInvoice.coupon_no && oldInvoice.coupon_no !== data.coupon_no) {
        await creditCouponService.releaseCoupon(oldInvoice.id, manager);
      }

      if (data.voucher_code && data.voucher_code !== oldInvoice.voucher_code) {
        await voucherService.redeemVoucher(data.voucher_code, oldInvoice.id, manager);
      }
      if (data.coupon_no && data.coupon_no !== oldInvoice.coupon_no) {
        await creditCouponService.redeem(data.coupon_no, oldInvoice.id, manager);
      }

      await manager.update(SalesInvoice, id, updateData);
      
      const savedInvoice = await manager.findOne(SalesInvoice, { where: { id } });
      if (!savedInvoice) throw new Error('Failed to re-fetch invoice');

      // 5. Replace line items
      await manager.delete(SalesInvoiceItem, { invoice_id: id });

      if (data.items && data.items.length > 0) {
        for (const item of data.items) {
          // Deduct inventory for new items
          if (item.barcode_8digit) {
            const batch = await manager.findOne(BarcodeBatch, { where: { barcode_alias_8digit: item.barcode_8digit } });
            if (batch) {
              const qty = Number(item.quantity) || 1;
              if (batch.available_quantity < qty) {
                throw new Error(`Insufficient stock for barcode ${item.barcode_8digit}. Available: ${batch.available_quantity}`);
              }
              batch.available_quantity -= qty;
              await manager.save(batch);
            }
          }

          const invoiceItem = manager.create(SalesInvoiceItem, {
            invoice_id: id, // Use the explicit ID from parameters
            sr_no: item.sr_no,
            barcode_8digit: item.barcode_8digit,
            design_no: item.design_no,
            product_description: item.product_description || '',
            hsn_code: item.hsn_code || null,
            quantity: Number(item.quantity) || 1,
            mrp: Number(item.mrp) || 0,
            discount: Number(item.discount) || 0,
            taxable_value: Number(item.taxable_value) || 0,
            gst_percentage: Number(item.gst_percentage) || 0,
            gst_logic: item.gst_logic || null,
            gst_type: item.gst_type || 'CGST_SGST',
            cgst_percentage: Number(item.cgst_percentage) || 0,
            cgst_amount: Number(item.cgst_amount) || 0,
            sgst_percentage: Number(item.sgst_percentage) || 0,
            sgst_amount: Number(item.sgst_amount) || 0,
            igst_percentage: Number(item.igst_percentage) || 0,
            igst_amount: Number(item.igst_amount) || 0,
            total_value: Number(item.total_value) || 0,
            selling_price: Number(item.selling_price) || Number(item.mrp) || 0,
            salesman_id: item.salesman_id || null,
            delivered: item.delivered || false,
            on_approval: item.on_approval || false,
            delivery_date: item.delivery_date || null,
            expected_delivery_date: item.expected_delivery_date || null,
          });
          await manager.save(invoiceItem);
        }
      }

      // 6. Re-calculate Loyalty Points & Update History
      if (savedInvoice.customer_mobile) {
        // Force a re-fetch of the customer to ensure we have the absolute latest balance after all previous updates
        const customer = await manager.findOne(Customer, { where: { mobile: savedInvoice.customer_mobile } });
        
        if (customer) {
          const currentBalance = parseFloat(customer.loyalty_points_balance?.toString() || '0');
          console.log(`[SalesService] Final calculation for ${savedInvoice.customer_mobile}. Balance: ${currentBalance}`);
          
          customer.last_purchase_date = new Date();
          
          const loyaltyConfig = await manager.findOne(LoyaltyConfig, { where: { active: true } });
          const pointsPerRupee = loyaltyConfig ? parseFloat(loyaltyConfig.points_per_rupee?.toString() || '0') : 0;
          const redemptionValue = loyaltyConfig ? parseFloat(loyaltyConfig.redemption_value_per_point?.toString() || '1') : 1;

          // 1. Handle Point Redemption
          const newRedeemedPoints = parseFloat(data.loyalty_points_redeemed?.toString() || '0');
          // oldRedeemedPoints is already captured at the start of the function

          if (newRedeemedPoints > 0) {
            console.log(`[SalesService] Target redemption: ${newRedeemedPoints}, Old redemption: ${oldRedeemedPoints}`);

            // Only check balance if they are trying to redeem MORE than before
            if (newRedeemedPoints > oldRedeemedPoints) {
              const extraNeeded = newRedeemedPoints - oldRedeemedPoints;
              if (extraNeeded > currentBalance + 0.001) {
                console.error(`[SalesService] Insufficient points for increase! Available: ${currentBalance}, Extra needed: ${extraNeeded}`);
                throw new Error(`Insufficient loyalty points balance to increase redemption. Available extra: ${currentBalance}`);
              }
            }

            customer.loyalty_points_balance = currentBalance + oldRedeemedPoints - newRedeemedPoints;
            savedInvoice.loyalty_points_redeemed = newRedeemedPoints;
            savedInvoice.loyalty_redemption_amount = newRedeemedPoints * redemptionValue;
            
            const redemptionHistory = manager.create(LoyaltyHistory, {
              customer_id: customer.id,
              points: oldRedeemedPoints - newRedeemedPoints, // The delta
              type: LoyaltyTransactionType.REDEEM,
              reference_id: savedInvoice.id,
              notes: `Points redemption adjusted on updated invoice ${savedInvoice.invoice_number}`
            });
            await manager.save(redemptionHistory);
          } else if (oldRedeemedPoints > 0) {
            // They removed redemption entirely
            customer.loyalty_points_balance = currentBalance + oldRedeemedPoints;
            savedInvoice.loyalty_points_redeemed = 0;
            savedInvoice.loyalty_redemption_amount = 0;
          }

          // 2. Handle Point Earning
          if (loyaltyConfig && pointsPerRupee > 0) {
            const pointsEarned = parseFloat((parseFloat(savedInvoice.net_payable?.toString() || '0') * pointsPerRupee).toFixed(2));
            if (pointsEarned > 0) {
              console.log(`[SalesService] Earning points: ${pointsEarned}`);
              savedInvoice.loyalty_points_earned = pointsEarned;
              customer.loyalty_points = (parseFloat(customer.loyalty_points?.toString() || '0')) + pointsEarned;
              customer.loyalty_points_balance = (parseFloat(customer.loyalty_points_balance?.toString() || '0')) + pointsEarned;

              const earningHistory = manager.create(LoyaltyHistory, {
                customer_id: customer.id,
                points: pointsEarned,
                type: LoyaltyTransactionType.EARN,
                reference_id: savedInvoice.id,
                notes: `Points earned from updated invoice ${savedInvoice.invoice_number}`
              });
              await manager.save(earningHistory);
            }
          }

          await manager.save(savedInvoice);

          customer.total_purchases = (parseFloat(customer.total_purchases?.toString() || '0')) + parseFloat(savedInvoice.net_payable?.toString() || '0');
          
          await manager.save(customer);
          console.log(`[SalesService] Customer updated. New balance: ${customer.loyalty_points_balance}`);
        }
      }

      logger.info(`Invoice updated: ${savedInvoice.invoice_number}`, { items: data.items?.length || 0, total: data.net_payable });
      return savedInvoice;
    });
  }
}

export const salesService = new SalesService();
