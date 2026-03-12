-- Migration: Create salesmen table and update sales_invoices
CREATE TABLE IF NOT EXISTS salesmen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  salesman_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  mobile TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add PAN, Aadhar and Salesman ID to sales_invoices
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS pan_no TEXT;
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS aadhar_no TEXT;
ALTER TABLE sales_invoices ADD COLUMN IF NOT EXISTS salesman_id UUID REFERENCES salesmen(id);

-- Optional: Add salesman_id to sales_invoice_items if not already present
ALTER TABLE sales_invoice_items ADD COLUMN IF NOT EXISTS salesman_id UUID REFERENCES salesmen(id);
