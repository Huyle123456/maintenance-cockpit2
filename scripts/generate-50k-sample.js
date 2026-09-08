const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

function generate50kSample() {
  console.log("Generating 50,000 records sample Excel...");
  const startTime = Date.now();

  const equipments = ["EQ-001", "EQ-002", "EQ-003", "EQ-004", "EQ-005"];
  const plants = ["1000", "2000", "3000"];
  const types = ["PREVENTIVE", "CORRECTIVE", "EMERGENCY"];
  const priorities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  const planners = ["JOHN", "SARAH", "ALEX"];

  const titles = [
    "Pump Overhaul & Bearing Inspection",
    "Motor Vibration & Thermal Analysis",
    "Emergency Valve Seal Replacement",
    "Conveyor Belt Alignment & Tensioning",
    "Turbine Lubrication & Filter Clean",
    "Compressor Oil Flush & Valve Calibration",
    "Hydraulic Cylinder Check & Testing",
    "Electrical Panel Inspection & Cleaning",
  ];

  const inlineOpsList = [
    "10:Visual Inspection:1; 20:Dismantle & Clean:2; 30:Testing:1",
    "10:Thermal Check:1.5; 20:Grease Bearing:1",
    "10:Isolate Pipeline:1; 20:Replace Core:3",
    "10:Tension Tuning:2; 20:Alignment:1",
    "10:Drain Oil:1; 20:Refill Lubricant:2",
  ];

  const inlineMatsList = [
    "MAT-001:2; MAT-003:5",
    "MAT-001:1; MAT-003:2",
    "MAT-002:1; MAT-005:8",
    "MAT-005:10",
    "MAT-003:5; MAT-002:1",
  ];

  const rows = [];
  const TOTAL_ROWS = 50000;

  for (let i = 1; i <= TOTAL_ROWS; i++) {
    const eq = equipments[i % equipments.length];
    const plant = plants[i % plants.length];
    const type = types[i % types.length];
    const priority = priorities[i % priorities.length];
    const planner = planners[i % planners.length];
    const title = `${titles[i % titles.length]} #${i}`;
    const ops = inlineOpsList[i % inlineOpsList.length];
    const mats = inlineMatsList[i % inlineMatsList.length];

    const startDay = (i % 28) + 1;
    const endDay = Math.min(28, startDay + (i % 5));
    const startStr = `2026-09-${String(startDay).padStart(2, "0")}`;
    const endStr = `2026-09-${String(endDay).padStart(2, "0")}`;

    rows.push({
      Equipment: eq,
      Description: title,
      Plant: plant,
      Type: type,
      Priority: priority,
      Planner: planner,
      ScheduledFrom: startStr,
      ScheduledTo: endStr,
      "Operations (Inline Optional)": ops,
      "Materials (Inline Optional)": mats,
    });
  }

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "MaintenanceOrders");

  // Add MasterData sheet as well
  const masterData = [
    { Category: "Equipment", "Code / Key": "EQ-001", "Description / Details": "Centrifugal Pump A1 (Plant 1000)" },
    { Category: "Equipment", "Code / Key": "EQ-002", "Description / Details": "Hydraulic Motor B2 (Plant 2000)" },
    { Category: "Equipment", "Code / Key": "EQ-003", "Description / Details": "Safety Valve C3 (Plant 3000)" },
    { Category: "Equipment", "Code / Key": "EQ-004", "Description / Details": "Belt Conveyor D4 (Plant 1000)" },
    { Category: "Equipment", "Code / Key": "EQ-005", "Description / Details": "Gas Turbine E5 (Plant 2000)" },
    { Category: "Plant", "Code / Key": "1000", "Description / Details": "Main Production Plant" },
    { Category: "Plant", "Code / Key": "2000", "Description / Details": "Chemical Processing Plant" },
    { Category: "Plant", "Code / Key": "3000", "Description / Details": "Assembly & Packaging Plant" },
    { Category: "Maintenance Type", "Code / Key": "PREVENTIVE", "Description / Details": "Planned preventive maintenance" },
    { Category: "Maintenance Type", "Code / Key": "CORRECTIVE", "Description / Details": "Corrective maintenance after fault" },
    { Category: "Maintenance Type", "Code / Key": "EMERGENCY", "Description / Details": "Immediate emergency breakdown fix" },
    { Category: "Priority", "Code / Key": "LOW", "Description / Details": "Low priority (normal SLA)" },
    { Category: "Priority", "Code / Key": "MEDIUM", "Description / Details": "Medium standard priority" },
    { Category: "Priority", "Code / Key": "HIGH", "Description / Details": "High priority maintenance" },
    { Category: "Priority", "Code / Key": "CRITICAL", "Description / Details": "Critical (Same-day schedule mandatory)" },
  ];
  const wsRef = XLSX.utils.json_to_sheet(masterData);
  XLSX.utils.book_append_sheet(workbook, wsRef, "MasterData_Reference");

  const outPath = path.resolve(__dirname, "..", "MaintenanceOrders_50k_Sample.xlsx");
  XLSX.writeFile(workbook, outPath);

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  const stats = fs.statSync(outPath);
  const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);

  console.log(`[SUCCESS] Generated 50,000 records Excel file in ${durationSec}s:`);
  console.log(`- Path: ${outPath}`);
  console.log(`- Size: ${sizeMb} MB`);
}

generate50kSample();
