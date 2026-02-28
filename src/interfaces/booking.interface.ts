export interface EBooking {
  id: string;
  booking_number: string;
  customer_mobile: string;
  barcode_8digit: string;
  floor: string | null;
  booking_date: Date;
  booking_expiry: Date | null;
  status: 'booked' | 'invoiced' | 'cancelled' | 'expired';
  invoice_number: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreateBookingDTO {
  customer_mobile: string;
  barcode_8digit: string;
  floor?: string;
  booking_expiry?: string;
  notes?: string;
}
