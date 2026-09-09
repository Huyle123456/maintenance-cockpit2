const cds = require('@sap/cds');
const multer = require('multer');
const ExcelJS = require('exceljs');
const { processExcelImport } = require('./srv/excel-import-service');

// Configure multer for file uploads in memory buffer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit for massive Excel files
  }
});

cds.on('bootstrap', (app) => {
  // Enable CORS for direct browser access from SAP Build Work Zone / Fiori Launchpad
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, sap-contextid, sap-cancel-on-close');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Mock endpoint /user-api/currentUser for Local Development
  app.get('/user-api/currentUser', (req, res) => {
    res.json({
      name: 'Local Admin',
      firstname: 'Admin',
      lastname: 'Local',
      email: 'admin@maintenance.sap',
      displayName: 'Local Administrator',
      scopes: ['$XSAPPNAME.Admin', '$XSAPPNAME.User']
    });
  });

  // Download Comprehensive Multi-Sheet Excel Template endpoint via ExcelJS
  app.get('/api/maintenance/download-template', async (req, res) => {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'SAP Maintenance Cockpit';
      workbook.created = new Date();

      // ==========================================
      // Sheet 1: Maintenance Orders (Header)
      // ==========================================
      const wsOrders = workbook.addWorksheet('MaintenanceOrders', {
        views: [{ showGridLines: true }]
      });

      wsOrders.columns = [
        { header: 'Equipment', key: 'equipment', width: 16 },
        { header: 'Description', key: 'description', width: 38 },
        { header: 'Plant', key: 'plant', width: 12 },
        { header: 'Type', key: 'type', width: 16 },
        { header: 'Priority', key: 'priority', width: 14 },
        { header: 'Planner', key: 'planner', width: 16 },
        { header: 'ScheduledFrom', key: 'scheduledFrom', width: 16 },
        { header: 'ScheduledTo', key: 'scheduledTo', width: 16 },
        { header: 'Operations (Inline Optional)', key: 'operations', width: 38 },
        { header: 'Materials (Inline Optional)', key: 'materials', width: 32 }
      ];

      const headerOrders = wsOrders.getRow(1);
      headerOrders.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerOrders.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF004B87' } // SAP Fiori Blue
      };
      headerOrders.height = 24;
      headerOrders.alignment = { vertical: 'middle', horizontal: 'center' };

      wsOrders.addRows(sampleData.orders);

      // ==========================================
      // Sheet 2: Operations (Step 3: Operations)
      // ==========================================
      const wsOperations = workbook.addWorksheet('Operations', {
        views: [{ showGridLines: true }]
      });

      wsOperations.columns = [
        { header: 'Equipment', key: 'equipment', width: 16 },
        { header: 'OperationNo', key: 'no', width: 14 },
        { header: 'Description', key: 'description', width: 38 },
        { header: 'WorkCenter', key: 'workCenter', width: 16 },
        { header: 'Technician', key: 'technician', width: 16 },
        { header: 'PlannedHours', key: 'plannedHours', width: 16 }
      ];

      const headerOps = wsOperations.getRow(1);
      headerOps.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerOps.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF007079' } // SAP Dark Teal
      };
      headerOps.height = 24;
      headerOps.alignment = { vertical: 'middle', horizontal: 'center' };

      wsOperations.addRows(sampleData.operations);

      // ==========================================
      // Sheet 3: Materials (Step 4: Materials)
      // ==========================================
      const wsMaterials = workbook.addWorksheet('Materials', {
        views: [{ showGridLines: true }]
      });

      wsMaterials.columns = [
        { header: 'Equipment', key: 'equipment', width: 16 },
        { header: 'Material', key: 'material', width: 16 },
        { header: 'Quantity', key: 'qty', width: 14 },
        { header: 'Unit', key: 'unit', width: 12 }
      ];

      const headerMats = wsMaterials.getRow(1);
      headerMats.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerMats.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF107E3E' } // SAP Emerald Green
      };
      headerMats.height = 24;
      headerMats.alignment = { vertical: 'middle', horizontal: 'center' };

      wsMaterials.addRows([
        { order: 'MO-2001', material: 'MAT-001', qty: 2, unit: 'EA' },
        { order: 'MO-2001', material: 'MAT-003', qty: 5, unit: 'L' },
        { order: 'MO-2002', material: 'MAT-001', qty: 1, unit: 'EA' },
        { order: 'MO-2002', material: 'MAT-003', qty: 2, unit: 'L' },
        { order: 'MO-2003', material: 'MAT-002', qty: 1, unit: 'EA' },
        { order: 'MO-2003', material: 'MAT-005', qty: 8, unit: 'SET' }
      ]);

      // ==========================================
      // Sheet 4: Master Data Reference
      // ==========================================
      const wsRef = workbook.addWorksheet('MasterData_Reference', {
        views: [{ showGridLines: true }]
      });

      wsRef.columns = [
        { header: 'Category', key: 'category', width: 18 },
        { header: 'Code / Key', key: 'key', width: 16 },
        { header: 'Description / Details', key: 'details', width: 35 },
        { header: 'Unit Price (USD)', key: 'price', width: 16 }
      ];

      const headerRef = wsRef.getRow(1);
      headerRef.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRef.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4A5568' } // Slate Gray
      };
      headerRef.height = 24;
      headerRef.alignment = { vertical: 'middle', horizontal: 'center' };

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

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="MaintenanceOrders_Template.xlsx"');

      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      console.error('Error generating template:', err);
      res.status(500).json({ error: 'Failed to generate Excel template' });
    }
  });

  // Backend Excel Import Endpoint via ExcelJS
  app.post('/api/maintenance/import-excel', upload.single('file'), async (req, res) => {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ error: 'No Excel file uploaded' });
      }

      const currentUser = req.user?.id || 'Administrator';
      const result = await processExcelImport(req.file.buffer, currentUser);
      return res.status(200).json(result);
    } catch (err) {
      console.error('Error processing Excel import:', err);
      return res.status(500).json({ error: err.message || 'Failed to import Excel file' });
    }
  });

  // REST API Endpoint to query KPI Metrics directly from DB
  app.get('/api/maintenance/kpi-metrics', async (req, res) => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const db = await cds.connect.to('db');

      const sql = `
        SELECT 
          count(case when UPPER(status) = 'OPEN' then 1 end) as "openCount",
          count(case when UPPER(status) in ('IN_PROCESS', 'IN PROCESS', 'IN-PROCESS') then 1 end) as "inProcessCount",
          count(case when UPPER(priority) in ('CRITICAL', '1-VERY HIGH', 'VERY HIGH', '1') then 1 end) as "criticalCount",
          count(case when scheduled_to < '${today}' and UPPER(status) not in ('COMPLETED', 'CANCELLED') then 1 end) as "overdueCount",
          count(1) as "totalOrders",
          sum(case 
            when estimated_cost is not null and estimated_cost > 0 then estimated_cost
            when UPPER(priority) in ('CRITICAL', '1-VERY HIGH', 'VERY HIGH', '1') then 15000
            when UPPER(priority) in ('HIGH', '2-HIGH', '2') then 8000
            when UPPER(priority) in ('MEDIUM', '3-MEDIUM', '3') then 3000
            when UPPER(priority) in ('LOW', '4-LOW', '4') then 1000
            else 0
          end) as "rawEstimatedCost"
        FROM sap_cap_maintenance_MaintenanceOrders
      `;

      let queryResult;
      try {
        queryResult = await db.run(sql);
      } catch (tableErr) {
        console.warn('[server.js] Table query failed, trying view...', tableErr.message);
        const viewSql = sql.replace('sap_cap_maintenance_MaintenanceOrders', 'MaintenanceService_MaintenanceOrders');
        queryResult = await db.run(viewSql);
      }

      const row = (Array.isArray(queryResult) ? queryResult[0] : queryResult) || {};
      const openCount = Number(row.openCount ?? row.OPENCOUNT ?? 0);
      const inProcessCount = Number(row.inProcessCount ?? row.INPROCESSCOUNT ?? 0);
      const criticalCount = Number(row.criticalCount ?? row.CRITICALCOUNT ?? 0);
      const overdueCount = Number(row.overdueCount ?? row.OVERDUECOUNT ?? 0);
      const totalOrders = Number(row.totalOrders ?? row.TOTALORDERS ?? 0);
      const rawEstimatedCost = Number(row.rawEstimatedCost ?? row.RAWESTIMATEDCOST ?? 0);

      let estimatedCost = `$${rawEstimatedCost.toFixed(0)}`;
      if (rawEstimatedCost >= 1000000) {
        estimatedCost = `$${(rawEstimatedCost / 1000000).toFixed(1)}M`;
      } else if (rawEstimatedCost >= 1000) {
        estimatedCost = `$${(rawEstimatedCost / 1000).toFixed(1)}K`;
      }

      res.json({
        openCount,
        inProcessCount,
        criticalCount,
        overdueCount,
        totalOrders,
        rawEstimatedCost,
        estimatedCost,
      });
    } catch (err) {
      console.error('[server.js] Error querying kpi metrics:', err);
      res.status(500).json({ error: 'Failed to query KPI metrics' });
    }
  });
});

module.exports = cds.server;
