const cds = require('@sap/cds');
const multer = require('multer');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const { processExcelImport } = require('./srv/excel-import-service');

// Configure multer for file uploads in memory buffer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit for massive Excel files
  }
});

cds.on('bootstrap', (app) => {
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

  // Download Excel Template endpoint via ExcelJS
  app.get('/api/maintenance/download-template', async (req, res) => {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('MaintenanceOrders');

      worksheet.columns = [
        { header: 'Order', key: 'order', width: 14 },
        { header: 'Equipment', key: 'equipment', width: 14 },
        { header: 'Description', key: 'description', width: 35 },
        { header: 'Plant', key: 'plant', width: 10 },
        { header: 'Type', key: 'type', width: 16 },
        { header: 'Priority', key: 'priority', width: 14 },
        { header: 'Planner', key: 'planner', width: 18 },
        { header: 'ScheduledFrom', key: 'scheduledFrom', width: 16 },
        { header: 'ScheduledTo', key: 'scheduledTo', width: 16 }
      ];

      // Style Header Row
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF004B87' }
      };

      // Sample Data Rows
      worksheet.addRows([
        { order: 'MO-2001', equipment: 'EQ-001', description: 'Pump A Monthly Inspection', plant: '1000', type: 'PREVENTIVE', priority: 'HIGH', planner: 'John Doe', scheduledFrom: '2026-09-10', scheduledTo: '2026-09-15' },
        { order: 'MO-2002', equipment: 'EQ-002', description: 'Motor Bearing Check', plant: '2000', type: 'CORRECTIVE', priority: 'MEDIUM', planner: 'Sarah Connor', scheduledFrom: '2026-09-12', scheduledTo: '2026-09-18' },
        { order: 'MO-2003', equipment: 'EQ-003', description: 'Emergency Valve Fix', plant: '3000', type: 'EMERGENCY', priority: 'CRITICAL', planner: 'Alex Smith', scheduledFrom: '2026-09-05', scheduledTo: '2026-09-05' },
        { order: 'MO-2004', equipment: 'EQ-004', description: 'Conveyor Belt Alignment', plant: '1000', type: 'PREVENTIVE', priority: 'LOW', planner: 'John Doe', scheduledFrom: '2026-09-20', scheduledTo: '2026-09-25' },
        { order: 'MO-2005', equipment: 'EQ-005', description: 'Turbine Oil Replacement', plant: '2000', type: 'PREVENTIVE', priority: 'HIGH', planner: 'Sarah Connor', scheduledFrom: '2026-09-15', scheduledTo: '2026-09-22' }
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

  // Backend Excel Import Endpoint via ExcelJS Streaming
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
});

module.exports = cds.server;
