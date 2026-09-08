const cds = require("@sap/cds");
const multer = require("multer");
const ExcelJS = require("exceljs");
const { processExcelImport } = require("./excel-import-service");
const { getExcelTemplateSampleData } = require("./excel-template-sample-data");

// Configure multer for file uploads in memory buffer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit for massive Excel files
  },
});

/**
 * Configures HTTP middleware and custom API endpoints during CAP bootstrap.
 *
 * @param {import('express').Application} app Express application instance.
 * @returns {void}
 */
cds.on("bootstrap", (app) => {
  /**
   * Enables CORS for requests from SAP Build Work Zone and Fiori Launchpad.
   *
   * @param {import('express').Request} req HTTP request.
   * @param {import('express').Response} res HTTP response.
   * @param {import('express').NextFunction} next Next middleware callback.
   * @returns {void}
   */
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, PATCH, OPTIONS",
    );
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization, sap-contextid, sap-cancel-on-close",
    );
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  /**
   * Returns the local development user profile.
   *
   * @param {import('express').Request} req HTTP request.
   * @param {import('express').Response} res HTTP response.
   * @returns {void}
   */
  app.get("/user-api/currentUser", (req, res) => {
    res.json({
      name: "Local Admin",
      firstname: "Admin",
      lastname: "Local",
      email: "admin@maintenance.sap",
      displayName: "Local Administrator",
      scopes: ["$XSAPPNAME.Admin", "$XSAPPNAME.User"],
    });
  });

  /**
   * Generates and streams the multi-sheet maintenance-order Excel template.
   *
   * @param {import('express').Request} req HTTP request.
   * @param {import('express').Response} res HTTP response.
   * @returns {Promise<void>} Resolves after the workbook is streamed or an error response is sent.
   */
  app.get("/api/maintenance/download-template", async (req, res) => {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "SAP Maintenance Cockpit";
      workbook.created = new Date();
      const sampleData = getExcelTemplateSampleData();

      // ==========================================
      // Sheet 1: Maintenance Orders (Header)
      // ==========================================
      const wsOrders = workbook.addWorksheet("MaintenanceOrders", {
        views: [{ showGridLines: true }],
      });

      wsOrders.columns = [
        { header: "Equipment", key: "equipment", width: 16 },
        { header: "Description", key: "description", width: 38 },
        { header: "Plant", key: "plant", width: 12 },
        { header: "Type", key: "type", width: 16 },
        { header: "Priority", key: "priority", width: 14 },
        { header: "Planner", key: "planner", width: 16 },
        { header: "ScheduledFrom", key: "scheduledFrom", width: 16 },
        { header: "ScheduledTo", key: "scheduledTo", width: 16 },
        {
          header: "Operations (Inline Optional)",
          key: "operations",
          width: 38,
        },
        { header: "Materials (Inline Optional)", key: "materials", width: 32 },
      ];

      const headerOrders = wsOrders.getRow(1);
      headerOrders.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerOrders.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF004B87" }, // SAP Fiori Blue
      };
      headerOrders.height = 24;
      headerOrders.alignment = { vertical: "middle", horizontal: "center" };

      wsOrders.addRows(sampleData.orders);

      // ==========================================
      // Sheet 2: Operations (Step 3: Operations)
      // ==========================================
      const wsOperations = workbook.addWorksheet("Operations", {
        views: [{ showGridLines: true }],
      });

      wsOperations.columns = [
        { header: "Equipment", key: "equipment", width: 16 },
        { header: "OperationNo", key: "no", width: 14 },
        { header: "Description", key: "description", width: 38 },
        { header: "WorkCenter", key: "workCenter", width: 16 },
        { header: "Technician", key: "technician", width: 16 },
        { header: "PlannedHours", key: "plannedHours", width: 16 },
      ];

      const headerOps = wsOperations.getRow(1);
      headerOps.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerOps.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF007079" }, // SAP Dark Teal
      };
      headerOps.height = 24;
      headerOps.alignment = { vertical: "middle", horizontal: "center" };

      wsOperations.addRows(sampleData.operations);

      // ==========================================
      // Sheet 3: Materials (Step 4: Materials)
      // ==========================================
      const wsMaterials = workbook.addWorksheet("Materials", {
        views: [{ showGridLines: true }],
      });

      wsMaterials.columns = [
        { header: "Equipment", key: "equipment", width: 16 },
        { header: "Material", key: "material", width: 16 },
        { header: "Quantity", key: "qty", width: 14 },
        { header: "Unit", key: "unit", width: 12 },
      ];

      const headerMats = wsMaterials.getRow(1);
      headerMats.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerMats.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF107E3E" }, // SAP Emerald Green
      };
      headerMats.height = 24;
      headerMats.alignment = { vertical: "middle", horizontal: "center" };

      wsMaterials.addRows(sampleData.materials);

      // ==========================================
      // Sheet 4: Master Data Reference
      // ==========================================
      const wsRef = workbook.addWorksheet("MasterData_Reference", {
        views: [{ showGridLines: true }],
      });

      wsRef.columns = [
        { header: "Category", key: "category", width: 18 },
        { header: "Code / Key", key: "key", width: 16 },
        { header: "Description / Details", key: "details", width: 35 },
        { header: "Unit Price (USD)", key: "price", width: 16 },
      ];

      const headerRef = wsRef.getRow(1);
      headerRef.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRef.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF4A5568" }, // Slate Gray
      };
      headerRef.height = 24;
      headerRef.alignment = { vertical: "middle", horizontal: "center" };

      wsRef.addRows(sampleData.masterData);

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="MaintenanceOrders_Template.xlsx"',
      );

      await workbook.xlsx.write(res);
      res.end();
    } catch (err) {
      console.error("Error generating template:", err);
      res.status(500).json({ error: "Failed to generate Excel template" });
    }
  });

  /**
   * Imports maintenance orders from an uploaded Excel workbook.
   *
   * @param {import('express').Request} req HTTP request containing the uploaded file.
   * @param {import('express').Response} res HTTP response.
   * @returns {Promise<import('express').Response>} Import result or an error response.
   */
  app.post(
    "/api/maintenance/import-excel",
    upload.single("file"),
    async (req, res) => {
      try {
        if (!req.file || !req.file.buffer) {
          return res.status(400).json({ error: "No Excel file uploaded" });
        }

        const currentUser = req.user?.id || "Administrator";
        const result = await processExcelImport(req.file.buffer, currentUser);
        return res.status(200).json(result);
      } catch (err) {
        console.error("Error processing Excel import:", err);
        return res
          .status(500)
          .json({ error: err.message || "Failed to import Excel file" });
      }
    },
  );
});

module.exports = cds.server;
