import fs from 'fs';
const file = 'src/services/report.service.ts';
let content = fs.readFileSync(file, 'utf8');

const target1 = `      // 2. Query total count for pagination
      const totalCountRes = await AppDataSource.query(\`
        SELECT COUNT(*) as count FROM (
          SELECT 1
          FROM purchase_items pi
          INNER JOIN purchase_orders po ON po.id = pi.po_id
          LEFT JOIN vendors v ON v.id = po.vendor
          LEFT JOIN product_groups pg ON pg.id = pi.product_group
          LEFT JOIN colors cl ON cl.id = pi.color
          LEFT JOIN sizes sz ON sz.id = pi.size
          WHERE \${whereSql}
          GROUP BY 
            pi.po_id, pi.design_no, pi.color, pi.size, pi.cost_per_item, pi.mrp,
            po.invoice_number, po.order_date, v.name, pg.name, cl.name, sz.name
        ) as sub
      \`);`;

const replacement1 = `      const baseItemsCTE = \`
        WITH orphaned_sales AS (
           SELECT sii.barcode_8digit, MIN(sii.created_at) as created_at, MIN(sii.id::text) as first_id
           FROM sales_invoice_items sii
           WHERE sii.barcode_8digit NOT IN (
              SELECT bb2.barcode_alias_8digit 
              FROM barcode_batches bb2 
              INNER JOIN purchase_items pi2 ON pi2.po_id = bb2.po_id AND pi2.design_no = bb2.design_no 
                 AND COALESCE(pi2.color::text, '') = COALESCE(bb2.color::text, '') 
                 AND pi2.size = bb2.size
              WHERE bb2.status != 'deleted' AND bb2.barcode_alias_8digit IS NOT NULL
           )
           GROUP BY sii.barcode_8digit
        ),
        base_items AS (
          SELECT 
            pi.po_id, pi.design_no, pi.color, pi.size, pi.cost_per_item, pi.mrp, pi.quantity, pi.hsn_code,
            po.invoice_number as po_no, po.order_date as po_date, 
            po.vendor as vendor_id, pi.product_group as product_group_id, pi.id::text as id
          FROM purchase_items pi
          INNER JOIN purchase_orders po ON po.id = pi.po_id
          
          UNION ALL
          
          SELECT 
            'OPENING-STOCK' as po_id, bb.design_no, bb.color, bb.size, bb.cost_actual as cost_per_item, 
            (SELECT sii2.mrp FROM sales_invoice_items sii2 WHERE sii2.barcode_8digit = os.barcode_8digit LIMIT 1) as mrp, 
            0 as quantity, '' as hsn_code,
            'OPENING-STOCK' as po_no, os.created_at as po_date, 
            bb.vendor as vendor_id, bb.product_group as product_group_id, os.first_id as id
          FROM orphaned_sales os
          LEFT JOIN barcode_batches bb ON bb.barcode_alias_8digit = os.barcode_8digit
        )
      \`;

      // 2. Query total count for pagination
      const totalCountRes = await AppDataSource.query(\`
        \${baseItemsCTE}
        SELECT COUNT(*) as count FROM (
          SELECT 1
          FROM base_items pi
          LEFT JOIN vendors v ON v.id = pi.vendor_id
          LEFT JOIN product_groups pg ON pg.id = pi.product_group_id
          LEFT JOIN colors cl ON cl.id = pi.color
          LEFT JOIN sizes sz ON sz.id = pi.size
          WHERE \${whereSql}
          GROUP BY 
            pi.po_id, pi.design_no, pi.color, pi.size, pi.cost_per_item, pi.mrp,
            pi.po_no, pi.po_date, v.name, pg.name, cl.name, sz.name
        ) as sub
      \`);`;

const target2 = `      // Step 4a: Fetch paginated purchase items (fast: uses indexes on po_id, joins are small tables)
      const detailedItemsRes = await AppDataSource.query(\`
        SELECT 
          MIN(pi.id::text) as "id",
          pi.design_no as "design",
          SUM(pi.quantity) as "total_qty",
          pi.cost_per_item as "cost",
          pi.mrp as "mrp",
          MAX(pi.hsn_code) as "hsn",
          po.invoice_number as "po_no",
          po.order_date as "po_date",
          v.name as "vendorName",
          pg.name as "productGroup",
          cl.name as "color",
          sz.name as "size",
          pi.po_id as "po_id",
          pi.color as "color_id",
          pi.size as "size_id"
        FROM purchase_items pi
        INNER JOIN purchase_orders po ON po.id = pi.po_id
        LEFT JOIN vendors v ON v.id = po.vendor
        LEFT JOIN product_groups pg ON pg.id = pi.product_group
        LEFT JOIN colors cl ON cl.id = pi.color
        LEFT JOIN sizes sz ON sz.id = pi.size
        WHERE \${whereSql}
        GROUP BY 
          pi.po_id, pi.design_no, pi.color, pi.size, pi.cost_per_item, pi.mrp,
          po.invoice_number, po.order_date, v.name, pg.name, cl.name, sz.name
        ORDER BY \${orderByField} \${sortDir}, pi.design_no ASC
        LIMIT \${limit} OFFSET \${(page - 1) * limit}
      \`);`;

const replacement2 = `      // Step 4a: Fetch paginated purchase items (fast: uses CTE to include opening stock)
      const detailedItemsRes = await AppDataSource.query(\`
        \${baseItemsCTE}
        SELECT 
          MIN(pi.id) as "id",
          pi.design_no as "design",
          SUM(pi.quantity) as "total_qty",
          pi.cost_per_item as "cost",
          pi.mrp as "mrp",
          MAX(pi.hsn_code) as "hsn",
          pi.po_no as "po_no",
          pi.po_date as "po_date",
          v.name as "vendorName",
          pg.name as "productGroup",
          cl.name as "color",
          sz.name as "size",
          pi.po_id as "po_id",
          pi.color as "color_id",
          pi.size as "size_id"
        FROM base_items pi
        LEFT JOIN vendors v ON v.id = pi.vendor_id
        LEFT JOIN product_groups pg ON pg.id = pi.product_group_id
        LEFT JOIN colors cl ON cl.id = pi.color
        LEFT JOIN sizes sz ON sz.id = pi.size
        WHERE \${whereSql}
        GROUP BY 
          pi.po_id, pi.design_no, pi.color, pi.size, pi.cost_per_item, pi.mrp,
          pi.po_no, pi.po_date, v.name, pg.name, cl.name, sz.name
        ORDER BY \${orderByField.replace('po.order_date', 'pi.po_date').replace('SUM(pi.quantity)', 'SUM(pi.quantity)')} \${sortDir}, pi.design_no ASC
        LIMIT \${limit} OFFSET \${(page - 1) * limit}
      \`);`;

const target3 = `      if (poIds.length > 0) {
        const poIdList = poIds.map((id: any) => \`'\${id}'\`).join(',');
        barcodeBatches = await AppDataSource.query(\`
          SELECT 
            bb.barcode_alias_8digit,
            bb.barcode_structured,
            \${photoColumn}
            bb.po_id,
            bb.design_no,
            bb.color,
            bb.size
          FROM barcode_batches bb
          WHERE bb.status != 'deleted'
            AND bb.po_id IN (\${poIdList})
        \`);
      }`;

const replacement3 = `      if (poIds.length > 0) {
        const poIdList = poIds.map((id: any) => \`'\${id}'\`).join(',');
        barcodeBatches = await AppDataSource.query(\`
          SELECT 
            bb.barcode_alias_8digit,
            bb.barcode_structured,
            \${photoColumn}
            bb.po_id,
            bb.design_no,
            bb.color,
            bb.size
          FROM barcode_batches bb
          WHERE bb.status != 'deleted'
            AND bb.po_id IN (\${poIdList})
            
          UNION ALL
          
          SELECT 
            bb.barcode_alias_8digit,
            bb.barcode_structured,
            \${photoColumn}
            'OPENING-STOCK' as po_id,
            bb.design_no,
            bb.color,
            bb.size
          FROM barcode_batches bb
          WHERE bb.status != 'deleted'
            AND 'OPENING-STOCK' IN (\${poIdList})
            AND bb.barcode_alias_8digit IN (
               SELECT sii.barcode_8digit FROM sales_invoice_items sii 
               WHERE sii.barcode_8digit NOT IN (
                  SELECT bb2.barcode_alias_8digit 
                  FROM barcode_batches bb2 
                  INNER JOIN purchase_items pi2 ON pi2.po_id = bb2.po_id AND pi2.design_no = bb2.design_no 
                     AND COALESCE(pi2.color::text, '') = COALESCE(bb2.color::text, '') 
                     AND pi2.size = bb2.size
                  WHERE bb2.status != 'deleted' AND bb2.barcode_alias_8digit IS NOT NULL
               )
            )
        \`);
      }`;

content = content.replace(target1, replacement1);
content = content.replace(target2, replacement2);
content = content.replace(target3, replacement3);

fs.writeFileSync(file, content);
console.log("Rewritten inventory pagination!");
