import fs from 'fs';

const filePath = 'src/services/report.service.ts';
let content = fs.readFileSync(filePath, 'utf8');

const stockLedgerFunc = `
  // Stock Ledger Report
  async stockLedgerReport(filters: { startDate?: string, endDate?: string, page?: number, limit?: number, vendor?: number, vendorId?: number, productGroup?: number, design?: string, size?: number, color?: number, barcode?: string } | any) {
    const start = (filters.startDate || '').split('T')[0] || '2000-01-01';
    const end = (filters.endDate || '').split('T')[0] || '2099-12-31';
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const isExport = filters.limit === 100000;

    const whereClauses: string[] = ["t.barcode IS NOT NULL"];
    
    // Support both 'vendor' (legacy) and 'vendorId' (frontend standard)
    const targetVendor = filters.vendorId || filters.vendor;
    if (targetVendor) whereClauses.push(\`po.vendor = '\${targetVendor}'\`);
    
    if (filters.productGroup) whereClauses.push(\`bb_info.product_group = '\${filters.productGroup}'\`);
    if (filters.color) whereClauses.push(\`bb_info.color = '\${filters.color}'\`);
    if (filters.size) whereClauses.push(\`bb_info.size = '\${filters.size}'\`);
    if (filters.design) whereClauses.push(\`bb_info.design_no ILIKE '%\${filters.design}%'\`);
    if (filters.barcode) {
      whereClauses.push(\`(bb_info.barcode_structured ILIKE '%\${filters.barcode}%' OR bb_info.barcode_alias_8digit ILIKE '%\${filters.barcode}%')\`);
    }
    const whereSql = whereClauses.join(' AND ');

    const query = \`
      SELECT 
        agg.barcode,
        MAX(bb_info.barcode_structured) as structured_barcode,
        agg.design_no, 
        agg.product_group, 
        MAX(cl.name) as color,
        MAX(sz.name) as size,
        MAX(pi.hsn_code) as hsn,
        MAX(pi.cost_per_item) as cost,
        MAX(pi.mrp) as mrp,
        MAX(v.name) as vendor,
        COALESCE(MAX(po.invoice_number), MAX(agg.po_no)) as po_no,
        MAX(po.order_date) as po_date,
        agg.opening_stock,
        agg.purchased_qty,
        agg.sales_return_qty,
        agg.sold_qty,
        agg.purchase_return_qty,
        agg.closing_stock
      FROM (
        SELECT 
          t.barcode,
          t.design_no,
          t.product_group,
          MAX(t.po_no) as po_no,
          MAX(t.po_id::text)::uuid as po_id,
          MAX(t.color_id::text)::uuid as color_id,
          MAX(t.size_id::text)::uuid as size_id,
          SUM(t.opening_qty) as opening_stock,
          SUM(t.purchased_qty) as purchased_qty,
          SUM(t.sales_return_qty) as sales_return_qty,
          SUM(t.sold_qty) as sold_qty,
          SUM(t.purchase_return_qty) as purchase_return_qty,
          SUM(t.opening_qty + t.purchased_qty + t.sales_return_qty - t.sold_qty - t.purchase_return_qty) as closing_stock
        FROM (
        -- Purchases (opening): JOIN through barcode_batches so each batch gets its own qty
        -- This prevents negative stock caused by the old LIMIT 1 subquery picking the wrong barcode
        SELECT 
           COALESCE(bb.barcode_alias_8digit, 'NO_BARCODE: ' || COALESCE(po.invoice_number, po.po_number)) as barcode, 
           pi.design_no, pg.name as product_group,
           SUM(pi.quantity) as opening_qty, 0 as purchased_qty, 0 as sales_return_qty, 0 as sold_qty, 0 as purchase_return_qty,
           COALESCE(po.invoice_number, po.po_number) as po_no,
           po.id as po_id,
           pi.color as color_id,
           pi.size as size_id
        FROM purchase_items pi
        LEFT JOIN product_groups pg ON pg.id = pi.product_group
        INNER JOIN purchase_orders po ON po.id = pi.po_id
        LEFT JOIN barcode_batches bb ON bb.po_id = pi.po_id 
          AND bb.design_no = pi.design_no
          AND COALESCE(bb.color::text, '') = COALESCE(pi.color::text, '')
          AND bb.size = pi.size
          AND bb.status != 'deleted'
        WHERE po.order_date < '\${start}' AND po.status = 'Completed'
        GROUP BY bb.barcode_alias_8digit, pi.design_no, pg.name, po.invoice_number, po.po_number, po.id, pi.color, pi.size
        
        UNION ALL
        -- Purchases (period): same fix — JOIN through barcode_batches
        SELECT 
           COALESCE(bb.barcode_alias_8digit, 'NO_BARCODE: ' || COALESCE(po.invoice_number, po.po_number)) as barcode, 
           pi.design_no, pg.name as product_group,
           0, SUM(pi.quantity), 0, 0, 0,
           COALESCE(po.invoice_number, po.po_number) as po_no,
           po.id as po_id,
           pi.color as color_id,
           pi.size as size_id
        FROM purchase_items pi
        LEFT JOIN product_groups pg ON pg.id = pi.product_group
        INNER JOIN purchase_orders po ON po.id = pi.po_id
        LEFT JOIN barcode_batches bb ON bb.po_id = pi.po_id 
          AND bb.design_no = pi.design_no
          AND COALESCE(bb.color::text, '') = COALESCE(pi.color::text, '')
          AND bb.size = pi.size
          AND bb.status != 'deleted'
        WHERE po.order_date BETWEEN '\${start}' AND '\${end}' AND po.status = 'Completed'
        GROUP BY bb.barcode_alias_8digit, pi.design_no, pg.name, po.invoice_number, po.po_number, po.id, pi.color, pi.size
        
        UNION ALL
        -- Sales (opening)
        SELECT COALESCE(sii.barcode_8digit, bb.barcode_alias_8digit, 'UNBARCODED') as barcode, COALESCE(bb.design_no, 'UNKNOWN') as design_no, pg.name as product_group,
               -SUM(sii.quantity), 0, 0, 0, 0,
               NULL as po_no,
               bb.po_id,
               bb.color as color_id,
               bb.size as size_id
        FROM sales_invoice_items sii
        INNER JOIN sales_invoices si ON si.id = sii.invoice_id
        LEFT JOIN barcode_batches bb ON bb.barcode_alias_8digit = sii.barcode_8digit
        LEFT JOIN product_groups pg ON pg.id = bb.product_group
        WHERE si.invoice_date < '\${start}'
        GROUP BY 1, 2, 3, 9, 10, 11, 12
        
        UNION ALL
        -- Sales (period)
        SELECT COALESCE(sii.barcode_8digit, bb.barcode_alias_8digit, 'UNBARCODED') as barcode, COALESCE(bb.design_no, 'UNKNOWN') as design_no, pg.name as product_group,
               0, 0, 0, SUM(sii.quantity), 0,
               NULL as po_no,
               bb.po_id,
               bb.color as color_id,
               bb.size as size_id
        FROM sales_invoice_items sii
        INNER JOIN sales_invoices si ON si.id = sii.invoice_id
        LEFT JOIN barcode_batches bb ON bb.barcode_alias_8digit = sii.barcode_8digit
        LEFT JOIN product_groups pg ON pg.id = bb.product_group
        WHERE si.invoice_date BETWEEN '\${start}' AND '\${end}'
        GROUP BY 1, 2, 3, 9, 10, 11, 12
        
        UNION ALL
        -- Sales Returns (opening)
        SELECT COALESCE(sri.barcode_8digit, bb.barcode_alias_8digit, 'UNBARCODED') as barcode, COALESCE(bb.design_no, 'UNKNOWN') as design_no, pg.name as product_group,
               SUM(sri.quantity), 0, 0, 0, 0,
               NULL as po_no,
               bb.po_id,
               bb.color as color_id,
               bb.size as size_id
        FROM sales_return_items sri
        INNER JOIN sales_returns sr ON sr.id = sri.return_id
        LEFT JOIN barcode_batches bb ON bb.barcode_alias_8digit = sri.barcode_8digit
        LEFT JOIN product_groups pg ON pg.id = bb.product_group
        WHERE sr.return_date < '\${start}'
        GROUP BY 1, 2, 3, 9, 10, 11, 12
        
        UNION ALL
        -- Sales Returns (period)
        SELECT COALESCE(sri.barcode_8digit, bb.barcode_alias_8digit, 'UNBARCODED') as barcode, COALESCE(bb.design_no, 'UNKNOWN') as design_no, pg.name as product_group,
               0, 0, SUM(sri.quantity), 0, 0,
               NULL as po_no,
               bb.po_id,
               bb.color as color_id,
               bb.size as size_id
        FROM sales_return_items sri
        INNER JOIN sales_returns sr ON sr.id = sri.return_id
        LEFT JOIN barcode_batches bb ON bb.barcode_alias_8digit = sri.barcode_8digit
        LEFT JOIN product_groups pg ON pg.id = bb.product_group
        WHERE sr.return_date BETWEEN '\${start}' AND '\${end}'
        GROUP BY 1, 2, 3, 9, 10, 11, 12
        
        UNION ALL
        -- Purchase Returns (opening)
        SELECT COALESCE(bb.barcode_alias_8digit, 'UNBARCODED') as barcode, COALESCE(bb.design_no, 'UNKNOWN') as design_no, pg.name as product_group,
               -SUM(pri.quantity), 0, 0, 0, 0,
               NULL as po_no,
               bb.po_id,
               bb.color as color_id,
               bb.size as size_id
        FROM purchase_return_items pri
        INNER JOIN purchase_returns pr ON pr.id = pri.return_id
        LEFT JOIN barcode_batches bb ON bb.id = pri.item_id
        LEFT JOIN product_groups pg ON pg.id = bb.product_group
        WHERE pr.return_date < '\${start}'
        GROUP BY 1, 2, 3, 9, 10, 11, 12
        
        UNION ALL
        -- Purchase Returns (period)
        SELECT COALESCE(bb.barcode_alias_8digit, 'UNBARCODED') as barcode, COALESCE(bb.design_no, 'UNKNOWN') as design_no, pg.name as product_group,
               0, 0, 0, 0, SUM(pri.quantity),
               NULL as po_no,
               bb.po_id,
               bb.color as color_id,
               bb.size as size_id
        FROM purchase_return_items pri
        INNER JOIN purchase_returns pr ON pr.id = pri.return_id
        LEFT JOIN barcode_batches bb ON bb.id = pri.item_id
        LEFT JOIN product_groups pg ON pg.id = bb.product_group
        WHERE pr.return_date BETWEEN '\${start}' AND '\${end}'
        GROUP BY 1, 2, 3, 9, 10, 11, 12
        ) t
        WHERE t.barcode IS NOT NULL
        GROUP BY t.barcode, t.design_no, t.product_group
      ) agg
      LEFT JOIN (
         SELECT DISTINCT ON (barcode_alias_8digit) 
            barcode_alias_8digit, barcode_structured, po_id, design_no, color, size, product_group
         FROM barcode_batches
      ) bb_info ON bb_info.barcode_alias_8digit = agg.barcode
      LEFT JOIN purchase_orders po ON po.id = COALESCE(bb_info.po_id, agg.po_id)
      LEFT JOIN purchase_items pi ON pi.po_id = COALESCE(bb_info.po_id, agg.po_id) AND pi.design_no = agg.design_no 
         AND (pi.color = COALESCE(bb_info.color, agg.color_id) OR (pi.color IS NULL AND COALESCE(bb_info.color, agg.color_id) IS NULL)) 
         AND (pi.size = COALESCE(bb_info.size, agg.size_id) OR (pi.size IS NULL AND COALESCE(bb_info.size, agg.size_id) IS NULL))
      LEFT JOIN colors cl ON cl.id = COALESCE(bb_info.color, agg.color_id)
      LEFT JOIN sizes sz ON sz.id = COALESCE(bb_info.size, agg.size_id)
      LEFT JOIN vendors v ON v.id = po.vendor
      WHERE \${whereSql.replace(/t\\.barcode/g, 'agg.barcode')}
      GROUP BY agg.barcode, agg.design_no, agg.product_group, agg.opening_stock, agg.purchased_qty, agg.sales_return_qty, agg.sold_qty, agg.purchase_return_qty, agg.closing_stock
      HAVING agg.opening_stock != 0 OR agg.purchased_qty != 0 OR agg.sales_return_qty != 0 OR agg.sold_qty != 0 OR agg.purchase_return_qty != 0
      ORDER BY agg.barcode ASC
      LIMIT \${limit} OFFSET \${(page - 1) * limit}
    \`;

    // Only get total count if we need pagination (not export mode)
    let totalCount = 0;
    if (!isExport) {
      const countQuery = \`
        SELECT COUNT(*) as count FROM (
          SELECT t.barcode FROM (
            SELECT bb.barcode_alias_8digit as barcode FROM barcode_batches bb LEFT JOIN purchase_orders po ON po.id = bb.po_id WHERE po.order_date <= '\${end}' AND bb.status != 'deleted'
            UNION ALL SELECT bb.barcode_alias_8digit as barcode FROM sales_invoice_items sii INNER JOIN sales_invoices si ON si.id = sii.invoice_id LEFT JOIN barcode_batches bb ON bb.barcode_alias_8digit = sii.barcode_8digit WHERE si.invoice_date <= '\${end}'
            UNION ALL SELECT bb.barcode_alias_8digit as barcode FROM sales_return_items sri INNER JOIN sales_returns sr ON sr.id = sri.return_id LEFT JOIN barcode_batches bb ON bb.barcode_alias_8digit = sri.barcode_8digit WHERE sr.return_date <= '\${end}'
            UNION ALL SELECT bb.barcode_alias_8digit as barcode FROM purchase_return_items pri INNER JOIN purchase_returns pr ON pr.id = pri.return_id LEFT JOIN barcode_batches bb ON bb.id = pri.item_id WHERE pr.return_date <= '\${end}'
          ) as t
          LEFT JOIN (
             SELECT DISTINCT ON (barcode_alias_8digit) 
                barcode_alias_8digit, barcode_structured, po_id, design_no, color, size, product_group
             FROM barcode_batches
          ) bb_info ON bb_info.barcode_alias_8digit = t.barcode
          LEFT JOIN purchase_orders po ON po.id = bb_info.po_id
          WHERE \${whereSql}
          GROUP BY t.barcode
        ) as cnt
      \`;
      const countRes = await AppDataSource.query(countQuery);
      totalCount = parseInt(countRes[0]?.count || 0);
    }

    const rows = await AppDataSource.query(query);
    
    // Convert to integers
    const data = rows.map((r: any) => ({
      barcode: r.barcode || 'N/A',
      structured_barcode: r.structured_barcode || 'N/A',
      design_no: r.design_no || 'N/A',
      product_group: r.product_group || '-',
      color: r.color || '-',
      size: r.size || '-',
      hsn: r.hsn || '-',
      cost: Number(r.cost || 0),
      mrp: Number(r.mrp || 0),
      vendor: r.vendor || '-',
      po_no: r.po_no || '-',
      po_date: r.po_date || '-',
      opening_stock: parseInt(r.opening_stock) || 0,
      purchased_qty: parseInt(r.purchased_qty) || 0,
      sales_return_qty: parseInt(r.sales_return_qty) || 0,
      sold_qty: parseInt(r.sold_qty) || 0,
      purchase_return_qty: parseInt(r.purchase_return_qty) || 0,
      closing_stock: parseInt(r.closing_stock) || 0
    }));

    // Calculate Summary
    const summary = data.reduce((acc: any, row: any) => {
      acc.totalOpening += row.opening_stock;
      acc.totalPurchased += row.purchased_qty;
      acc.totalSalesReturn += row.sales_return_qty;
      acc.totalSold += row.sold_qty;
      acc.totalPurchaseReturn += row.purchase_return_qty;
      acc.totalClosing += row.closing_stock;
      return acc;
    }, { totalOpening: 0, totalPurchased: 0, totalSalesReturn: 0, totalSold: 0, totalPurchaseReturn: 0, totalClosing: 0 });

    return {
      data,
      summary,
      pagination: {
        page,
        limit,
        totalItems: isExport ? data.length : totalCount,
        totalPages: isExport ? 1 : Math.ceil(totalCount / limit)
      }
    };
  }
`;

const insertIndex = content.lastIndexOf('}\n\nexport const reportService');
if (insertIndex !== -1) {
  const newContent = content.substring(0, insertIndex) + stockLedgerFunc + content.substring(insertIndex);
  fs.writeFileSync(filePath, newContent);
  console.log("SUCCESS: Re-added stockLedgerReport");
} else {
  console.log("ERROR: Could not find insert location");
}
