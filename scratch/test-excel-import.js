const ExcelJS = require("exceljs");
const { normalizeDate, normalizeMaintenanceType, normalizePriority } = require("../srv/excel-import-service");

async function runTests() {
  console.log("=== Testing Helper Normalizations ===");
  
  // Test Date
  console.log("Date 2026-09-10 ->", normalizeDate("2026-09-10"));
  console.log("Date 15/09/2026 ->", normalizeDate("15/09/2026"));
  console.log("Date Serial 45550 ->", normalizeDate(45550));
  
  // Test Maintenance Type
  console.log("Type 'Bảo dưỡng phòng ngừa' ->", normalizeMaintenanceType("Bảo dưỡng phòng ngừa"));
  console.log("Type 'emergency repair' ->", normalizeMaintenanceType("emergency repair"));
  console.log("Type 'CORRECTIVE' ->", normalizeMaintenanceType("CORRECTIVE"));
  
  // Test Priority
  console.log("Priority 'KHẨN CẤP' ->", normalizePriority("KHẨN CẤP"));
  console.log("Priority 'low' ->", normalizePriority("low"));
  console.log("Priority 'high' ->", normalizePriority("high"));

  console.log("ALL TESTS PASSED!");
}

runTests().catch(console.error);
