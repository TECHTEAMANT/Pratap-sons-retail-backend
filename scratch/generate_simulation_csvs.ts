import { AppDataSource, initializeDatabase } from '../src/config/data-source';
import * as fs from 'fs';
import * as path from 'path';

async function generateSimulationCSVs() {
  try {
    console.log('Connecting to database...');
    await initializeDatabase();
    console.log('Connected. Running simulation query...');

    const query = `
      WITH all_designs AS (
          SELECT DISTINCT design_no FROM product_masters
          UNION
          SELECT DISTINCT design_no FROM purchase_items WHERE design_no IS NOT NULL AND design_no != ''
          UNION
          SELECT DISTINCT design_no FROM barcode_batches WHERE design_no IS NOT NULL AND design_no != '' AND status != 'deleted'
          UNION
          SELECT DISTINCT design_no FROM sales_invoice_items WHERE design_no IS NOT NULL AND design_no != ''
          UNION
          SELECT DISTINCT design_no FROM sales_return_items WHERE design_no IS NOT NULL AND design_no != ''
      ),
      purchase_summary AS (
          SELECT design_no, SUM(quantity) as purchase_qty, COUNT(DISTINCT po_id) as purchase_invoices_count
          FROM purchase_items
          GROUP BY design_no
      ),
      purchase_invoices_summary AS (
          SELECT 
              pi.design_no,
              string_agg(DISTINCT COALESCE(po.invoice_number, po.po_number), ', ') as purchase_invoices_list
          FROM purchase_items pi
          INNER JOIN purchase_orders po ON po.id = pi.po_id
          WHERE pi.design_no IS NOT NULL AND pi.design_no != ''
          GROUP BY pi.design_no
      ),
      sales_summary AS (
          SELECT design_no, SUM(quantity) as sales_qty, COUNT(DISTINCT invoice_id) as sales_invoices_count
          FROM sales_invoice_items
          GROUP BY design_no
      ),
      sales_invoices_summary AS (
          SELECT 
              sii.design_no,
              string_agg(DISTINCT si.invoice_number, ', ') as sales_invoices_list
          FROM sales_invoice_items sii
          INNER JOIN sales_invoices si ON si.id = sii.invoice_id
          WHERE sii.design_no IS NOT NULL AND sii.design_no != ''
          GROUP BY sii.design_no
      ),
      sales_return_summary AS (
          SELECT design_no, SUM(quantity) as sales_return_qty
          FROM sales_return_items
          GROUP BY design_no
      ),
      barcode_summary AS (
          SELECT 
              design_no, 
              SUM(available_quantity) as available_stock, 
              SUM(total_quantity) as total_printed_stock,
              COUNT(id) as total_barcodes,
              string_agg(DISTINCT barcode_alias_8digit, ', ') as barcodes_list
          FROM barcode_batches
          WHERE status != 'deleted'
          GROUP BY design_no
      ),
      purchase_return_summary AS (
          SELECT 
              bb.design_no, 
              SUM(pri.quantity) as purchase_return_qty
          FROM purchase_return_items pri
          INNER JOIN barcode_batches bb ON bb.barcode_alias_8digit = pri.barcode_id
          WHERE bb.status != 'deleted'
          GROUP BY bb.design_no
      ),
      design_vendors AS (
          SELECT DISTINCT ON (design_no)
              design_no,
              vendor_name
          FROM (
              SELECT pm.design_no, v.name as vendor_name, 1 as priority
              FROM product_masters pm
              INNER JOIN vendors v ON v.id::text = pm.vendor::text
              WHERE pm.design_no IS NOT NULL
              
              UNION ALL
              
              SELECT bb.design_no, v.name as vendor_name, 2 as priority
              FROM barcode_batches bb
              INNER JOIN vendors v ON v.id::text = bb.vendor::text
              WHERE bb.design_no IS NOT NULL AND bb.status != 'deleted'
              
              UNION ALL
              
              SELECT pi.design_no, v.name as vendor_name, 3 as priority
              FROM purchase_items pi
              INNER JOIN purchase_orders po ON po.id = pi.po_id
              INNER JOIN vendors v ON v.id::text = po.vendor::text
              WHERE pi.design_no IS NOT NULL
          ) as raw_vendors
          ORDER BY design_no, priority ASC
      )
      SELECT 
          ad.design_no,
          EXISTS(SELECT 1 FROM product_masters pm WHERE pm.design_no = ad.design_no) as exists_in_master,
          COALESCE(dv.vendor_name, 'UNKNOWN') as vendor_name,
          COALESCE(b.barcodes_list, '') as barcodes_list,
          COALESCE(pis.purchase_invoices_list, '') as purchase_invoices_list,
          COALESCE(p.purchase_qty, 0) as purchase_qty,
          COALESCE(p.purchase_invoices_count, 0) as purchase_invoices_count,
          COALESCE(pr.purchase_return_qty, 0) as purchase_return_qty,
          COALESCE(sis.sales_invoices_list, '') as sales_invoices_list,
          COALESCE(s.sales_qty, 0) as sales_qty,
          COALESCE(s.sales_invoices_count, 0) as sales_invoices_count,
          COALESCE(sr.sales_return_qty, 0) as sales_return_qty,
          COALESCE(b.available_stock, 0) as available_stock,
          COALESCE(b.total_printed_stock, 0) as total_printed_stock,
          COALESCE(b.total_barcodes, 0) as total_barcodes
      FROM all_designs ad
      LEFT JOIN purchase_summary p ON p.design_no = ad.design_no
      LEFT JOIN purchase_invoices_summary pis ON pis.design_no = ad.design_no
      LEFT JOIN purchase_return_summary pr ON pr.design_no = ad.design_no
      LEFT JOIN sales_summary s ON s.design_no = ad.design_no
      LEFT JOIN sales_invoices_summary sis ON sis.design_no = ad.design_no
      LEFT JOIN sales_return_summary sr ON sr.design_no = ad.design_no
      LEFT JOIN barcode_summary b ON b.design_no = ad.design_no
      LEFT JOIN design_vendors dv ON dv.design_no = ad.design_no
      ORDER BY ad.design_no ASC
    `;

    const results = await AppDataSource.query(query);
    
    const headers = [
      'Design Number',
      'Vendor Name',
      'Barcodes List',
      'Purchase Invoices List',
      'Sales Invoices List',
      'Exists in Master',
      'Purchase Quantity',
      'Purchase Invoices Count',
      'Purchase Return Quantity',
      'Sales Quantity',
      'Sales Invoices Count',
      'Sales Return Quantity',
      'Available Stock',
      'Total Printed Stock',
      'Total Barcodes Count',
      'Safety Category',
      'Action Recommended'
    ].map(h => `"${h}"`).join(',');

    const toDeleteRows: string[] = [headers];
    const postCleanupRows: string[] = [headers];

    for (const row of results) {
      const designNo = row.design_no || '';
      const vendorName = row.vendor_name || 'UNKNOWN';
      const barcodesList = row.barcodes_list || '';
      const purchaseInvoicesList = row.purchase_invoices_list || '';
      const salesInvoicesList = row.sales_invoices_list || '';
      const existsInMaster = row.exists_in_master ? 'TRUE' : 'FALSE';
      const purchaseQty = Number(row.purchase_qty);
      const purchaseInvoicesCount = Number(row.purchase_invoices_count);
      const purchaseReturnQty = Number(row.purchase_return_qty);
      const salesQty = Number(row.sales_qty);
      const salesInvoicesCount = Number(row.sales_invoices_count);
      const salesReturnQty = Number(row.sales_return_qty);
      const availableStock = Number(row.available_stock);
      const totalPrintedStock = Number(row.total_printed_stock);
      const totalBarcodes = Number(row.total_barcodes);

      let safetyCategory = '';
      let actionRecommended = '';
      let shouldDelete = false;

      if (purchaseQty > 0 || purchaseReturnQty > 0 || salesReturnQty > 0) {
        safetyCategory = 'ACTIVE_WITH_PURCHASE_HISTORY';
        actionRecommended = 'Keep: Has active purchase/return activity';
      } else {
        shouldDelete = true;
        if (salesQty > 0) {
          safetyCategory = 'ORPHAN_WITH_SALES';
          actionRecommended = 'Delete (Simulation): Sold but lacks purchase invoice in database';
        } else if (availableStock > 0 || totalPrintedStock > 0) {
          safetyCategory = 'ORPHAN_WITH_STOCK';
          actionRecommended = 'Delete (Simulation): Has physical stock/printed barcodes but no purchase record';
        } else {
          safetyCategory = 'SAFE_TO_DELETE_IDLE';
          actionRecommended = 'Delete (Simulation): No purchases, returns, sales, or stock';
        }
      }

      const escapedDesign = `"${designNo.replace(/"/g, '""')}"`;
      const escapedVendorName = `"${vendorName.replace(/"/g, '""')}"`;
      const escapedBarcodesList = `"${barcodesList.replace(/"/g, '""')}"`;
      const escapedPurchaseInvoicesList = `"${purchaseInvoicesList.replace(/"/g, '""')}"`;
      const escapedSalesInvoicesList = `"${salesInvoicesList.replace(/"/g, '""')}"`;
      
      const csvLine = [
        escapedDesign,
        escapedVendorName,
        escapedBarcodesList,
        escapedPurchaseInvoicesList,
        escapedSalesInvoicesList,
        existsInMaster,
        purchaseQty,
        purchaseInvoicesCount,
        purchaseReturnQty,
        salesQty,
        salesInvoicesCount,
        salesReturnQty,
        availableStock,
        totalPrintedStock,
        totalBarcodes,
        safetyCategory,
        `"${actionRecommended.replace(/"/g, '""')}"`
      ].join(',');

      if (shouldDelete) {
        toDeleteRows.push(csvLine);
      } else {
        postCleanupRows.push(csvLine);
      }
    }

    const deletePath = path.join(__dirname, 'designs_to_be_deleted_v3.csv');
    const postCleanupPath = path.join(__dirname, 'design_audit_post_cleanup_simulation_v3.csv');

    fs.writeFileSync(deletePath, toDeleteRows.join('\n'), 'utf8');
    fs.writeFileSync(postCleanupPath, postCleanupRows.join('\n'), 'utf8');

    console.log(`\nSimulation reports generated:`);
    console.log(`1. Proposed for Deletion (${toDeleteRows.length - 1} designs): ${deletePath}`);
    console.log(`2. Simulation of Active Inventory (${postCleanupRows.length - 1} designs): ${postCleanupPath}\n`);

    await AppDataSource.destroy();
  } catch (error) {
    console.error('Simulation failed:', error);
    process.exit(1);
  }
}

generateSimulationCSVs();
