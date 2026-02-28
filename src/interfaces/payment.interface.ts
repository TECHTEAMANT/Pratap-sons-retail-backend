export interface PaymentReceipt {
  id: string;
  receipt_number: string;
  receipt_date: string;
  invoice_id: string;
  invoice_number: string;
  customer_mobile: string;
  customer_name: string;
  amount_received: number;
  payment_mode: string;
  reference_number: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: Date;
}

export interface CreatePaymentReceiptDTO {
  invoice_id: string;
  invoice_number: string;
  customer_mobile: string;
  customer_name: string;
  amount_received: number;
  payment_mode: string;
  reference_number?: string;
  notes?: string;
}
