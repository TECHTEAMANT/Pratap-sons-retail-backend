const { Client } = require('pg');
require('dotenv').config();

const SQL_CONTENT = `-- Add salesman_id to sales_orders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sales_orders' AND column_name = 'salesman_id'
  ) THEN
    ALTER TABLE sales_orders ADD COLUMN salesman_id uuid REFERENCES salesmen(id);
  END IF;
END $$;

-- Add salesman_id to sales_order_items
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sales_order_items' AND column_name = 'salesman_id'
  ) THEN
    ALTER TABLE sales_order_items ADD COLUMN salesman_id uuid REFERENCES salesmen(id);
  END IF;
END $$;

-- Add receipt_number to sales_order_advances
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'sales_order_advances' AND column_name = 'receipt_number'
  ) THEN
    ALTER TABLE sales_order_advances ADD COLUMN receipt_number text UNIQUE;
  END IF;
END $$;

-- Improved generate_invoice_transaction RPC
CREATE OR REPLACE FUNCTION generate_invoice_transaction(
  p_invoice_data JSONB,
  p_items JSONB
) RETURNS JSONB AS $$
DECLARE
  v_invoice_id UUID;
  v_invoice_number TEXT;
  v_prefix TEXT;
  v_next_num INTEGER;
  v_item JSONB;
BEGIN
  v_prefix := 'INV' || to_char(now(), 'YY') || to_char(now() + interval '1 year', 'YY');
  LOCK TABLE sales_invoices IN EXCLUSIVE MODE;
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM length(v_prefix) + 1) AS integer)), 0) + 1
  INTO v_next_num
  FROM sales_invoices
  WHERE invoice_number LIKE v_prefix || '%';
  v_invoice_number := v_prefix || lpad(v_next_num::text, 6, '0');

  INSERT INTO sales_invoices (
    invoice_number, invoice_date, customer_mobile, customer_name,
    total_mrp, total_discount, taxable_value, total_gst, gst_type,
    net_payable, payment_mode, amount_paid, amount_pending, payment_status,
    created_by, cgst_5, sgst_5, cgst_18, sgst_18, igst_5, igst_18,
    customer_id, salesman_id
  ) VALUES (
    v_invoice_number,
    COALESCE((p_invoice_data->>'invoice_date')::DATE, now()::DATE),
    p_invoice_data->>'customer_mobile',
    p_invoice_data->>'customer_name',
    (p_invoice_data->>'total_mrp')::NUMERIC,
    (p_invoice_data->>'total_discount')::NUMERIC,
    (p_invoice_data->>'taxable_value')::NUMERIC,
    (p_invoice_data->>'total_gst')::NUMERIC,
    (p_invoice_data->>'gst_type')::text::gst_transaction_type,
    (p_invoice_data->>'net_payable')::NUMERIC,
    p_invoice_data->>'payment_mode',
    (p_invoice_data->>'amount_paid')::NUMERIC,
    (p_invoice_data->>'amount_pending')::NUMERIC,
    p_invoice_data->>'payment_status',
    (p_invoice_data->>'created_by')::UUID,
    (p_invoice_data->>'cgst_5')::NUMERIC,
    (p_invoice_data->>'sgst_5')::NUMERIC,
    (p_invoice_data->>'cgst_18')::NUMERIC,
    (p_invoice_data->>'sgst_18')::NUMERIC,
    (p_invoice_data->>'igst_5')::NUMERIC,
    (p_invoice_data->>'igst_18')::NUMERIC,
    (p_invoice_data->>'customer_id')::UUID,
    (p_invoice_data->>'salesman_id')::UUID
  ) RETURNING id INTO v_invoice_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    UPDATE barcode_batches SET available_quantity = available_quantity - 1, updated_at = NOW()
    WHERE barcode_alias_8digit = v_item->>'barcode_8digit';

    INSERT INTO sales_invoice_items (
      invoice_id, sr_no, barcode_8digit, design_no, product_description,
      hsn_code, quantity, mrp, discount, taxable_value,
      gst_percentage, gst_type, cgst_percentage, cgst_amount,
      sgst_percentage, sgst_amount, igst_percentage, igst_amount,
      total_value, selling_price, salesman_id, delivered, delivery_date, expected_delivery_date
    ) VALUES (
      v_invoice_id, (v_item->>'sr_no')::INTEGER, v_item->>'barcode_8digit',
      v_item->>'design_no', v_item->>'product_description', v_item->>'hsn_code',
      1, (v_item->>'mrp')::NUMERIC, (v_item->>'discount')::NUMERIC,
      (v_item->>'taxable_value')::NUMERIC, (v_item->>'gst_percentage')::NUMERIC,
      (v_item->>'gst_type')::text::gst_transaction_type,
      (v_item->>'cgst_percentage')::NUMERIC, (v_item->>'cgst_amount')::NUMERIC,
      (v_item->>'sgst_percentage')::NUMERIC, (v_item->>'sgst_amount')::NUMERIC,
      (v_item->>'igst_percentage')::NUMERIC, (v_item->>'igst_amount')::NUMERIC,
      (v_item->>'total_value')::NUMERIC, (v_item->>'selling_price')::NUMERIC,
      (v_item->>'salesman_id')::UUID, (v_item->>'delivered')::BOOLEAN,
      (v_item->>'delivery_date')::DATE, (v_item->>'expected_delivery_date')::DATE
    );
  END LOOP;
  RETURN jsonb_build_object('id', v_invoice_id, 'invoice_number', v_invoice_number);
END;
$$ LANGUAGE plpgsql;`;

async function applyMigration() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'Root@123',
    database: process.env.DB_NAME || 'invento_erp',
  });

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected successfully.');

    console.log('Applying migration logic directly...');
    await client.query(SQL_CONTENT);
    
    console.log('SUCCESS: Migration applied successfully!');
    console.log('You can now restart your backend server with "npm run dev".');

  } catch (err) {
    console.error('ERROR applying migration:', err.message);
  } finally {
    await client.end();
  }
}

applyMigration();
