export interface BarcodeBatch {
  id: string;
  barcode_alias_8digit: string;
  barcode_structured: string;
  design_no: string;
  product_group: string;
  size: string;
  color: string;
  vendor: string;
  payout_code: string | null;
  cost_actual: number;
  cost_encoded: string | null;
  mrp: number;
  hsn_code: string | null;
  gst_logic: 'AUTO_5_18' | 'FLAT_5';
  total_quantity: number;
  available_quantity: number;
  floor: string | null;
  discount_type: 'percentage' | 'flat' | null;
  discount_value: number | null;
  discount_start_date: string | null;
  discount_end_date: string | null;
  status: 'active' | 'inactive';
  po_id: string | null;
  photos: string[];
  description: string | null;
  created_by: string | null;
  modified_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateBarcodeBatchDTO {
  design_no: string;
  product_group: string;
  size: string;
  color?: string;
  vendor: string;
  payout_code?: string;
  cost_actual: number;
  mrp: number;
  hsn_code?: string;
  gst_logic?: string;
  total_quantity: number;
  floor?: string;
  discount_type?: string;
  discount_value?: number;
  discount_start_date?: string;
  discount_end_date?: string;
  po_id?: string;
  photos?: string[];
  description?: string;
}

export interface ProductMaster {
  id: string;
  design_no: string;
  product_group: string;
  color: string;
  vendor: string;
  mrp: number;
  gst_logic: string;
  hsn_code: string | null;
  floor: string | null;
  photos: string[];
  description: string;
  barcodes_per_item: number;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface BarcodePrintLog {
  id: string;
  barcode_alias: string;
  barcode_batch_id: string | null;
  quantity_printed: number;
  reason: string;
  printed_by: string;
  printed_at: Date;
}

export interface DefectiveStock {
  id: string;
  barcode_batch_id: string;
  barcode_alias: string;
  quantity: number;
  reason: string;
  notes: string | null;
  status: string;
  reported_by: string;
  created_at: Date;
  updated_at: Date;
}
