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
           COALESCE(po.invoice_number, po.po_number) as po_no
        FROM purchase_items pi
        LEFT JOIN product_groups pg ON pg.id = pi.product_group
        INNER JOIN purchase_orders po ON po.id = pi.po_id
        WHERE po.order_date < '\${start}' AND po.status = 'Completed'
        GROUP BY 1, 2, 3, 9
        
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
           COALESCE(po.invoice_number, po.po_number) as po_no
        FROM purchase_items pi
        LEFT JOIN product_groups pg ON pg.id = pi.product_group
        INNER JOIN purchase_orders po ON po.id = pi.po_id
        WHERE po.order_date BETWEEN '\${start}' AND '\${end}' AND po.status = 'Completed'
        GROUP BY 1, 2, 3, 9
        
        UNION ALL
        -- Sales (opening)
        SELECT COALESCE(sii.barcode_8digit, bb.barcode_alias_8digit, 'UNBARCODED') as barcode, COALESCE(bb.design_no, 'UNKNOWN') as design_no, pg.name as product_group,
               -SUM(sii.quantity), 0, 0, 0, 0,
               NULL as po_no
        FROM sales_invoice_items sii
        INNER JOIN sales_invoices si ON si.id = sii.invoice_id
        LEFT JOIN barcode_batches bb ON bb.barcode_alias_8digit = sii.barcode_8digit
        LEFT JOIN product_groups pg ON pg.id = bb.product_group
        WHERE si.invoice_date < '\${start}'
        GROUP BY 1, 2, 3
        
        UNION ALL
        -- Sales (period)
        SELECT COALESCE(sii.barcode_8digit, bb.barcode_alias_8digit, 'UNBARCODED') as barcode, COALESCE(bb.design_no, 'UNKNOWN') as design_no, pg.name as product_group,
               0, 0, 0, SUM(sii.quantity), 0,
               NULL as po_no
        FROM sales_invoice_items sii
        INNER JOIN sales_invoices si ON si.id = sii.invoice_id
        LEFT JOIN barcode_batches bb ON bb.barcode_alias_8digit = sii.barcode_8digit
        LEFT JOIN product_groups pg ON pg.id = bb.product_group
        WHERE si.invoice_date BETWEEN '\${start}' AND '\${end}'
        GROUP BY 1, 2, 3
        
        UNION ALL
        -- Sales Returns (opening)
        SELECT COALESCE(sri.barcode_8digit, bb.barcode_alias_8digit, 'UNBARCODED') as barcode, COALESCE(bb.design_no, 'UNKNOWN') as design_no, pg.name as product_group,
               SUM(sri.quantity), 0, 0, 0, 0,
               NULL as po_no
        FROM sales_return_items sri
        INNER JOIN sales_returns sr ON sr.id = sri.return_id
        LEFT JOIN barcode_batches bb ON bb.barcode_alias_8digit = sri.barcode_8digit
        LEFT JOIN product_groups pg ON pg.id = bb.product_group
        WHERE sr.return_date < '\${start}'
        GROUP BY 1, 2, 3
        
        UNION ALL
        -- Sales Returns (period)
        SELECT COALESCE(sri.barcode_8digit, bb.barcode_alias_8digit, 'UNBARCODED') as barcode, COALESCE(bb.design_no, 'UNKNOWN') as design_no, pg.name as product_group,
               0, 0, SUM(sri.quantity), 0, 0,
               NULL as po_no
        FROM sales_return_items sri
        INNER JOIN sales_returns sr ON sr.id = sri.return_id
        LEFT JOIN barcode_batches bb ON bb.barcode_alias_8digit = sri.barcode_8digit
        LEFT JOIN product_groups pg ON pg.id = bb.product_group
        WHERE sr.return_date BETWEEN '\${start}' AND '\${end}'
        GROUP BY 1, 2, 3
        
        UNION ALL
        -- Purchase Returns (opening)
        SELECT COALESCE(bb.barcode_alias_8digit, 'UNBARCODED') as barcode, COALESCE(bb.design_no, 'UNKNOWN') as design_no, pg.name as product_group,
               -SUM(pri.quantity), 0, 0, 0, 0,
               NULL as po_no
        FROM purchase_return_items pri
        INNER JOIN purchase_returns pr ON pr.id = pri.return_id
        LEFT JOIN barcode_batches bb ON bb.id = pri.item_id
        LEFT JOIN product_groups pg ON pg.id = bb.product_group
        WHERE pr.return_date < '\${start}'
        GROUP BY 1, 2, 3
        
        UNION ALL
        -- Purchase Returns (period)
        SELECT COALESCE(bb.barcode_alias_8digit, 'UNBARCODED') as barcode, COALESCE(bb.design_no, 'UNKNOWN') as design_no, pg.name as product_group,
               0, 0, 0, 0, SUM(pri.quantity),
               NULL as po_no
        FROM purchase_return_items pri
        INNER JOIN purchase_returns pr ON pr.id = pri.return_id
        LEFT JOIN barcode_batches bb ON bb.id = pri.item_id
        LEFT JOIN product_groups pg ON pg.id = bb.product_group
        WHERE pr.return_date BETWEEN '\${start}' AND '\${end}'
        GROUP BY 1, 2, 3
        ) t
        WHERE t.barcode IS NOT NULL
        GROUP BY t.barcode, t.design_no, t.product_group
      ) agg`;

content = content.replace(regex, replacement);

const outerSelectRegex = /MAX\(po\.invoice_number\) as po_no,/;
if (content.match(outerSelectRegex)) {
  content = content.replace(outerSelectRegex, "COALESCE(MAX(po.invoice_number), MAX(agg.po_no)) as po_no,");
}

fs.writeFileSync(filePath, content);
console.log("Successfully replaced content.");
