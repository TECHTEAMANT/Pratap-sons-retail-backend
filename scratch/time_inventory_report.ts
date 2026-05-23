import { initializeDatabase } from '../src/config/data-source';
import { ReportService } from '../src/services/report.service';

async function timeInventoryReport() {
  try {
    await initializeDatabase();
    console.log('Database connected.\n');

    const reportService = new ReportService();

    // Test 1: paginated (50 items, as in the UI)
    console.log('=== Test 1: Paginated (limit=50) ===');
    let start = Date.now();
    const result1 = await reportService.inventoryReport({ page: 1, limit: 50, skipSummary: true });
    console.log(`✅ Paginated 50 rows: ${Date.now() - start}ms | Returned: ${result1.data.length} items`);

    // Test 2: Full export (exportMode, all rows)
    console.log('\n=== Test 2: Full CSV Export (exportMode=true) ===');
    start = Date.now();
    const result2 = await reportService.inventoryReport({ exportMode: true, skipSummary: true });
    console.log(`✅ Full export: ${Date.now() - start}ms | Returned: ${result2.data.length} items`);

    // Test 3: With vendor filter
    console.log('\n=== Test 3: With vendor filter ===');
    start = Date.now();
    const result3 = await reportService.inventoryReport({ page: 1, limit: 50, skipSummary: true, design: 'A' });
    console.log(`✅ Filtered design query: ${Date.now() - start}ms | Returned: ${result3.data.length} items`);

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

timeInventoryReport();
