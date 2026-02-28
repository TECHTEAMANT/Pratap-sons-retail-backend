export interface Customer {
  id: string;
  mobile: string;
  name: string;
  city: string | null;
  pincode: string | null;
  status: 'active' | 'inactive';
  last_purchase_date: string | null;
  first_purchase_date: string | null;
  notes: string | null;
  loyalty_points: number;
  credit_balance: number;
  total_returns: number;
  return_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateCustomerDTO {
  mobile: string;
  name: string;
  city?: string;
  pincode?: string;
  notes?: string;
}

export interface UpdateCustomerDTO {
  name?: string;
  city?: string;
  pincode?: string;
  status?: string;
  notes?: string;
}
