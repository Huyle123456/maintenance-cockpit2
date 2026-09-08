const fs = require("fs");
const path = require("path");
const cds = require("@sap/cds");
const { processExcelImport } = require("../srv/excel-import-service");

async function test50kImport() {
  console.log("=== Testing 50,000 Records Excel Import ===");
  const filePath = path.resolve(__dirname, "..", "MaintenanceOrders_50k_Sample.xlsx");
  
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const fileBuffer = fs.readFileSync(filePath);
  console.log(`Loaded file buffer: ${(fileBuffer.length / (1024 * 1024)).toFixed(2)} MB`);

  // Connect to cds
  const csn = await cds.load(["db", "srv"]);
  cds.model = cds.compile.for.nodejs(csn);
  await cds.connect.to("db");

  console.log("Starting processExcelImport...");
  const t0 = Date.now();
  const result = await processExcelImport(fileBuffer, "TestAdmin");
  const elapsed = ((Date.now() - t0) / 1000).toFixed(2);

  console.log(`[SUCCESS] 50,000 Import completed in ${elapsed}s!`);
  console.log(JSON.stringify(result, null, 2));
}

test50kImport().catch(console.error);
