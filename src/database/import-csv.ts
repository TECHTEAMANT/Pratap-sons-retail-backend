import 'reflect-metadata';
import fs from 'fs';
import path from 'path';
import { initializeDatabase, closeDatabase, AppDataSource } from '../config/data-source';
import { Role } from '../entities/Role';
import { User } from '../entities/User';
import { Vendor } from '../entities/Vendor';
import { City } from '../entities/City';
import { Color } from '../entities/Color';
import { Floor } from '../entities/Floor';
import { ProductGroup } from '../entities/ProductGroup';
import { ProductMaster } from '../entities/ProductMaster';
import { BarcodeBatch } from '../entities/BarcodeBatch';
import { PurchaseOrder } from '../entities/PurchaseOrder';
import { PurchaseItem } from '../entities/PurchaseItem';
import { TallySync } from '../entities/TallySync';
import { Size } from '../entities/Size';
import bcrypt from 'bcryptjs';

const DATA_DIR = fs.existsSync(path.join(process.cwd(), 'datafordb')) 
  ? path.join(process.cwd(), 'datafordb')
  : path.join(process.cwd(), '..', 'datafordb');

function parseCSVFull(content: string): any[] {
  const result: any[][] = [];
  let currentVal = '';
  let inQuotes = false;
  let row: string[] = [];
  
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (c === '"') {
      if (inQuotes && content[i+1] === '"') {
        currentVal += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push(currentVal.trim());
      currentVal = '';
    } else if ((c === '\n' || (c === '\r' && content[i+1] === '\n')) && !inQuotes) {
      row.push(currentVal.trim());
      result.push(row);
      row = [];
      currentVal = '';
      if (c === '\r') i++;
    } else {
      currentVal += c;
    }
  }
  if (row.length || currentVal) {
    row.push(currentVal.trim());
    result.push(row);
  }
  
  const headers = result[0];
  if (!headers) return [];
  return result.slice(1).filter(r => r.length >= headers.length).map(r => {
    const obj: any = {};
    headers.forEach((h: string, idx: number) => {
      let val: any = r[idx] ? r[idx].replace(/^"|"$/g, '') : null;
      if (val === 'NULL' || val === 'null' || val === '') val = null;
      obj[h.trim().replace(/^"|"$/g, '')] = val;
    });
    return obj;
  });
}

function mapBoolean(val: any, defaultVal: boolean = false): boolean {
  if (val === null || val === undefined) return defaultVal;
  if (typeof val === 'boolean') return val;
  const s = String(val).toLowerCase();
  if (s === 'true' || s === '1' || s === 't' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'f' || s === 'no') return false;
  return defaultVal;
}

function mapNumber(val: any, defaultVal: number = 0): number {
  if (val === null || val === undefined || val === '') return defaultVal;
  const n = Number(val);
  return isNaN(n) ? defaultVal : n;
}

function mapJson(val: any): any {
  if (!val) return null;
  try {
    return JSON.parse(val);
  } catch {
    return val;
  }
}

async function main() {
  try {
    console.log('🔄 Initializing Database...');
    const ds = await initializeDatabase();
    
    // Clear tables ONLY if we have data to replace them
    console.log('⚠️  Checking CSV files for import...');
    
    const rolePath = path.join(DATA_DIR, 'roles_rows (3).csv');
    const userPath = path.join(DATA_DIR, 'users_rows (2).csv');
    const vendorPath = path.join(DATA_DIR, 'vendors_rows (1).csv');
    const cityPath = path.join(DATA_DIR, 'cities_rows (2).csv');
    const colorPath = path.join(DATA_DIR, 'colors_rows (2).csv');
    const floorPath = path.join(DATA_DIR, 'floors_rows (2).csv');
    const pgPath = path.join(DATA_DIR, 'product_groups_rows (1).csv');
    const pmPath = path.join(DATA_DIR, 'product_masters_rows (4).csv');
    const bbPath = path.join(DATA_DIR, 'barcode_batches_rows (2).csv');
    const poPath = path.join(DATA_DIR, 'purchase_orders_rows (1).csv');
    const piPath = path.join(DATA_DIR, 'purchase_items_rows (3).csv');
    const tsPath = path.join(DATA_DIR, 'tally_sync_rows.csv');
    const sizesPath = path.join(DATA_DIR, 'sizes_rows (1).csv');

    console.log('⚠️  Clearing tables for a clean import...');
    if (fs.existsSync(tsPath)) await ds.query('TRUNCATE TABLE "tally_sync" CASCADE');
    if (fs.existsSync(piPath)) await ds.query('TRUNCATE TABLE "purchase_items" CASCADE');
    if (fs.existsSync(poPath)) await ds.query('TRUNCATE TABLE "purchase_orders" CASCADE');
    if (fs.existsSync(bbPath)) await ds.query('TRUNCATE TABLE "barcode_batches" CASCADE');
    if (fs.existsSync(pmPath)) await ds.query('TRUNCATE TABLE "product_masters" CASCADE');
    if (fs.existsSync(pgPath)) await ds.query('TRUNCATE TABLE "product_groups" CASCADE');
    if (fs.existsSync(floorPath)) await ds.query('TRUNCATE TABLE "floors" CASCADE');
    if (fs.existsSync(colorPath)) await ds.query('TRUNCATE TABLE "colors" CASCADE');
    if (fs.existsSync(cityPath)) await ds.query('TRUNCATE TABLE "cities" CASCADE');
    if (fs.existsSync(sizesPath)) await ds.query('TRUNCATE TABLE "sizes" CASCADE');
    if (fs.existsSync(userPath)) await ds.query('TRUNCATE TABLE "users" CASCADE');
    if (fs.existsSync(rolePath)) await ds.query('TRUNCATE TABLE "roles" CASCADE');
    if (fs.existsSync(vendorPath)) await ds.query('TRUNCATE TABLE "vendors" CASCADE');
    
    // 0. Sizes (Import first for FKs)
    if (fs.existsSync(sizesPath)) {
      const data = parseCSVFull(fs.readFileSync(sizesPath, 'utf8'));
      const repo = ds.getRepository(Size);
      console.log(`🌱 Importing ${data.length} sizes...`);
      for (const row of data) {
        await repo.save(repo.create({
          id: row.id,
          size_code: row.size_code,
          name: row.name,
          sort_order: mapNumber(row.sort_order),
        }));
      }
    } else {
      // Placeholder Seeding for Sizes if CSV missing
      console.log('🔍 Extracting size IDs to satisfy FK constraints...');
      const sizeIds = new Set<string>();
      
      if (fs.existsSync(bbPath)) {
        const bbData = parseCSVFull(fs.readFileSync(bbPath, 'utf8'));
        bbData.forEach(r => { if (r.size) sizeIds.add(r.size); });
      }
      if (fs.existsSync(piPath)) {
        const piData = parseCSVFull(fs.readFileSync(piPath, 'utf8'));
        piData.forEach(r => { if (r.size) sizeIds.add(r.size); });
      }

      if (sizeIds.size > 0) {
        console.log(`🌱 Seeding ${sizeIds.size} placeholder sizes...`);
        const sizeRepo = ds.getRepository(Size);
        for (const sid of sizeIds) {
          if (/^[0-9a-f-]{36}$/i.test(sid)) {
            const exists = await sizeRepo.findOne({ where: { id: sid } });
            if (!exists) {
              await sizeRepo.save(sizeRepo.create({
                id: sid,
                size_code: `P-${sid.slice(0, 4)}`,
                name: `Size ${sid.slice(0, 4)}`,
              }));
            }
          }
        }
      }
    }

    // 1. Roles fallback and import
    const roleRepo = ds.getRepository(Role);
    if (fs.existsSync(rolePath)) {
      const data = parseCSVFull(fs.readFileSync(rolePath, 'utf8'));
      console.log(`🌱 Importing ${data.length} roles from CSV...`);
      for (const row of data) {
        await roleRepo.save(roleRepo.create({
          id: row.id,
          name: row.name,
          description: row.description || '',
          can_view_cost: mapBoolean(row.can_view_cost),
          can_view_mrp: mapBoolean(row.can_view_mrp, true),
          can_manage_purchases: mapBoolean(row.can_manage_purchases),
          can_manage_sales: mapBoolean(row.can_manage_sales),
          can_view_reports: mapBoolean(row.can_view_reports),
          can_manage_inventory: mapBoolean(row.can_manage_inventory),
          can_manage_masters: mapBoolean(row.can_manage_masters),
          can_manage_users: mapBoolean(row.can_manage_users),
        }));
      }
    } else {
      const existingRolesCount = await roleRepo.count();
      if (existingRolesCount === 0) {
        console.log('🌱 CSV for roles not found. Seeding default roles...');
        const defaultRoles = [
          { name: 'Admin', description: 'Full system access', can_view_cost: true, can_view_mrp: true, can_manage_purchases: true, can_manage_sales: true, can_view_reports: true, can_manage_inventory: true, can_manage_masters: true, can_manage_users: true },
          { name: 'Manager', description: 'Management access', can_view_cost: true, can_view_mrp: true, can_manage_purchases: false, can_manage_sales: true, can_view_reports: true, can_manage_inventory: true, can_manage_masters: true, can_manage_users: false },
          { name: 'Salesman', description: 'Sales access', can_view_cost: false, can_view_mrp: true, can_manage_purchases: false, can_manage_sales: true, can_view_reports: false, can_manage_inventory: false, can_manage_masters: false, can_manage_users: false },
          { name: 'Executor', description: 'Basic access', can_view_cost: false, can_view_mrp: true, can_manage_purchases: false, can_manage_sales: false, can_view_reports: false, can_manage_inventory: false, can_manage_masters: false, can_manage_users: false }
        ];
        for (const roleDef of defaultRoles) {
          await roleRepo.save(roleRepo.create(roleDef));
        }
      }
    }

    // 2. Users fallback and import
    const userRepo = ds.getRepository(User);
    const salt = await bcrypt.genSalt(10);
    const defaultHash = await bcrypt.hash('admin123', salt);
    if (fs.existsSync(userPath)) {
      const data = parseCSVFull(fs.readFileSync(userPath, 'utf8'));
      console.log(`🌱 Importing ${data.length} users from CSV...`);
      for (const row of data) {
        await userRepo.save(userRepo.create({
          id: row.id,
          email: row.email,
          name: row.name,
          mobile: row.mobile,
          password_hash: row.password_hash || defaultHash,
          role: row.role || 'Executor',
          role_id: row.role_id,
          active: mapBoolean(row.active, true),
        }));
      }
    } else {
      const existingUserCount = await userRepo.count();
      if (existingUserCount === 0) {
        console.log('🌱 CSV for users not found. Seeding default admin user...');
        const adminRole = await roleRepo.findOne({ where: { name: 'Admin' } });
        if (adminRole) {
          await userRepo.save(userRepo.create({
            email: 'admin@pratapsons.com',
            name: 'Administrator',
            mobile: '9999999999',
            password_hash: defaultHash,
            role: 'Admin',
            role_id: adminRole.id,
            active: true,
          }));
        }
      }
    }

    // 3. Vendors
    const vendorsPath = path.join(DATA_DIR, 'vendors_rows (1).csv');
    if (fs.existsSync(vendorsPath)) {
      const data = parseCSVFull(fs.readFileSync(vendorsPath, 'utf8'));
      const repo = ds.getRepository(Vendor);
      console.log(`🌱 Importing ${data.length} vendors...`);
      for (const row of data) {
        await repo.save(repo.create({
          id: row.id,
          vendor_code: row.vendor_code || `V-${Math.floor(Math.random() * 10000)}`,
          name: row.name,
          address: row.address || '',
          gstin: row.gstin || '',
          mobile: row.mobile || '',
          st_number: row.st_number || null,
          active: mapBoolean(row.active, true),
          city_id: row.city_id || null,
        }));
      }
    }

    // 4. Cities
    const citiesPath = path.join(DATA_DIR, 'cities_rows (2).csv');
    if (fs.existsSync(citiesPath)) {
      const data = parseCSVFull(fs.readFileSync(citiesPath, 'utf8'));
      const repo = ds.getRepository(City);
      console.log(`🌱 Importing ${data.length} cities...`);
      for (const row of data) {
        await repo.save(repo.create({
          id: row.id,
          name: row.name,
          state: row.state,
          city_code: row.city_code || null,
          active: mapBoolean(row.active, true),
        }));
      }
    }

    // 5. Colors
    const colorsPath = path.join(DATA_DIR, 'colors_rows (2).csv');
    if (fs.existsSync(colorsPath)) {
      const data = parseCSVFull(fs.readFileSync(colorsPath, 'utf8'));
      const repo = ds.getRepository(Color);
      console.log(`🌱 Importing ${data.length} colors...`);
      for (const row of data) {
        await repo.save(repo.create({
          id: row.id,
          color_code: row.color_code,
          name: row.name,
          hex_value: row.hex_value || '#000000',
        }));
      }
    }

    // 6. Floors
    const floorsPath = path.join(DATA_DIR, 'floors_rows (2).csv');
    if (fs.existsSync(floorsPath)) {
      const data = parseCSVFull(fs.readFileSync(floorsPath, 'utf8'));
      const repo = ds.getRepository(Floor);
      console.log(`🌱 Importing ${data.length} floors...`);
      for (const row of data) {
        await repo.save(repo.create({
          id: row.id,
          floor_code: row.floor_code,
          name: row.name,
          description: row.description || '',
          active: mapBoolean(row.active, true),
        }));
      }
    }

    // 7. Product Groups
    if (fs.existsSync(pgPath)) {
      const data = parseCSVFull(fs.readFileSync(pgPath, 'utf8'));
      const repo = ds.getRepository(ProductGroup);
      console.log(`🌱 Importing ${data.length} product groups...`);
      for (const row of data) {
        await repo.save(repo.create({
          id: row.id,
          group_code: row.group_code,
          name: row.name,
          description: row.description || '',
          hsn_code: row.hsn_code || '',
          floor: row.floor || null,
        }));
      }
    }

    // 8. Product Masters
    if (fs.existsSync(pmPath)) {
      const data = parseCSVFull(fs.readFileSync(pmPath, 'utf8'));
      const repo = ds.getRepository(ProductMaster);
      console.log(`🌱 Importing ${data.length} product masters...`);
      for (const row of data) {
        await repo.save(repo.create({
          id: row.id,
          design_no: row.design_no,
          product_group_id: row.product_group,
          color_id: row.color,
          vendor_id: row.vendor,
          mrp: mapNumber(row.mrp),
          gst_logic: row.gst_logic || 'AUTO_5_18',
          hsn_code: row.hsn_code,
          floor_id: row.floor,
          photos: mapJson(row.photos) || [],
          description: row.description || '',
          barcodes_per_item: mapNumber(row.barcodes_per_item, 1),
        }));
      }
    }

    // 9. Barcode Batches
    if (fs.existsSync(bbPath)) {
      const data = parseCSVFull(fs.readFileSync(bbPath, 'utf8'));
      const repo = ds.getRepository(BarcodeBatch);
      console.log(`🌱 Importing ${data.length} barcode batches...`);
      for (const row of data) {
        await repo.save(repo.create({
          id: row.id,
          barcode_alias_8digit: row.barcode_alias_8digit,
          barcode_structured: row.barcode_structured,
          design_no: row.design_no,
          product_group_id: row.product_group,
          size_id: row.size,
          color_id: row.color,
          vendor_id: row.vendor,
          payout_code: row.payout_code,
          cost_actual: mapNumber(row.cost_actual),
          cost_encoded: row.cost_encoded,
          mrp: mapNumber(row.mrp),
          hsn_code: row.hsn_code,
          gst_logic: row.gst_logic || 'AUTO_5_18',
          total_quantity: mapNumber(row.total_quantity),
          available_quantity: mapNumber(row.available_quantity),
          floor_id: row.floor,
          status: row.status || 'active',
          po_id: row.po_id,
          photos: mapJson(row.photos) || [],
          description: row.description || '',
        }));
      }
    }

    // 10. Purchase Orders
    if (fs.existsSync(poPath)) {
      const data = parseCSVFull(fs.readFileSync(poPath, 'utf8'));
      const repo = ds.getRepository(PurchaseOrder);
      console.log(`🌱 Importing ${data.length} purchase orders...`);
      for (const row of data) {
        await repo.save(repo.create({
          id: row.id,
          po_number: row.po_number,
          order_number: row.order_number,
          vendor_id: row.vendor || row.vendor_id,
          invoice_number: row.invoice_number,
          vendor_invoice_date: row.vendor_invoice_date ? new Date(row.vendor_invoice_date) : (undefined as any),
          total_items: mapNumber(row.total_items),
          total_amount: mapNumber(row.total_amount),
          taxable_value: mapNumber(row.taxable_value),
          status: row.status || 'draft',
          ledger_discount: mapNumber(row.ledger_discount),
          ledger_freight: mapNumber(row.ledger_freight),
          ledger_freight_gst_rate: mapNumber(row.ledger_freight_gst_rate),
          gst_breakdown: mapJson(row.gst_breakdown),
        } as any));
      }
    }

    // 11. Purchase Items
    if (fs.existsSync(piPath)) {
      const data = parseCSVFull(fs.readFileSync(piPath, 'utf8'));
      const repo = ds.getRepository(PurchaseItem);
      console.log(`🌱 Importing ${data.length} purchase items...`);
      for (const row of data) {
        await repo.save(repo.create({
          id: row.id,
          po_id: row.po_id,
          design_no: row.design_no,
          product_group_id: row.product_group,
          color_id: row.color,
          size_id: row.size,
          quantity: mapNumber(row.quantity),
          cost_per_item: mapNumber(row.cost_per_item),
          mrp: mapNumber(row.mrp),
          mrp_markup_percent: mapNumber(row.mrp_markup_percent),
          gst_logic: row.gst_logic || 'AUTO_5_18',
          hsn_code: row.hsn_code,
          description: row.description || '',
          order_number: row.order_number,
        } as any));
      }
    }

    // 12. Tally Sync
    if (fs.existsSync(tsPath)) {
      const data = parseCSVFull(fs.readFileSync(tsPath, 'utf8'));
      const repo = ds.getRepository(TallySync);
      console.log(`🌱 Importing ${data.length} tally sync records...`);
      for (const row of data) {
        await repo.save(repo.create({
          id: row.id,
          invoice_id: row.invoice_id,
          invoice_number: row.invoice_number,
          invoice_date: row.invoice_date ? new Date(row.invoice_date) : new Date(),
          customer_name: row.customer_name,
          customer_mobile: row.customer_mobile,
          total_amount: mapNumber(row.total_amount),
          sync_data: mapJson(row.sync_data) || {},
          sync_status: row.sync_status || 'pending',
          synced_at: row.synced_at ? new Date(row.synced_at) : (undefined as any),
          error_message: row.error_message,
          record_type: row.record_type,
          po_number: row.po_number,
          vendor_name: row.vendor_name,
        } as any));
      }
    }

    console.log('\n🎉 CSV IMPORT COMPLETED!');
    await closeDatabase();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Import failed:', error.message);
    if (error.detail) console.error('Detail:', error.detail);
    await closeDatabase();
    process.exit(1);
  }
}

main();
