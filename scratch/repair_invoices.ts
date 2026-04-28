import { AppDataSource } from '../src/config/data-source';
import { PaymentService } from '../src/services/payment.service';

async function runRepair() {
  try {
    console.log("Initializing database connection...");
    await AppDataSource.initialize();
    
    console.log("Starting Global Invoice Balance Repair...");
    const paymentService = new PaymentService();
    const result = await paymentService.repairInvoiceBalances();
    
    console.log("Repair Result:", JSON.stringify(result, null, 2));
    
    await AppDataSource.destroy();
    process.exit(0);
  } catch (error) {
    console.error("Error during repair:", error);
    process.exit(1);
  }
}

runRepair();
