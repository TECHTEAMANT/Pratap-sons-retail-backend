export interface PurchaseOrder {
  id: string;
  order_number: string;
  vendor_id: string;
  order_date: string;
  taxable_value: number;
  manual_gst_amount: number | null;
  vendor_invoice_attachment: string | null;
  gst_difference_reason: string | null;
  total_amount: number;
  status: string;
  notes: string | null;
  created_by: string | null;
  modified_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PurchaseOrderItem {
  id: string;
  purchase_order_id: string;
  design_no: string;
  product_group: string;
  size: string;
  color: string | null;
  quantity: number;
  cost: number;
  mrp: number;
  hsn_code: string | null;
  created_at: Date;
}

export interface PurchaseReturn {
  id: string;
  return_number: string;
  vendor_id: string;
  original_po_id: string | null;
  return_date: string;
  total_items: number;
  total_amount: number;
  reason: string | null;
  notes: string | null;
  status: string;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PurchaseReturnItem {
  id: string;
  return_id: string;
  barcode_alias: string;
  design_no: string;
  hsn_code: string | null;
  quantity: number;
  cost: number;
  reason: string | null;
  condition: string;
  created_at: Date;
}
