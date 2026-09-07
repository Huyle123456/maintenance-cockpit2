const ExcelJS = require("exceljs");
const cds = global.cds || require("@sap/cds");

/**
 * Cleans and normalizes an ExcelJS cell value.
 *
 * @param {*} val ExcelJS cell value to normalize.
 * @returns {string} Normalized cell text.
 */
function cleanCellValue(val) {
  if (val === null || val === undefined) return "";
  if (typeof val === "object") {
    if (val instanceof Date) {
      return val.toISOString().slice(0, 10);
    }
    if (val.text !== undefined) return String(val.text).trim();
    if (val.result !== undefined) return String(val.result).trim();
    if (Array.isArray(val.richText)) {
      return val.richText
        .map((t) => t.text || "")
        .join("")
        .trim();
    }
  }
  return String(val).trim();
}

/**
 * Normalizes a date value to the YYYY-MM-DD format.
 * Supports:
 * - Date objects
 * - ISO strings (YYYY-MM-DD)
 * - Slash formats (DD/MM/YYYY or MM/DD/YYYY)
 * - Excel serial number dates (e.g., 45123)
 *
 * @param {*} rawDate Date value to normalize.
 * @returns {string} Normalized date string in YYYY-MM-DD format.
 */
function normalizeDate(rawDate) {
  if (!rawDate) return new Date().toISOString().slice(0, 10);
  if (rawDate instanceof Date) {
    if (!isNaN(rawDate.getTime())) {
      return rawDate.toISOString().slice(0, 10);
    }
    return new Date().toISOString().slice(0, 10);
  }

  // Handle numeric Excel date serial number (e.g. 45231)
  if (typeof rawDate === "number" || (!isNaN(rawDate) && !isNaN(parseFloat(rawDate)) && String(rawDate).indexOf("-") === -1 && String(rawDate).indexOf("/") === -1)) {
    const serial = parseFloat(rawDate);
    if (serial > 1000) {
      const utcDays = Math.floor(serial - 25569);
      const utcValue = utcDays * 86400;
      const dateInfo = new Date(utcValue * 1000);
      if (!isNaN(dateInfo.getTime())) {
        return dateInfo.toISOString().slice(0, 10);
      }
    }
  }

  const s = String(rawDate).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Check DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = s.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})$/);
  if (dmyMatch) {
    let day = parseInt(dmyMatch[1], 10);
    let month = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);
    // If month > 12 and day <= 12, swap
    if (month > 12 && day <= 12) {
      const temp = day;
      day = month;
      month = temp;
    }
    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return `${year}-${mm}-${dd}`;
  }

  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

/**
 * Builds a normalized header-to-column-index lookup.
 *
 * @param {import('exceljs').Worksheet} worksheet Worksheet containing the header row.
 * @returns {Record<string, number>} Header map keyed by normalized header text.
 */
function buildHeaderMap(worksheet) {
  const headerMap = {};
  if (!worksheet || worksheet.rowCount < 1) return headerMap;

  const headerRow = worksheet.getRow(1);
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const cleanName = cleanCellValue(cell.value)
      .toLowerCase()
      .replace(/[\s_\-#.]+/g, "");
    if (cleanName) {
      headerMap[cleanName] = colNumber;
    }
  });
  return headerMap;
}

/**
 * Gets the first populated value for a set of possible column names.
 *
 * @param {import('exceljs').Row} row Worksheet row to read.
 * @param {Record<string, number>} headerMap Header-to-column-index lookup.
 * @param {string[]} possibleKeys Candidate normalized column names.
 * @param {string} def Fallback value when no candidate column has a value.
 * @returns {string} Cell value or the supplied fallback.
 */
function getRowVal(row, headerMap, possibleKeys, def = "") {
  for (const k of possibleKeys) {
    const colIdx = headerMap[k];
    if (colIdx !== undefined) {
      const cell = row.getCell(colIdx);
      if (cell && cell.value !== null && cell.value !== undefined) {
        const v = cleanCellValue(cell.value);
        if (v !== "") return v;
      }
    }
  }
  return def;
}

/**
 * Normalizes Maintenance Type strings to valid system values.
 *
 * @param {string} raw
 * @returns {string} PREVENTIVE | CORRECTIVE | EMERGENCY
 */
function normalizeMaintenanceType(raw) {
  if (!raw) return "PREVENTIVE";
  const s = String(raw).toUpperCase().trim();
  if (s.includes("PREV") || s.includes("PHÒNG") || s.includes("ĐỊNH KỲ") || s.includes("PLAN")) {
    return "PREVENTIVE";
  }
  if (s.includes("CORR") || s.includes("SỬA CHỮA") || s.includes("FIX") || s.includes("BREAK")) {
    return "CORRECTIVE";
  }
  if (s.includes("EMERG") || s.includes("KHẨN") || s.includes("URGENT")) {
    return "EMERGENCY";
  }
  return "PREVENTIVE";
}

/**
 * Normalizes Priority strings and determines UI state.
 *
 * @param {string} raw
 * @returns {{ priority: string, priorityState: string }}
 */
function normalizePriority(raw) {
  if (!raw) return { priority: "MEDIUM", priorityState: "Warning" };
  const s = String(raw).toUpperCase().trim();
  if (s.includes("CRIT") || s.includes("KHẨN") || s.includes("VERY HIGH") || s.includes("P1")) {
    return { priority: "CRITICAL", priorityState: "Error" };
  }
  if (s.includes("HIGH") || s.includes("CAO") || s.includes("P2")) {
    return { priority: "HIGH", priorityState: "Error" };
  }
  if (s.includes("LOW") || s.includes("THẤP") || s.includes("P4")) {
    return { priority: "LOW", priorityState: "Success" };
  }
  return { priority: "MEDIUM", priorityState: "Warning" };
}

/**
 * Process Excel file buffer using ExcelJS
 * Supports:
 * 1. Upsert when Order ID already exists in DB (Updates header + syncs operations/materials)
 * 2. Multi-row Order grouping within the same Excel file
 * 3. Auto-sequence generation when Order ID is blank (MO-XXXX)
 * 4. Multi-Sheet imports (Sheet 1: MaintenanceOrders, Sheet 2: Operations, Sheet 3: Materials)
 * 5. Single-Sheet imports with inline operations/materials
 * 6. Date inversion auto-correction (swaps if scheduledFrom > scheduledTo)
 * 7. Master data normalization and safe fallbacks for Equipment, Plant, Type, Priority, Planner
 * 8. Automatic Material Catalog lookup and price/cost calculations
 * 9. Safe batch DB transaction processing with detailed Audit & History logs
 *
 * @param {Buffer|import('stream').Readable} fileSource File buffer or stream
 * @param {string} currentUser ID of user performing import
 * @param {object} options Optional configs (batchSize, etc.)
 * @returns {Promise<{
 *   success: boolean,
 *   totalRows: number,
 *   importedCount: number,
 *   createdCount: number,
 *   updatedCount: number,
 *   operationsCount: number,
 *   materialsCount: number,
 *   failedCount: number,
 *   durationMs: number,
 *   durationSec: string,
 *   warnings: Array<{row: number, order: string, message: string}>,
 *   errors: Array<{row: number, order: string, details: string}>
 * }>}
 */
async function processExcelImport(
  fileSource,
  currentUser = "Current User",
  options = {},
) {
  const startTime = Date.now();
  const db = await cds.connect.to("db");
  const {
    MaintenanceOrders,
    Equipments,
    Plants,
    MaintenanceTypes,
    Priorities,
    Planners,
    WorkCenters,
    MaterialCatalog,
    MaintenanceOperations,
    OrderMaterials,
    AuditHistory,
    OrderHistory,
  } = cds.entities("sap.cap.maintenance");

  // Step 1: Pre-fetch master data cache for validation and fallbacks
  const [
    aEquipments,
    aPlants,
    aTypes,
    aPriorities,
    aPlanners,
    aWorkCenters,
    aMaterialsCatalog,
    aExistingOrders,
  ] = await Promise.all([
    SELECT.from(Equipments).columns("equipment"),
    SELECT.from(Plants).columns("key"),
    SELECT.from(MaintenanceTypes).columns("key"),
    SELECT.from(Priorities).columns("key"),
    SELECT.from(Planners).columns("key"),
    SELECT.from(WorkCenters).columns("key"),
    SELECT.from(MaterialCatalog).columns(
      "key",
      "description",
      "unit",
      "unitPrice",
    ),
    SELECT.from(MaintenanceOrders).columns("order_no", "status", "status_state"),
  ]);

  const setEquipments = new Set((aEquipments || []).map((e) => e.equipment));
  const setPlants = new Set((aPlants || []).map((p) => p.key));
  const setTypes = new Set((aTypes || []).map((t) => t.key));
  const setPriorities = new Set((aPriorities || []).map((p) => p.key));
  const setPlanners = new Set((aPlanners || []).map((p) => p.key));
  const setWorkCenters = new Set((aWorkCenters || []).map((w) => w.key));

  const mapMaterialsCatalog = new Map();
  (aMaterialsCatalog || []).forEach((m) => {
    mapMaterialsCatalog.set(String(m.key).toUpperCase().trim(), {
      material: m.key,
      description: m.description || m.key,
      unit: m.unit || "EA",
      unitPrice: Number(m.unitPrice) || 25.0,
    });
  });

  // Map of existing orders in DB: order_no -> { status, status_state }
  const mapExistingOrders = new Map();
  let maxOrderSeq = 1000;
  (aExistingOrders || []).forEach((o) => {
    mapExistingOrders.set(o.order_no, o);
    const m = String(o.order_no).match(/MO-(\d+)/i);
    if (m) {
      const num = parseInt(m[1], 10);
      if (num > maxOrderSeq) maxOrderSeq = num;
    }
  });

  let nextOrderNum = maxOrderSeq + 1;

  // Step 2: Load workbook
  const workbook = new ExcelJS.Workbook();
  let buffer = fileSource;
  if (!Buffer.isBuffer(fileSource)) {
    const chunks = [];
    for await (const chunk of fileSource) {
      chunks.push(chunk);
    }
    buffer = Buffer.concat(chunks);
  }
  await workbook.xlsx.load(buffer);

  // Identify worksheets
  const orderSheet =
    workbook.getWorksheet("MaintenanceOrders") ||
    workbook.getWorksheet("maintenanceorders") ||
    workbook.worksheets[0];
  const opSheet =
    workbook.getWorksheet("Operations") ||
    workbook.getWorksheet("operations") ||
    workbook.getWorksheet("maintenanceoperations");
  const matSheet =
    workbook.getWorksheet("Materials") ||
    workbook.getWorksheet("materials") ||
    workbook.getWorksheet("ordermaterials");

  if (!orderSheet || orderSheet.rowCount < 2) {
    throw new Error("The uploaded Excel file has no order rows to process.");
  }

  // Step 3: Parse Operations from Operations Sheet (if present)
  // Map: normalizedOrderNo -> Array of operation objects
  const operationsByOrder = new Map();
  if (opSheet && opSheet.rowCount >= 2) {
    const opHeaderMap = buildHeaderMap(opSheet);
    opSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return; // skip header
      const rawOrderKey = getRowVal(row, opHeaderMap, [
        "order",
        "orderno",
        "orderid",
        "id",
      ]).toUpperCase().trim();
      const rawNo = getRowVal(
        row,
        opHeaderMap,
        ["operationno", "no", "opno", "seq"],
        "10",
      );
      const rawDesc = getRowVal(
        row,
        opHeaderMap,
        ["description", "operationdescription", "task", "desc"],
        "Inspection & Maintenance",
      );
      const rawWc = getRowVal(row, opHeaderMap, ["workcenter", "wc"], "WC-001");
      const rawTech = getRowVal(
        row,
        opHeaderMap,
        ["technician", "tech", "assignedtechnician"],
        "T-001",
      );
      const rawHours =
        parseFloat(
          getRowVal(
            row,
            opHeaderMap,
            ["plannedhours", "hours", "duration"],
            "2",
          ),
        ) || 2.0;

      if (rawOrderKey) {
        if (!operationsByOrder.has(rawOrderKey)) {
          operationsByOrder.set(rawOrderKey, []);
        }
        operationsByOrder.get(rawOrderKey).push({
          no: String(rawNo),
          description: rawDesc,
          workCenter: setWorkCenters.has(rawWc) ? rawWc : "WC-001",
          technician: rawTech || "T-001",
          plannedHours: rawHours,
          actualHours: 0.0,
          status: "OPEN",
        });
      }
    });
  }

  // Step 4: Parse Materials from Materials Sheet (if present)
  // Map: normalizedOrderNo -> Array of material objects
  const materialsByOrder = new Map();
  if (matSheet && matSheet.rowCount >= 2) {
    const matHeaderMap = buildHeaderMap(matSheet);
    matSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return; // skip header
      const rawOrderKey = getRowVal(row, matHeaderMap, [
        "order",
        "orderno",
        "orderid",
        "id",
      ]).toUpperCase().trim();
      const rawMat = getRowVal(
        row,
        matHeaderMap,
        ["material", "materialid", "part", "matno"],
        "MAT-001",
      ).toUpperCase().trim();
      const rawQty =
        parseFloat(
          getRowVal(row, matHeaderMap, ["quantity", "qty", "amount"], "1"),
        ) || 1.0;
      const rawUnit = getRowVal(row, matHeaderMap, ["unit", "uom"], "EA");

      if (rawOrderKey && rawMat) {
        if (!materialsByOrder.has(rawOrderKey)) {
          materialsByOrder.set(rawOrderKey, []);
        }
        const catalogItem = mapMaterialsCatalog.get(rawMat) || {
          material: rawMat,
          description: rawMat,
          unit: rawUnit || "EA",
          unitPrice: 25.0,
        };

        const unitPrice = catalogItem.unitPrice || 25.0;
        const value = rawQty * unitPrice;

        materialsByOrder.get(rawOrderKey).push({
          material: catalogItem.material || rawMat,
          description: catalogItem.description,
          qty: rawQty,
          unit: catalogItem.unit || rawUnit || "EA",
          unitPrice: unitPrice,
          value: value,
        });
      }
    });
  }

  // Step 5: Read Orders sheet and group rows
  const orderHeaderMap = buildHeaderMap(orderSheet);
  let totalRows = 0;
  let failedCount = 0;
  const warnings = [];
  const errors = [];

  // Grouping map to handle in-file duplicates and multi-line definitions:
  // key: order_no -> { orderEntity, isUpdate, operations: [], materials: [], rowNumbers: [] }
  const groupedOrders = new Map();

  orderSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // skip header

    // Read all values
    let rawOrderNo = getRowVal(row, orderHeaderMap, [
      "order",
      "orderno",
      "orderid",
      "id",
    ]);
    const rawEquipment = getRowVal(row, orderHeaderMap, [
      "equipment",
      "equipmentno",
      "equipmentid",
      "eq",
    ]);
    const rawDescription = getRowVal(row, orderHeaderMap, [
      "description",
      "orderdescription",
      "desc",
      "title",
    ]);
    const rawPlant = getRowVal(row, orderHeaderMap, [
      "plant",
      "plantid",
    ]);
    const rawType = getRowVal(row, orderHeaderMap, [
      "type",
      "maintenancetype",
      "ordertype",
    ]);
    const rawPriority = getRowVal(row, orderHeaderMap, [
      "priority",
      "prio",
    ]);
    const rawPlanner = getRowVal(row, orderHeaderMap, [
      "planner",
      "plannerid",
      "assignedplanner",
    ]);
    const rawFrom = getRowVal(row, orderHeaderMap, [
      "scheduledfrom",
      "from",
      "startdate",
      "scheduledstart",
    ]);
    const rawTo = getRowVal(row, orderHeaderMap, [
      "scheduledto",
      "to",
      "enddate",
      "scheduledend",
    ]);
    const inlineOps = getRowVal(row, orderHeaderMap, [
      "operations",
      "operationlist",
      "tasks",
    ]);
    const inlineMats = getRowVal(row, orderHeaderMap, [
      "materials",
      "materiallist",
      "parts",
    ]);

    // Check if entire row is empty (ghost row)
    if (!rawOrderNo && !rawDescription && !rawEquipment && !rawPlant && !inlineOps && !inlineMats) {
      return; // ignore empty ghost row
    }

    totalRows++;

    // Edge Case 4: Normalize Order Number (casing, prefix, trim)
    if (rawOrderNo) {
      rawOrderNo = rawOrderNo.trim().toUpperCase();
      if (/^\d+$/.test(rawOrderNo)) {
        // Pure number like 1001 -> convert to MO-1001
        rawOrderNo = `MO-${rawOrderNo}`;
      }
    }

    // Edge Case 3: Missing / Empty Order ID -> Auto generate sequence
    if (!rawOrderNo) {
      while (mapExistingOrders.has(`MO-${nextOrderNum}`) || groupedOrders.has(`MO-${nextOrderNum}`)) {
        nextOrderNum++;
      }
      rawOrderNo = `MO-${nextOrderNum++}`;
      warnings.push({
        row: rowNumber,
        order: rawOrderNo,
        message: `Empty Order ID auto-assigned to '${rawOrderNo}'.`,
      });
    }

    // Edge Case 1: Detect if this order already exists in DB
    const existingInDb = mapExistingOrders.get(rawOrderNo);
    const isUpdate = !!existingInDb;

    // Edge Case 5: Master Data Fallbacks & Normalization
    // Equipment validation & fallback
    let equipmentNo = rawEquipment ? rawEquipment.trim().toUpperCase() : "";
    if (!equipmentNo || (setEquipments.size > 0 && !setEquipments.has(equipmentNo))) {
      const fallbackEq = "EQ-001";
      if (equipmentNo) {
        warnings.push({
          row: rowNumber,
          order: rawOrderNo,
          message: `Equipment '${equipmentNo}' not found in master data; fallback to '${fallbackEq}'.`,
        });
      }
      equipmentNo = fallbackEq;
    }

    // Description fallback
    const description = rawDescription || `Maintenance for ${equipmentNo}`;

    // Plant fallback
    let plant = rawPlant ? rawPlant.trim().toUpperCase() : "1000";
    if (setPlants.size > 0 && !setPlants.has(plant)) {
      plant = "1000";
    }

    // Type normalization
    const maintenanceType = normalizeMaintenanceType(rawType);

    // Priority normalization
    const { priority, priorityState } = normalizePriority(rawPriority);

    // Planner fallback
    let planner = rawPlanner ? rawPlanner.trim() : "";
    if (!planner || (setPlanners.size > 0 && !setPlanners.has(planner))) {
      planner = currentUser && currentUser !== "Current User" ? currentUser : "JOHN";
    }

    // Edge Case 6: Date Parsing & Inversion Auto-Correction
    let scheduledFrom = normalizeDate(rawFrom);
    let scheduledTo = normalizeDate(rawTo || rawFrom);

    if (scheduledFrom && scheduledTo && scheduledFrom > scheduledTo) {
      warnings.push({
        row: rowNumber,
        order: rawOrderNo,
        message: `Start date (${scheduledFrom}) was after end date (${scheduledTo}); dates automatically aligned.`,
      });
      // Auto-correct: swap or align
      const temp = scheduledFrom;
      scheduledFrom = scheduledTo;
      scheduledTo = temp;
    }

    // Parse Inline Operations if provided
    const rowOps = [];
    if (inlineOps) {
      const parts = inlineOps.split(/[;,|]+/);
      parts.forEach((p, idx) => {
        const segs = p.split(/[:\-]/);
        const opNo = segs.length > 1 ? segs[0].trim() : String((idx + 1) * 10);
        const opDesc = segs.length > 1 ? segs[1].trim() : segs[0].trim();
        const opHours =
          segs.length > 2
            ? parseFloat(segs[2].replace(/[^\d.]/g, "")) || 2.0
            : 2.0;
        if (opDesc) {
          rowOps.push({
            order_no: rawOrderNo,
            no: opNo,
            description: opDesc,
            workCenter: "WC-001",
            technician: "T-001",
            plannedHours: opHours,
            actualHours: 0.0,
            status: "OPEN",
          });
        }
      });
    }

    // Parse Inline Materials if provided
    const rowMats = [];
    if (inlineMats) {
      const parts = inlineMats.split(/[;,|]+/);
      parts.forEach((p) => {
        const segs = p.split(/[:\-xX\s*]+/);
        const matKey = segs[0]?.trim()?.toUpperCase();
        const matQty =
          segs.length > 1
            ? parseFloat(segs[1].replace(/[^\d.]/g, "")) || 1.0
            : 1.0;
        if (matKey) {
          const catalogItem = mapMaterialsCatalog.get(matKey) || {
            material: matKey,
            description: matKey,
            unit: "EA",
            unitPrice: 25.0,
          };
          const unitPrice = catalogItem.unitPrice || 25.0;
          rowMats.push({
            order_no: rawOrderNo,
            material: catalogItem.material || matKey,
            description: catalogItem.description,
            qty: Math.max(0.1, matQty),
            unit: catalogItem.unit || "EA",
            unitPrice: unitPrice,
            value: Math.max(0.1, matQty) * unitPrice,
          });
        }
      });
    }

    // Edge Case 2: Grouping orders if multiple rows share the same Order ID in the file
    if (groupedOrders.has(rawOrderNo)) {
      const existingGroup = groupedOrders.get(rawOrderNo);
      existingGroup.rowNumbers.push(rowNumber);
      // Append additional operations/materials
      if (rowOps.length > 0) {
        rowOps.forEach((op) => existingGroup.operations.push(op));
      }
      if (rowMats.length > 0) {
        rowMats.forEach((mat) => existingGroup.materials.push(mat));
      }
      // Update header details if previously empty
      if (rawDescription) existingGroup.orderEntity.description = description;
      if (rawEquipment) existingGroup.orderEntity.equipment_no = equipmentNo;
      if (rawPlant) existingGroup.orderEntity.plant = plant;
    } else {
      // Determine initial status
      const status = existingInDb ? existingInDb.status || "OPEN" : "OPEN";
      const statusState = existingInDb ? existingInDb.status_state || "Success" : "Success";

      // Check external operations sheet
      const extOps = operationsByOrder.get(rawOrderNo) || [];
      const extMats = materialsByOrder.get(rawOrderNo) || [];

      const combinedOps = [...extOps.map((o) => ({ ...o, order_no: rawOrderNo })), ...rowOps];
      const combinedMats = [...extMats.map((m) => ({ ...m, order_no: rawOrderNo })), ...rowMats];

      groupedOrders.set(rawOrderNo, {
        order_no: rawOrderNo,
        isUpdate,
        rowNumbers: [rowNumber],
        orderEntity: {
          order_no: rawOrderNo,
          equipment_no: equipmentNo,
          description: description,
          plant: plant,
          maintenance_type: maintenanceType,
          priority: priority,
          priority_state: priorityState,
          status: status,
          status_state: statusState,
          planner: planner,
          scheduled_from: scheduledFrom,
          scheduled_to: scheduledTo,
          currency: "USD",
          etag: `W/"${Date.now()}"`,
        },
        operations: combinedOps,
        materials: combinedMats,
      });
    }
  });

  // Step 6: Post-process operations, materials, and aggregate calculations for each order
  let createdCount = 0;
  let updatedCount = 0;
  let totalOpsImported = 0;
  let totalMatsImported = 0;

  const ordersToInsert = [];
  const ordersToUpdate = [];
  const operationsToSave = []; // list of ops with clean sequences
  const materialsToSave = [];  // list of mats aggregated by (order_no, material)
  const historyToInsert = [];

  for (const [orderNo, group] of groupedOrders.entries()) {
    // 1. Ensure at least one default operation exists
    if (group.operations.length === 0) {
      group.operations.push({
        order_no: orderNo,
        no: "10",
        description: "Standard Maintenance & Inspection",
        workCenter: "WC-001",
        technician: "T-001",
        plannedHours: 2.0,
        actualHours: 0.0,
        status: "OPEN",
      });
    }

    // Normalize operation sequences (10, 20, 30...) to prevent duplicate keys in MaintenanceOperations
    const uniqueOpsMap = new Map();
    group.operations.forEach((op, idx) => {
      let opNo = op.no || String((idx + 1) * 10);
      if (uniqueOpsMap.has(opNo)) {
        opNo = String((uniqueOpsMap.size + 1) * 10);
      }
      uniqueOpsMap.set(opNo, {
        order_no: orderNo,
        no: opNo,
        description: op.description || "Maintenance Task",
        workCenter: setWorkCenters.has(op.workCenter) ? op.workCenter : "WC-001",
        technician: op.technician || "T-001",
        plannedHours: Number(op.plannedHours) || 2.0,
        actualHours: Number(op.actualHours) || 0.0,
        status: op.status || "OPEN",
      });
    });

    const finalOps = Array.from(uniqueOpsMap.values());

    // 2. Aggregate Materials by material key (since key is order_no + material)
    const uniqueMatsMap = new Map();
    group.materials.forEach((mat) => {
      const matKey = String(mat.material).toUpperCase().trim();
      if (uniqueMatsMap.has(matKey)) {
        const existing = uniqueMatsMap.get(matKey);
        existing.qty += Number(mat.qty) || 1.0;
        existing.value = existing.qty * existing.unitPrice;
      } else {
        const catalogItem = mapMaterialsCatalog.get(matKey) || {
          material: matKey,
          description: mat.description || matKey,
          unit: mat.unit || "EA",
          unitPrice: Number(mat.unitPrice) || 25.0,
        };
        const unitPrice = catalogItem.unitPrice || 25.0;
        const qty = Number(mat.qty) || 1.0;
        uniqueMatsMap.set(matKey, {
          order_no: orderNo,
          material: catalogItem.material || matKey,
          description: catalogItem.description,
          qty: qty,
          unit: catalogItem.unit || "EA",
          unitPrice: unitPrice,
          value: qty * unitPrice,
        });
      }
    });

    const finalMats = Array.from(uniqueMatsMap.values());

    // 3. Compute aggregations
    const totalPlannedHours = finalOps.reduce((sum, o) => sum + (Number(o.plannedHours) || 0), 0);
    const totalMaterialCost = finalMats.reduce((sum, m) => sum + (Number(m.value) || 0), 0);
    const laborRatePerHour = 50.0;
    const estimatedCost = totalMaterialCost + totalPlannedHours * laborRatePerHour;

    group.orderEntity.operation_count = finalOps.length;
    group.orderEntity.planned_hours = totalPlannedHours;
    group.orderEntity.estimated_cost = estimatedCost;

    finalOps.forEach((op) => operationsToSave.push(op));
    finalMats.forEach((mat) => materialsToSave.push(mat));

    const timestampStr = new Date().toISOString().replace("T", " ").substring(0, 16);

    if (group.isUpdate) {
      ordersToUpdate.push(group.orderEntity);
      historyToInsert.push({
        order_no: orderNo,
        title: "Order updated via Excel import (Upsert)",
        dateTime: timestampStr,
        userName: currentUser,
        text: `Order data synced from Excel with ${finalOps.length} operation(s) and ${finalMats.length} material(s).`,
        icon: "sap-icon://synchronize",
      });
      updatedCount++;
    } else {
      group.orderEntity.completed_operation_count = 0;
      group.orderEntity.actual_hours = 0.0;
      ordersToInsert.push(group.orderEntity);
      historyToInsert.push({
        order_no: orderNo,
        title: "Order created via Excel import",
        dateTime: timestampStr,
        userName: currentUser,
        text: `Maintenance order imported with ${finalOps.length} operation(s) and ${finalMats.length} material(s).`,
        icon: "sap-icon://excel-attachment",
      });
      createdCount++;
    }

    totalOpsImported += finalOps.length;
    totalMatsImported += finalMats.length;
  }

  // Step 7: Execute Database Transaction
  await cds.tx(async () => {
    // 1. Insert new orders
    if (ordersToInsert.length > 0) {
      await INSERT.into(MaintenanceOrders).entries(ordersToInsert);
    }

    // 2. Update existing orders
    for (const ord of ordersToUpdate) {
      await UPDATE.entity(MaintenanceOrders)
        .where({ order_no: ord.order_no })
        .set({
          equipment_no: ord.equipment_no,
          description: ord.description,
          plant: ord.plant,
          maintenance_type: ord.maintenance_type,
          priority: ord.priority,
          priority_state: ord.priority_state,
          planner: ord.planner,
          scheduled_from: ord.scheduled_from,
          scheduled_to: ord.scheduled_to,
          operation_count: ord.operation_count,
          planned_hours: ord.planned_hours,
          estimated_cost: ord.estimated_cost,
          etag: ord.etag,
        });

      // Clear previous operations and materials for updated orders before re-inserting fresh sync
      await DELETE.from(MaintenanceOperations).where({ order_no: ord.order_no });
      await DELETE.from(OrderMaterials).where({ order_no: ord.order_no });
    }

    // 3. Save all operations
    if (operationsToSave.length > 0) {
      await INSERT.into(MaintenanceOperations).entries(operationsToSave);
    }

    // 4. Save all materials
    if (materialsToSave.length > 0) {
      await INSERT.into(OrderMaterials).entries(materialsToSave);
    }

    // 5. Save order history
    if (historyToInsert.length > 0) {
      await INSERT.into(OrderHistory).entries(historyToInsert);
    }
  });

  const durationMs = Date.now() - startTime;
  const durationSec = (durationMs / 1000).toFixed(2);
  const importedCount = createdCount + updatedCount;

  // Step 8: Record Audit Log for the bulk import
  if (importedCount > 0) {
    const timestampStr = new Date()
      .toISOString()
      .replace("T", " ")
      .substring(0, 16);
    await INSERT.into(AuditHistory).entries({
      timestamp: timestampStr,
      user: currentUser,
      object: `Bulk Import (${importedCount} orders)`,
      action: "IMPORT",
      details: `Imported ${importedCount} orders (${createdCount} created, ${updatedCount} updated), ${totalOpsImported} operations, and ${totalMatsImported} materials in ${durationSec}s.`,
    });
  }

  return {
    success: true,
    totalRows,
    importedCount,
    createdCount,
    updatedCount,
    operationsCount: totalOpsImported,
    materialsCount: totalMatsImported,
    failedCount,
    durationMs,
    durationSec: `${durationSec}s`,
    warnings,
    errors,
  };
}

module.exports = {
  processExcelImport,
  normalizeDate,
  normalizeMaintenanceType,
  normalizePriority,
};

