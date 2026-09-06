const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

async function generateExcelTemplate() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SAP Maintenance Cockpit';
  workbook.lastModifiedBy = 'SAP Maintenance Cockpit';
  workbook.created = new Date();
  workbook.modified = new Date();

  // =========================================================================
  // Sheet 1: MaintenanceOrders (Order Header)
  // =========================================================================
  const wsOrders = workbook.addWorksheet('MaintenanceOrders', {
    views: [{ showGridLines: true }]
  });

  wsOrders.columns = [
    { header: 'Order', key: 'order', width: 16 },
    { header: 'Equipment', key: 'equipment', width: 16 },
    { header: 'Description', key: 'description', width: 42 },
    { header: 'Plant', key: 'plant', width: 12 },
    { header: 'Type', key: 'type', width: 18 },
    { header: 'Priority', key: 'priority', width: 16 },
    { header: 'Planner', key: 'planner', width: 18 },
    { header: 'ScheduledFrom', key: 'scheduledFrom', width: 18 },
    { header: 'ScheduledTo', key: 'scheduledTo', width: 18 },
    { header: 'Operations (Inline Optional)', key: 'operations', width: 36 },
    { header: 'Materials (Inline Optional)', key: 'materials', width: 34 }
  ];

  const headerRow1 = wsOrders.getRow(1);
  headerRow1.height = 26;
  headerRow1.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow1.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF004B87' } // SAP Fiori Blue
  };
  headerRow1.alignment = { vertical: 'middle', horizontal: 'center' };

  wsOrders.addRows([
    {
      order: 'MO-2001',
      equipment: 'EQ-001',
      description: 'Pump A Monthly Overhaul & Inspection',
      plant: '1000',
      type: 'PREVENTIVE',
      priority: 'HIGH',
      planner: 'JOHN',
      scheduledFrom: '2026-09-10',
      scheduledTo: '2026-09-15',
      operations: '',
      materials: ''
    },
    {
      order: 'MO-2002',
      equipment: 'EQ-002',
      description: 'Motor Bearing Check & Alignment',
      plant: '2000',
      type: 'CORRECTIVE',
      priority: 'MEDIUM',
      planner: 'SARAH',
      scheduledFrom: '2026-09-12',
      scheduledTo: '2026-09-18',
      operations: '',
      materials: ''
    },
    {
      order: 'MO-2003',
      equipment: 'EQ-003',
      description: 'Emergency Valve Fix & Replacement',
      plant: '3000',
      type: 'EMERGENCY',
      priority: 'CRITICAL',
      planner: 'ALEX',
      scheduledFrom: '2026-09-05',
      scheduledTo: '2026-09-05',
      operations: '',
      materials: ''
    },
    {
      order: 'MO-2004',
      equipment: 'EQ-004',
      description: 'Conveyor Belt Tension Tuning',
      plant: '1000',
      type: 'PREVENTIVE',
      priority: 'LOW',
      planner: 'JOHN',
      scheduledFrom: '2026-09-20',
      scheduledTo: '2026-09-25',
      operations: '10:Tension Check:2; 20:Alignment:1',
      materials: 'MAT-005:10'
    },
    {
      order: 'MO-2005',
      equipment: 'EQ-005',
      description: 'Turbine Lubricant & Filter Service',
      plant: '2000',
      type: 'PREVENTIVE',
      priority: 'HIGH',
      planner: 'SARAH',
      scheduledFrom: '2026-09-15',
      scheduledTo: '2026-09-22',
      operations: '10:Drain Oil:1; 20:Refill Lubricant:2',
      materials: 'MAT-003:5; MAT-002:1'
    }
  ]);

  // Center align certain columns in sheet 1
  wsOrders.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.height = 20;
      row.alignment = { vertical: 'middle' };
      row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(4).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(6).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(7).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(8).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(9).alignment = { vertical: 'middle', horizontal: 'center' };
    }
  });

  // =========================================================================
  // Sheet 2: Operations (Step 3: Operations)
  // =========================================================================
  const wsOps = workbook.addWorksheet('Operations', {
    views: [{ showGridLines: true }]
  });

  wsOps.columns = [
    { header: 'Order', key: 'order', width: 16 },
    { header: 'OperationNo', key: 'no', width: 16 },
    { header: 'Description', key: 'description', width: 42 },
    { header: 'WorkCenter', key: 'workCenter', width: 16 },
    { header: 'Technician', key: 'technician', width: 16 },
    { header: 'PlannedHours', key: 'plannedHours', width: 16 }
  ];

  const headerRow2 = wsOps.getRow(1);
  headerRow2.height = 26;
  headerRow2.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow2.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF007079' } // SAP Dark Teal
  };
  headerRow2.alignment = { vertical: 'middle', horizontal: 'center' };

  wsOps.addRows([
    { order: 'MO-2001', no: '10', description: 'Visual pump inspection & vibration test', workCenter: 'WC-001', technician: 'T-001', plannedHours: 2.0 },
    { order: 'MO-2001', no: '20', description: 'Dismantle housing and check seals', workCenter: 'WC-002', technician: 'T-002', plannedHours: 3.5 },
    { order: 'MO-2001', no: '30', description: 'Reassemble and conduct pressure test', workCenter: 'WC-003', technician: 'T-003', plannedHours: 2.0 },
    { order: 'MO-2002', no: '10', description: 'Measure motor bearing temperature', workCenter: 'WC-001', technician: 'T-001', plannedHours: 1.5 },
    { order: 'MO-2002', no: '20', description: 'Grease motor bearings', workCenter: 'WC-002', technician: 'T-002', plannedHours: 1.0 },
    { order: 'MO-2003', no: '10', description: 'Shut down pipeline & isolate valve', workCenter: 'WC-001', technician: 'T-001', plannedHours: 1.0 },
    { order: 'MO-2003', no: '20', description: 'Replace broken valve core and seals', workCenter: 'WC-002', technician: 'T-002', plannedHours: 4.0 }
  ]);

  wsOps.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.height = 20;
      row.alignment = { vertical: 'middle' };
      row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(4).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(5).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(6).alignment = { vertical: 'middle', horizontal: 'right' };
    }
  });

  // =========================================================================
  // Sheet 3: Materials (Step 4: Materials)
  // =========================================================================
  const wsMats = workbook.addWorksheet('Materials', {
    views: [{ showGridLines: true }]
  });

  wsMats.columns = [
    { header: 'Order', key: 'order', width: 16 },
    { header: 'Material', key: 'material', width: 18 },
    { header: 'Quantity', key: 'qty', width: 16 },
    { header: 'Unit', key: 'unit', width: 12 }
  ];

  const headerRow3 = wsMats.getRow(1);
  headerRow3.height = 26;
  headerRow3.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow3.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF107E3E' } // SAP Emerald Green
  };
  headerRow3.alignment = { vertical: 'middle', horizontal: 'center' };

  wsMats.addRows([
    { order: 'MO-2001', material: 'MAT-001', qty: 2, unit: 'EA' },
    { order: 'MO-2001', material: 'MAT-003', qty: 5, unit: 'L' },
    { order: 'MO-2002', material: 'MAT-001', qty: 1, unit: 'EA' },
    { order: 'MO-2002', material: 'MAT-003', qty: 2, unit: 'L' },
    { order: 'MO-2003', material: 'MAT-002', qty: 1, unit: 'EA' },
    { order: 'MO-2003', material: 'MAT-005', qty: 8, unit: 'SET' }
  ]);

  wsMats.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.height = 20;
      row.alignment = { vertical: 'middle' };
      row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(3).alignment = { vertical: 'middle', horizontal: 'right' };
      row.getCell(4).alignment = { vertical: 'middle', horizontal: 'center' };
    }
  });

  // =========================================================================
  // Sheet 4: MasterData_Reference
  // =========================================================================
  const wsRef = workbook.addWorksheet('MasterData_Reference', {
    views: [{ showGridLines: true }]
  });

  wsRef.columns = [
    { header: 'Category', key: 'category', width: 22 },
    { header: 'Code / Key', key: 'key', width: 18 },
    { header: 'Description / Details', key: 'details', width: 42 },
    { header: 'Unit Price (USD)', key: 'price', width: 18 }
  ];

  const headerRow4 = wsRef.getRow(1);
  headerRow4.height = 26;
  headerRow4.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow4.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4A5568' } // Slate Gray
  };
  headerRow4.alignment = { vertical: 'middle', horizontal: 'center' };

  wsRef.addRows([
    { category: 'Equipment', key: 'EQ-001', details: 'Centrifugal Pump A1 (Plant 1000)', price: '' },
    { category: 'Equipment', key: 'EQ-002', details: 'Hydraulic Motor B2 (Plant 2000)', price: '' },
    { category: 'Equipment', key: 'EQ-003', details: 'Safety Valve C3 (Plant 3000)', price: '' },
    { category: 'Equipment', key: 'EQ-004', details: 'Belt Conveyor D4 (Plant 1000)', price: '' },
    { category: 'Equipment', key: 'EQ-005', details: 'Gas Turbine E5 (Plant 2000)', price: '' },
    { category: 'Plant', key: '1000', details: 'Main Production Plant', price: '' },
    { category: 'Plant', key: '2000', details: 'Chemical Processing Plant', price: '' },
    { category: 'Plant', key: '3000', details: 'Assembly & Packaging Plant', price: '' },
    { category: 'Maintenance Type', key: 'PREVENTIVE', details: 'Planned preventive maintenance', price: '' },
    { category: 'Maintenance Type', key: 'CORRECTIVE', details: 'Corrective maintenance after fault', price: '' },
    { category: 'Maintenance Type', key: 'EMERGENCY', details: 'Immediate emergency breakdown fix', price: '' },
    { category: 'Priority', key: 'LOW', details: 'Low priority (normal SLA)', price: '' },
    { category: 'Priority', key: 'MEDIUM', details: 'Medium standard priority', price: '' },
    { category: 'Priority', key: 'HIGH', details: 'High priority maintenance', price: '' },
    { category: 'Priority', key: 'CRITICAL', details: 'Critical (Same-day schedule mandatory)', price: '' },
    { category: 'Planner', key: 'JOHN', details: 'John Doe (Mechanical Lead)', price: '' },
    { category: 'Planner', key: 'SARAH', details: 'Sarah Connor (Automation Lead)', price: '' },
    { category: 'Planner', key: 'ALEX', details: 'Alex Smith (Electrical Lead)', price: '' },
    { category: 'Work Center', key: 'WC-001', details: 'Mechanical Workshop 1', price: '' },
    { category: 'Work Center', key: 'WC-002', details: 'Electrical Workshop 2', price: '' },
    { category: 'Work Center', key: 'WC-003', details: 'Hydraulics Workshop 3', price: '' },
    { category: 'Material Master', key: 'MAT-001', details: 'Heavy Duty Ball Bearing (EA)', price: '25.00' },
    { category: 'Material Master', key: 'MAT-002', details: 'High Pressure Seal Kit (EA)', price: '40.00' },
    { category: 'Material Master', key: 'MAT-003', details: 'Synthetic Industrial Lubricant (L)', price: '25.00' },
    { category: 'Material Master', key: 'MAT-004', details: 'Flexible Motor Coupling (EA)', price: '150.00' },
    { category: 'Material Master', key: 'MAT-005', details: 'Stainless Steel Bolts & Nuts (SET)', price: '10.00' }
  ]);

  wsRef.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.height = 20;
      row.alignment = { vertical: 'middle' };
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' };
      row.getCell(4).alignment = { vertical: 'middle', horizontal: 'right' };
    }
  });

  // Save to locations
  const rootPath = path.resolve(__dirname, '..');
  const fileLocations = [
    path.join(rootPath, 'MaintenanceOrders_Template.xlsx'),
    path.join(rootPath, 'app', 'webapp', 'MaintenanceOrders_Template.xlsx'),
    path.join(rootPath, 'app', 'webapp', 'model', 'MaintenanceOrders_Template.xlsx')
  ];

  for (const targetPath of fileLocations) {
    const parentDir = path.dirname(targetPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    await workbook.xlsx.writeFile(targetPath);
    console.log(`[OK] Generated Excel Template at: ${targetPath}`);
  }
}

generateExcelTemplate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[ERROR] Failed to generate template:', err);
    process.exit(1);
  });
