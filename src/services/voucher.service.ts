import { AppDataSource } from '../config/data-source';
import { Voucher } from '../entities/Voucher';
import { DiscountMaster } from '../entities/DiscountMaster';
import { SalesInvoice } from '../entities/SalesInvoice';
import { ILike, In } from 'typeorm';

export class VoucherService {
  private voucherRepo = AppDataSource.getRepository(Voucher);
  private discountRepo = AppDataSource.getRepository(DiscountMaster);

  async validateVoucher(code: string) {
    const voucher = await this.voucherRepo.findOne({
      where: { voucher_code: ILike(code) },
      relations: ['discount_master']
    });

    if (!voucher) {
      throw new Error('Invalid voucher code');
    }

    if (voucher.is_redeemed) {
      throw new Error('Voucher already redeemed');
    }

    if (voucher.expiry_date && new Date(voucher.expiry_date) < new Date()) {
      throw new Error('Voucher expired');
    }

    const dm = voucher.discount_master;
    if (!dm || !dm.is_active) {
      throw new Error('Associated discount is inactive');
    }

    return voucher;
  }

  async redeemVoucher(code: string, invoiceId: string, manager?: any) {
    const repo = manager ? manager.getRepository(Voucher) : this.voucherRepo;
    const voucher = await repo.findOne({ where: { voucher_code: ILike(code) } });
    
    if (!voucher) throw new Error('Voucher not found');
    if (voucher.is_redeemed) throw new Error('Voucher already redeemed');

    voucher.is_redeemed = true;
    voucher.redeemed_at = new Date();
    voucher.redeemed_in_invoice_id = invoiceId;

    return repo.save(voucher);
  }

  async generateVouchers(data: { 
    discount_master_id: string; 
    prefix: string; 
    start_no: number; 
    end_no: number; 
    expiry_date?: string 
  }) {
    const dm = await this.discountRepo.findOneBy({ id: data.discount_master_id });
    if (!dm) throw new Error('Discount master not found');

    const codes = [];
    for (let i = data.start_no; i <= data.end_no; i++) {
      codes.push(`${data.prefix}${i.toString().padStart(4, '0')}`);
    }

    // Check for existing vouchers in the range to prevent duplicate key errors
    const existing = await this.voucherRepo.find({
      where: { voucher_code: In(codes) }
    });

    if (existing.length > 0) {
      const dups = existing.map(v => v.voucher_code).slice(0, 5).join(', ');
      throw new Error(`Duplicate voucher(s) found: ${dups}${existing.length > 5 ? '...' : ''}. Please use a different range or prefix.`);
    }

    const vouchers: Voucher[] = codes.map(code => 
      this.voucherRepo.create({
        voucher_code: code,
        discount_master_id: dm.id,
        expiry_date: data.expiry_date ? new Date(data.expiry_date) : undefined
      })
    );

    return this.voucherRepo.save(vouchers);
  }

  async findAll(filters: any) {
    return this.voucherRepo.find({
      relations: ['discount_master', 'redeemed_in_invoice'],
      order: { created_at: 'DESC' },
      where: filters
    });
  }
}

export const voucherService = new VoucherService();
