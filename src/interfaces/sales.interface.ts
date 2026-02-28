export interface SalesInvoice {
  id: string;
  invoice_number: string;
  invoice_date: string;
  customer_mobile: string;
  customer_name: string;
  customer_id: string | null;
  total_mrp: number;
  total_discount: number;
  taxable_value: number;
  total_gst: number;
  gst_type: string;
  cgst_5: number;
  sgst_5: number;
  cgst_18: number;
  sgst_18: number;
  igst_5: number;
  igst_18: number;
  net_payable: number;
  payment_mode: string;
  amount_paid: number;
  amount_pending: number;
  payment_status: 'pending' | 'partial' | 'paid';
  sales_order_id: string | null;
  created_by: string | null;
  modified_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface SalesInvoiceItem {
  id: string;
  invoice_id: string;
  sr_no: number;
  barcode_8digit: string;
  design_no: string;
  product_description: string;
  hsn_code: string | null;
  quantity: number;
  mrp: number;
  discount: number;
  taxable_value: number;
  gst_percentage: number;
  gst_type: string;
  cgst_percentage: number;
  cgst_amount: number;
  sgst_percentage: number;
  sgst_amount: number;
  igst_percentage: number;
  igst_amount: number;
  total_value: number;
  selling_price: number;
  salesman_id: string | null;
  delivered: boolean;
  delivery_date: string | null;
  expected_delivery_date: string | null;
  created_at: Date;
}

export interface CreateSalesInvoiceDTO {
  invoice_date: string;
  customer_mobile: string;
  customer_name: string;
  customer_id?: string;
  total_mrp: number;
  total_discount: number;
  taxable_value: number;
  total_gst: number;
  gst_type?: string;
  cgst_5: number;
  sgst_5: number;
  cgst_18: number;
  sgst_18: number;
  igst_5?: number;
  igst_18?: number;
  net_payable: number;
  payment_mode: string;
  amount_paid: number;
  amount_pending: number;
  payment_status: string;
  items: CreateSalesInvoiceItemDTO[];
}

export interface CreateSalesInvoiceItemDTO {
  sr_no: number;
  barcode_8digit: string;
  design_no: string;
  product_description: string;
  hsn_code?: string;
  quantity: number;
  mrp: number;
  discount: number;
  taxable_value: number;
  gst_percentage: number;
  gst_type?: string;
  cgst_percentage: number;
  cgst_amount: number;
  sgst_percentage: number;
  sgst_amount: number;
  igst_percentage?: number;
  igst_amount?: number;
  total_value: number;
  selling_price: number;
  salesman_id?: string;
  delivered?: boolean;
  delivery_date?: string;
  expected_delivery_date?: string;
}

export interface SalesOrder {
  id: string;
  order_number: string;
  customer_id: string;
  order_date: string;
  expected_delivery_date: string | null;
  status: 'pending' | 'partial' | 'completed' | 'cancelled';
  total_amount: number;
  advance_received: number;
  balance_amount: number;
  attachment_url: string | null;
  notes: string;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface SalesReturn {
  id: string;
  return_number: string;
  return_date: string;
  invoice_id: string;
  invoice_number: string;
  customer_mobile: string;
  customer_name: string;
  return_reason: string;
  total_return_amount: number;
  credit_note_number: string | null;
  status: 'pending' | 'completed' | 'cancelled';
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreditNote {
  id: string;
  credit_note_number: string;
  credit_date: string;
  customer_mobile: string;
  customer_name: string;
  return_id: string;
  invoice_id: string;
  credit_amount: number;
  balance_used: number;
  balance_remaining: number;
  status: 'active' | 'partially_used' | 'fully_used' | 'expired';
  notes: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}
