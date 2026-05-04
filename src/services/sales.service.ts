import { AppDataSource } from '../config/data-source';
import { SalesInvoice } from '../entities/SalesInvoice';
import { SalesInvoiceItem } from '../entities/SalesInvoiceItem';
import { BarcodeBatch } from '../entities/BarcodeBatch';
import { Customer } from '../entities/Customer';
import { Salesman } from '../entities/Salesman';
import { Floor } from '../entities/Floor';
import { User } from '../entities/User';
import { LoyaltyConfig } from '../entities/LoyaltyConfig';
import { LoyaltyHistory, LoyaltyTransactionType } from '../entities/LoyaltyHistory';
import { SalesReturn } from '../entities/SalesReturn';
import { EBooking } from '../entities/EBooking';
import { voucherService } from './voucher.service';
import { creditCouponService } from './creditCoupon.service';
import { salesOrderService } from './salesOrder.service';
import logger from '../utils/logger';
import { getFiscalYearPrefix } from '../utils/fiscalYear';
import { customerService } from './customer.service';

export class SalesService {
  async getInvoices(filters: any) {
    const qb = AppDataSource.getRepository(SalesInvoice).createQueryBuilder('si')
      .leftJoinAndSelect('si.items', 'items')
      .leftJoinAndSelect('items.salesman', 'itemSalesman')
      .leftJoinAndSelect('si.customer', 'customer')
      .leftJoinAndSelect('si.salesman', 'salesman')
      .leftJoinAndSelect('si.creator', 'creator')
      .leftJoinAndSelect('si.floor_details', 'floor')
      .leftJoinAndSelect('si.sales_returns', 'sales_returns');

    if (filters.search) {
      qb.andWhere('(si.invoice_number ILIKE :s OR si.customer_name ILIKE :s OR si.customer_mobile ILIKE :s)', { s: `%${filters.search}%` });
    }

    if (filters.customer_mobile) {
      qb.andWhere('si.customer_mobile = :mobile', { mobile: filters.customer_mobile });
    }

    if (filters.invoice_date) {
      qb.andWhere('DATE(si.invoice_date) = :date', { date: filters.invoice_date });
    }

    if (filters.status) {
      if (typeof filters.status === 'string' && filters.status.includes(',')) {
        const statuses = filters.status.split(',').map((s: string) => s.trim());
        qb.andWhere('si.payment_status IN (:...statuses)', { statuses });
      } else {
        qb.andWhere('si.payment_status = :status', { status: filters.status });
      }
    }

    if (filters.salesman_id) {
       qb.andWhere('si.salesman_id = :salesman_id', { salesman_id: filters.salesman_id });
    }

    if (filters.floor_id) {
       qb.andWhere('si.floor_id = :floor_id', { floor_id: filters.floor_id });
    }

    if (filters.startDate) {
      qb.andWhere('si.invoice_date >= :startDate', { startDate: filters.startDate });
    }

    if (filters.endDate) {
      qb.andWhere('si.invoice_date <= :endDate', { endDate: filters.endDate });
    }

    // Pagination
    const page = parseInt(filters.page, 10) || 1;
    const limit = parseInt(filters.limit, 10) || 25;
    const skip = (page - 1) * limit;

    qb.orderBy('si.created_at', 'DESC')
      .skip(skip)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();

    // Dynamically recalculate payment_status using ground truth reconstruction.
    // This is the source of truth for the list view and payment allocations.
    const correctedData = data.map(inv => {
      // 1. Reconstruct TRUE Net Payable (MRP - Final Discount + Charges - Returns)
      // Business Rule (from PDF): If Item Discounts exist (>0.1), use them. 
      // Otherwise, sum the Header Discounts (Special, Loyalty, Voucher). They DO NOT stack.
      const itemDisc = Number(inv.total_discount || 0);
      const specialDisc = Number(inv.special_discount || 0);
      const loyaltyDisc = Number(inv.loyalty_redemption_amount || 0);
      const voucherDisc = Number(inv.voucher_discount || 0);
      
      // Correct Logic: Intelligent discount reconstruction.
      // 1. Calculate the 'Ground Truth' sum of all line-item discounts
      const itemSum = (inv.items || []).reduce((sum, it) => sum + Number(it.discount || 0), 0);
      
      // 2. Sum up header-level discount fields
      const headerSum = Number(inv.special_discount || 0) + 
                        Number(inv.loyalty_redemption_amount || 0) + 
                        Number(inv.voucher_discount || 0);
      
      // 3. Determine Final Discount: Use Math.round to avoid tiny floating point errors 
      // during comparison (e.g., 999.99 vs 1000.00).
      const finalDiscount = (Math.round(itemSum) >= Math.round(headerSum) && headerSum > 0) 
        ? itemSum 
        : (itemSum + headerSum);
      
      const returnsAmt = (inv.sales_returns || []).reduce((sum, r) => sum + Number(r.total_return_amount || 0), 0);
      
      // Calculate TRUE Net Payable with strict rounding
      const trueNet = Math.round(Math.max(0, 
        Number(inv.total_mrp || 0) 
        - finalDiscount 
        + Number(inv.additional_charges_total || 0)
        - returnsAmt
      ));

      // 2. TRUE Paid Amount (Using stored amount_paid as baseline)
      const paid = Number(inv.amount_paid || 0);
      const truePending = Math.max(0, trueNet - paid);
      
      let correctedStatus: string;
      if (truePending <= 1) {
        correctedStatus = 'paid';
      } else if (paid > 1) {
        correctedStatus = 'partial';
      } else {
        correctedStatus = 'pending';
      }

      // Check for discrepancies in status, pending amount, or net_payable itself
      const storedPending = Number(inv.amount_pending || 0);
      const storedNet = Number(inv.net_payable || 0);
      const statusChanged = correctedStatus !== inv.payment_status;
      const pendingChanged = Math.abs(storedPending - truePending) > 1;
      const netChanged = Math.abs(storedNet - trueNet) > 1;

      if (statusChanged || pendingChanged || netChanged) {
        AppDataSource.getRepository(SalesInvoice).update(inv.id, {
          payment_status: correctedStatus as any,
          amount_pending: truePending,
          net_payable: trueNet
        }).catch(() => {});
        return { ...inv, payment_status: correctedStatus, amount_pending: truePending, net_payable: trueNet };
      }
      return inv;
    });

    return { data: correctedData, total, page, limit };
  }

  async getInvoiceById(id: string) {
    const invoice = await AppDataSource.getRepository(SalesInvoice).findOne({
      where: { id },
      relations: [
        'items', 
        'items.salesman', 
        'items.product_item',
        'items.product_item.product_group',
        'customer', 
        'salesman', 
        'creator', 
        'floor_details',
        'receipt_items',
        'receipt_items.receipt',
        'coupon_applications',
        'coupon_applications.coupon',
        'advance_applications',
        'advance_applications.advance',
        'credit_note_applications',
        'credit_note_applications.creditNote'
      ]
    });

    if (invoice) {
      // Robustly fetch returns by ID OR Number to handle legacy unlinked data
      invoice.sales_returns = await AppDataSource.getRepository(SalesReturn).find({
        where: [
          { invoice_id: id },
          { invoice_number: invoice.invoice_number }
        ],
        relations: ['items']
      });
    }

    return invoice;
  }

  async createInvoice(data: any, userId: string) {
    return AppDataSource.transaction(async (manager) => {
      // 1. Log incoming payload for debugging persistence issues
      console.log(`[SalesService] Creating Invoice Payload:`, JSON.stringify(data, null, 2));

      // 2. Generate Invoice Number if not provided
      let invoiceNumber = data.invoice_number;
      if (!invoiceNumber) {
        const prefix = `INV${getFiscalYearPrefix()}`;
        const records = await manager.query(
          `SELECT MAX(CAST(SUBSTRING(invoice_number FROM ${prefix.length + 1}) AS integer)) as max_num 
           FROM sales_invoices 
           WHERE invoice_number LIKE $1`, 
          [`${prefix}%`]
        );
        let nextNum = 1;
        if (records.length > 0 && records[0].max_num) {
          nextNum = parseInt(records[0].max_num, 10) + 1;
        }
        invoiceNumber = `${prefix}${nextNum.toString().padStart(6, '0')}`;
      }
      
      // Auto-link or Create Customer
      if (data.customer_mobile) {
          const customer = await customerService.ensureCustomerExists({
              mobile: data.customer_mobile,
              name: data.customer_name || 'Walk-in Customer'
          });
          if (customer) {
              data.customer_id = customer.id;
          }
      }


      // 3. Create the main invoice record
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
        coupon_amount: Number(data.coupon_amount) || 0,
        floor_id: data.floor_id || null,
      });

      const savedInvoice = await manager.save(invoice);

      // 4. Create line items & deduct inventory
      if (data.items && data.items.length > 0) {
        for (const item of data.items) {
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

      // 5. Update customer data & Calculate Loyalty Points
      if (data.customer_mobile) {
        let customer = await manager.findOne(Customer, { where: { mobile: data.customer_mobile } });
        if (customer) {
          customer.last_purchase_date = new Date();
          
          const loyaltyConfig = await manager.findOne(LoyaltyConfig, { where: { active: true } });
          const pointsPerRupee = loyaltyConfig ? Number(loyaltyConfig.points_per_rupee) : 0;
          const redemptionValue = loyaltyConfig ? Number(loyaltyConfig.redemption_value_per_point) : 1;

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

      // 6. Mark bookings/items as handled
      if (data.booking_ids && data.booking_ids.length > 0) {
        const invoiceBarcodes = (data.items || []).map((item: any) => item.barcode_8digit).filter(Boolean);
        const usedBarcodes = new Map<string, number>();

        for (const bookingId of data.booking_ids) {
          const booking = await manager.findOne(EBooking, { 
            where: { id: bookingId },
            relations: ['items'] 
          });
          
          if (booking) {
            if (booking.items && booking.items.length > 0) {
              for (const bookingItem of booking.items) {
                const bc = bookingItem.barcode_8digit;
                const currentCount = usedBarcodes.get(bc) || 0;
                const matchesInInvoice = invoiceBarcodes.filter((b: string) => b === bc).length;

                if (currentCount < matchesInInvoice) {
                  bookingItem.status = 'invoiced';
                  bookingItem.invoice_id = savedInvoice.id;
                  usedBarcodes.set(bc, currentCount + 1);
                } else {
                  bookingItem.status = 'cancelled';
                }
                await manager.save(bookingItem);
              }
            }
            booking.status = 'invoiced'; 
            booking.invoice_number = invoiceNumber;
            await manager.save(booking);
          }
        }
      }

      if (data.voucher_code) {
        await voucherService.redeemVoucher(data.voucher_code, savedInvoice.id, manager);
      }
      
      // Process payment_details for coupons and advances
      if (data.payment_details && Array.isArray(data.payment_details)) {
        for (const pm of data.payment_details) {
          const mode = String(pm?.mode || '').trim().toLowerCase();
          const reference = pm?.reference || pm?.coupon_no || pm?.receipt_number || pm?.external_no;

          if ((mode === 'credit coupon' || mode.includes('coupon')) && reference) {
            await creditCouponService.apply(String(reference), savedInvoice.id, pm.amount, manager);
          } else if (mode === 'order advance' || mode === 'advance' || mode.includes('advance')) {
            if (reference) {
              await salesOrderService.applyAdvance(String(reference), savedInvoice.id, pm.amount, manager);
            } else if (data.customer_mobile) {
              const customer = await manager.findOne(Customer, { where: { mobile: String(data.customer_mobile).trim() } });
              if (!customer) throw new Error('Customer not found for advance allocation');

              const candidates: { receipt_number: string | null; id: string; remaining_amount: any }[] = await manager.query(
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

              let remainingToApply = Number(pm.amount || 0);
              for (const c of candidates) {
                if (remainingToApply <= 0) break;
                const applyAmt = Math.min(Number(c.remaining_amount || 0), remainingToApply);
                if (applyAmt <= 0) continue;
                await salesOrderService.applyAdvance(String(c.receipt_number || c.id), savedInvoice.id, applyAmt, manager);
                remainingToApply -= applyAmt;
              }
            }
          }
        }
      }

      logger.info(`Invoice created: ${invoiceNumber}`, { items: data.items?.length || 0, total: data.net_payable });
      return savedInvoice;
    });
  }

  async getInvoiceItems(filters: any) {
    const qb = AppDataSource.getRepository(SalesInvoiceItem).createQueryBuilder('sii')
      .leftJoinAndSelect('sii.invoice', 'si')
      .leftJoinAndSelect('si.salesman', 'salesman')
      .leftJoinAndSelect('si.creator', 'creator');
    
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
      console.log(`[SalesService] Updating Invoice ${id} Payload:`, JSON.stringify(data, null, 2));

      const oldInvoice = await manager.findOne(SalesInvoice, {
        where: { id },
        relations: ['customer']
      });
      if (!oldInvoice) throw new Error('Invoice not found');

      // Revert inventory
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

      // Revert Loyalty
      if (oldInvoice.customer_mobile) {
        const customer = await manager.findOne(Customer, { where: { mobile: oldInvoice.customer_mobile } });
        if (customer) {
          const oldEarned = parseFloat(oldInvoice.loyalty_points_earned?.toString() || '0');
          const oldRedeemed = parseFloat(oldInvoice.loyalty_points_redeemed?.toString() || '0');
          customer.loyalty_points = parseFloat(customer.loyalty_points?.toString() || '0') - oldEarned;
          customer.loyalty_points_balance = parseFloat(customer.loyalty_points_balance?.toString() || '0') - oldEarned + oldRedeemed;
          customer.total_purchases = Math.max(0, parseFloat(customer.total_purchases?.toString() || '0') - parseFloat(oldInvoice.net_payable?.toString() || '0'));
          await manager.save(customer);
          await manager.delete(LoyaltyHistory, { reference_id: oldInvoice.id });
        }
      }

      const updateData: Partial<SalesInvoice> = {
        invoice_date: data.invoice_date || oldInvoice.invoice_date,
        customer_mobile: data.customer_mobile,
        customer_name: data.customer_name,
        customer_id: data.customer_id || null,
        total_mrp: Number(data.total_mrp) || 0,
        total_discount: Number(data.total_discount) || 0,
        taxable_value: Number(data.taxable_value) || 0,
        total_gst: Number(data.total_gst) || 0,
        gst_type: data.gst_type || 'CGST_SGST',
        cgst_5: Number(data.cgst_5) || 0,
        sgst_5: Number(data.sgst_5) || 0,
        cgst_18: Number(data.cgst_18) || 0,
        sgst_18: Number(data.sgst_18) || 0,
        igst_5: Number(data.igst_5) || 0,
        igst_18: Number(data.igst_18) || 0,
        net_payable: Number(data.net_payable) || 0,
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
        loyalty_points_earned: Number(data.loyalty_points_earned) || 0,
        loyalty_points_redeemed: Number(data.loyalty_points_redeemed) || 0,
        loyalty_redemption_amount: Number(data.loyalty_redemption_amount) || 0,
        special_discount: Number(data.special_discount) || 0,
        voucher_id: data.voucher_id || null,
        voucher_discount: Number(data.voucher_discount) || 0,
        voucher_code: data.voucher_code || null,
        coupon_no: data.coupon_no || null,
        additional_charges_base: Number(data.additional_charges_base) || 0,
        additional_charges_gst_rate: Number(data.additional_charges_gst_rate) || 0,
        additional_charges_gst: Number(data.additional_charges_gst) || 0,
        additional_charges_total: Number(data.additional_charges_total) || 0,
        coupon_amount: Number(data.coupon_amount) || 0,
        floor_id: data.floor_id || null,
      };

      if (oldInvoice.voucher_code && oldInvoice.voucher_code !== data.voucher_code) {
        await voucherService.releaseVoucher(oldInvoice.id, manager);
      }
      // Release all previously applied coupons and advances for this invoice (so we can re-apply fresh)
      await creditCouponService.releaseInvoiceApplications(oldInvoice.id, manager);
      await salesOrderService.releaseInvoiceApplications(oldInvoice.id, manager);

      if (data.voucher_code && data.voucher_code !== oldInvoice.voucher_code) {
        await voucherService.redeemVoucher(data.voucher_code, oldInvoice.id, manager);
      }

      // Re-redeem current ones from payment_details
      if (data.payment_details && Array.isArray(data.payment_details)) {
        for (const pm of data.payment_details) {
          const mode = String(pm?.mode || '').trim().toLowerCase();
          const reference = pm?.reference || pm?.coupon_no || pm?.receipt_number || pm?.external_no;

          if ((mode === 'credit coupon' || mode.includes('coupon')) && reference) {
            await creditCouponService.apply(String(reference), oldInvoice.id, pm.amount, manager);
          } else if (mode === 'order advance' || mode === 'advance' || mode.includes('advance')) {
            if (reference) {
              await salesOrderService.applyAdvance(String(reference), oldInvoice.id, pm.amount, manager);
            } else if (data.customer_mobile) {
              const customer = await manager.findOne(Customer, { where: { mobile: String(data.customer_mobile).trim() } });
              if (!customer) throw new Error('Customer not found for advance allocation');

              const candidates: { receipt_number: string | null; id: string; remaining_amount: any }[] = await manager.query(
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

              let remainingToApply = Number(pm.amount || 0);
              for (const c of candidates) {
                if (remainingToApply <= 0) break;
                const applyAmt = Math.min(Number(c.remaining_amount || 0), remainingToApply);
                if (applyAmt <= 0) continue;
                await salesOrderService.applyAdvance(String(c.receipt_number || c.id), oldInvoice.id, applyAmt, manager);
                remainingToApply -= applyAmt;
              }
            }
          }
        }
      }

      await manager.save(SalesInvoice, { id, ...updateData });
      
      await manager.delete(SalesInvoiceItem, { invoice_id: id });
      if (data.items && data.items.length > 0) {
        for (const item of data.items) {
          if (item.barcode_8digit) {
            const batch = await manager.findOne(BarcodeBatch, { where: { barcode_alias_8digit: item.barcode_8digit } });
            if (batch) {
              const qty = Number(item.quantity) || 1;
              batch.available_quantity -= qty;
              await manager.save(batch);
            }
          }
          await manager.save(SalesInvoiceItem, {
            invoice_id: id,
            ...item,
            delivered: item.delivered || false,
            on_approval: item.on_approval || false
          });
        }
      }

      return manager.findOne(SalesInvoice, { where: { id }, relations: ['items'] });
    });
  }

  async getGroundTruth(id: string) {
    const invoice = await AppDataSource.getRepository(SalesInvoice).findOne({
      where: { id },
      relations: [
        'items', 
        'receipt_items', 
        'coupon_applications', 
        'credit_note_applications', 
        'advance_applications',
        'sales_returns'
      ]
    });

    if (!invoice) return null;

    // 1. Calculate True Original Net (Before returns)
    const trueTotalMrp = (invoice.items || []).reduce((sum, i) => sum + (Number(i.mrp || 0) * Number(i.quantity || 1)), 0);
    const itemSum = (invoice.items || []).reduce((sum, i) => sum + (Number(i.discount || 0) * Number(i.quantity || 1)), 0);
    
    const headerSum = Number(invoice.special_discount || 0) + 
                      Number(invoice.loyalty_redemption_amount || 0) + 
                      Number(invoice.voucher_discount || 0);

    const finalDiscount = (Math.round(itemSum) >= Math.round(headerSum) && headerSum > 0) 
      ? itemSum 
      : (itemSum + headerSum);
    
    const originalNet = Math.round(Math.max(0, 
      trueTotalMrp 
      - finalDiscount 
      + Number(invoice.additional_charges_total || 0)
    ));

    // 2. Account for returns
    const returnsAmt = (invoice.sales_returns || []).reduce((sum, r) => sum + Number(r.total_return_amount || 0), 0);
    const trueNetPayable = Math.max(0, originalNet - returnsAmt);

    // 3. Calculate True Paid
    const receiptPaid = (invoice.receipt_items || []).reduce((sum, ri) => sum + Number(ri.amount_paid || 0), 0);
    const advancesPaid = (invoice.advance_applications || []).reduce((sum, aa) => sum + Number(aa.amount_applied || 0), 0);
    const couponsApplied = (invoice.coupon_applications || []).reduce((sum, ca) => sum + Number(ca.amount_applied || 0), 0);
    const creditNotesApplied = (invoice.credit_note_applications || []).reduce((sum, cna) => sum + Number(cna.amount_applied || 0), 0);
    
    let directPaid = 0;
    const pd = typeof invoice.payment_details === 'string' ? JSON.parse(invoice.payment_details || '[]') : (invoice.payment_details || []);
    if (Array.isArray(pd)) {
      directPaid = pd.reduce((sum: number, p: any) => {
        const mode = (p.mode || '').toString().toUpperCase();
        if (mode.includes('APPROVAL')) return sum;
        return sum + (Number(p.amount || 0));
      }, 0);
    } else if (pd && typeof pd === 'object') {
      directPaid = Object.entries(pd).reduce((sum: number, [key, val]: [string, any]) => {
        const mode = key.toUpperCase();
        if (mode.includes('APPROVAL')) return sum;
        return sum + (Number(val) || 0);
      }, 0);
    }

    const trueAmountPaid = receiptPaid + directPaid + advancesPaid + couponsApplied + creditNotesApplied;
    const trueAmountPending = Math.max(0, trueNetPayable - trueAmountPaid);

    return {
      total_mrp: trueTotalMrp,
      total_discount: finalDiscount,
      original_net_payable: originalNet,
      net_payable: trueNetPayable,
      amount_paid: trueAmountPaid,
      amount_pending: trueAmountPending,
      items: invoice.items
    };
  }
}

export const salesService = new SalesService();
