export interface ProductGroup {
  id: string;
  group_code: string;
  name: string;
  description: string;
  hsn_code: string;
  floor: string | null;
  created_at: Date;
}

export interface Size {
  id: string;
  size_code: string;
  name: string;
  sort_order: number;
  created_at: Date;
}

export interface Color {
  id: string;
  color_code: string;
  name: string;
  hex_value: string;
  created_at: Date;
}

export interface Vendor {
  id: string;
  vendor_code: string;
  name: string;
  address: string;
  gstin: string;
  mobile: string;
  st_number: string | null;
  active: boolean;
  created_at: Date;
}

export interface Floor {
  id: string;
  floor_code: string;
  name: string;
  description: string;
  active: boolean;
  created_at: Date;
}

export interface City {
  id: string;
  name: string;
  state: string | null;
  pincode: string | null;
  created_at: Date;
}

export interface DiscountMaster {
  id: string;
  flag_name: string;
  discount_type: 'percentage' | 'flat';
  default_value: number;
  discount_code: string | null;
  discount_name: string | null;
  discount_value: number | null;
  applicable_product_groups: string[];
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  active: boolean;
  priority: number;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PayoutCode {
  id: string;
  payout_code: string;
  payout_name: string;
  payout_type: string;
  applicable_product_groups: string[];
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CommissionSlab {
  id: string;
  product_group_name: string;
  payout_code_id: string;
  min_amount: number;
  max_amount: number | null;
  commission_percentage: number;
  flat_amount: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface TallySync {
  id: string;
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  customer_name: string | null;
  customer_mobile: string | null;
  total_amount: number;
  sync_data: any;
  sync_status: 'pending' | 'synced' | 'failed';
  synced_at: Date | null;
  error_message: string | null;
  po_id: string | null;
  po_number: string | null;
  vendor_name: string | null;
  record_type: string | null;
  created_at: Date;
  updated_at: Date;
}
