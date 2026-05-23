import fs from 'fs';

const filePath = 'src/services/report.service.ts';
let content = fs.readFileSync(filePath, 'utf8');

const regex = /(-- Purchases \(opening\))[\s\S]*?(^      \) agg)/m;
const match = content.match(regex);

if (!match) {
  console.log("Could not find the block");
  process.exit(1);
}

const replacement = `-- Purchases (opening)
        SELECT 
           COALESCE((
             SELECT bb.barcode_alias_8digit 
             FROM barcode_batches bb 
             WHERE bb.po_id = pi.po_id AND bb.design_no = pi.design_no 
               AND COALESCE(bb.color::text, '') = COALESCE(pi.color::text, '') 
               AND bb.size = pi.size 
               AND bb.status != 'deleted'
             ORDER BY bb.created_at DESC LIMIT 1
           ), 'NO_BARCODE: ' || COALESCE(po.invoice_number, po.po_number)) as barcode, 
           pi.design_no, pg.name as product_group,
           SUM(pi.quantity) as opening_qty, 0 as purchased_qty, 0 as sales_return_qty, 0 as sold_qty, 0 as purchase_return_qty,
           COALESCE(po.invoice_number, po.po_number) as po_no,
           po.id as po_id,
           pi.color as color_id,
           pi.size as size_id
        FROM purchase_items pi
        LEFT JOIN product_groups pg ON pg.id = pi.product_group
        INNER JOIN purchase_orders po ON po.id = pi.po_id
        WHERE po.order_date < '\${start}' AND po.status = 'Completed'
        GROUP BY 1, 2, 3, 9, 10, 11, 12
        
        UNION ALL
        -- Purchases (period)
        SELECT 
           COALESCE((
             SELECT bb.barcode_alias_8digit 
             FROM barcode_batches bb 
             WHERE bb.po_id = pi.po_id AND bb.design_no = pi.design_no 
               AND COALESCE(bb.color::text, '') = COALESCE(pi.color::text, '') 
               AND bb.size = pi.size 
               AND bb.status != 'deleted'
             ORDER BY bb.created_at DESC LIMIT 1
           ), 'NO_BARCODE: ' || COALESCE(po.invoice_number, po.po_number)) as barcode, 
           pi.design_no, pg.name as product_group,
           0, SUM(pi.quantity), 0, 0, 0,
           COALESCE(po.invoice_number, po.po_number) as po_no,
           po.id as po_id,
           pi.color as color_id,
           pi.size as size_id
        FROM purchase_items pi
        LEFT JOIN product_groups pg ON pg.id = pi.product_group
        INNER JOIN purchase_orders po ON po.id = pi.po_id
        WHERE po.order_date BETWEEN '\${start}' AND '\${end}' AND po.status = 'Completed'
        GROUP BY 1, 2, 3, 9, 10, 11, 12
        
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
      ) agg`;

content = content.replace(regex, replacement);

const aggSelectRegex = /MAX\(t\.po_no\) as po_no,\n\s*SUM\(t\.opening_qty\) as opening_stock/;
if (content.match(aggSelectRegex)) {
  content = content.replace(aggSelectRegex, `MAX(t.po_no) as po_no,
        MAX(t.po_id::text)::uuid as po_id,
        MAX(t.color_id) as color_id,
        MAX(t.size_id) as size_id,
        SUM(t.opening_qty) as opening_stock`);
} else {
  console.log("Could not find aggSelectRegex!");
}

const outerJoinsRegex = /LEFT JOIN purchase_orders po ON po\.id = bb_info\.po_id[\s\S]*?LEFT JOIN sizes sz ON sz\.id = bb_info\.size/;
if (content.match(outerJoinsRegex)) {
  content = content.replace(outerJoinsRegex, `LEFT JOIN purchase_orders po ON po.id = COALESCE(bb_info.po_id, agg.po_id)
      LEFT JOIN purchase_items pi ON pi.po_id = COALESCE(bb_info.po_id, agg.po_id) AND pi.design_no = agg.design_no 
         AND (pi.color = COALESCE(bb_info.color, agg.color_id) OR (pi.color IS NULL AND COALESCE(bb_info.color, agg.color_id) IS NULL)) 
         AND (pi.size = COALESCE(bb_info.size, agg.size_id) OR (pi.size IS NULL AND COALESCE(bb_info.size, agg.size_id) IS NULL))
      LEFT JOIN colors cl ON cl.id = COALESCE(bb_info.color, agg.color_id)
      LEFT JOIN sizes sz ON sz.id = COALESCE(bb_info.size, agg.size_id)`);
} else {
  console.log("Could not find outerJoinsRegex!");
}

fs.writeFileSync(filePath, content);
console.log("Successfully replaced content.");
