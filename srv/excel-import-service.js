const crypto = require("crypto");
const ExcelJS = require("exceljs");
const XLSX = require("xlsx");
const cds = global.cds || require("@sap/cds");
const { getText } = require("./i18n");
const {
  ORDER_STATUS,
  PRIORITY,
  MAINTENANCE_TYPE,
  VALUE_STATE,
  IMPORT_CONFIG,
} = require("./constants");


/**
 * Normalizes Maintenance Type strings to valid system values.
 *
 * @param {string} raw Raw maintenance type from Excel.
 * @returns {string} PREVENTIVE | CORRECTIVE | EMERGENCY
 */
function normalizeMaintenanceType(raw) {
  if (!raw) return MAINTENANCE_TYPE.PREVENTIVE;
  const s = String(raw).toUpperCase().trim();
  if (
    s.includes("PREV") ||
    s.includes("PHÒNG") ||
    s.includes("ĐỊNH KỲ") ||
    s.includes("PLAN")
  ) {
    return MAINTENANCE_TYPE.PREVENTIVE;
  }
  if (
    s.includes("CORR") ||
    s.includes("SỬA CHỮA") ||
    s.includes("FIX") ||
    s.includes("BREAK")
  ) {
    return MAINTENANCE_TYPE.CORRECTIVE;
  }
  if (s.includes("EMERG") || s.includes("KHẨN") || s.includes("URGENT")) {
    return MAINTENANCE_TYPE.EMERGENCY;
  }
  return MAINTENANCE_TYPE.PREVENTIVE;
}

/**
 * Normalizes Priority strings and determines UI value state.
 *
 * @param {string} raw Raw priority string from Excel.
 * @returns {{ priority: string, priorityState: string }} Normalized priority and Fiori value state.
 */
function normalizePriority(raw) {
  if (!raw) return { priority: PRIORITY.MEDIUM, priorityState: VALUE_STATE.WARNING };
  const s = String(raw).toUpperCase().trim();
  if (
    s.includes("CRIT") ||
    s.includes("KHẨN") ||
    s.includes("VERY HIGH") ||
    s.includes("P1")
  ) {
    return { priority: PRIORITY.CRITICAL, priorityState: VALUE_STATE.ERROR };
  }
  if (s.includes("HIGH") || s.includes("CAO") || s.includes("P2")) {
    return { priority: PRIORITY.HIGH, priorityState: VALUE_STATE.ERROR };
  }
  if (s.includes("LOW") || s.includes("THẤP") || s.includes("P4")) {
    return { priority: PRIORITY.LOW, priorityState: VALUE_STATE.SUCCESS };
  }
  return { priority: PRIORITY.MEDIUM, priorityState: VALUE_STATE.WARNING };
}

/**
 * Normalizes object property keys to lower-case alphanumeric strings.
 *
 * @param {object} obj Raw row object from SheetJS.
 * @returns {Record<string, *>} Cleaned key-value map.
 */
function normalizeRowKeys(obj) {
  const clean = {};
  if (!obj) return clean;
  for (const k of Object.keys(obj)) {
    const normKey = String(k)
      .toLowerCase()
      .replace(/[\s_\-#.()\/]+/g, "");
    clean[normKey] = obj[k];
  }
  return clean;
}

/**
 * Gets the first matching key value from a normalized row object.
 *
 * @param {Record<string, *>} normRow Cleaned key-value map.
 * @param {string[]} keys List of candidate keys.
 * @param {*} def Fallback value.
 * @returns {*} First found value or fallback.
 */
function getRowField(normRow, keys, def = "") {
  for (const k of keys) {
    if (
      normRow[k] !== undefined &&
      normRow[k] !== null &&
      String(normRow[k]).trim() !== ""
    ) {
      return String(normRow[k]).trim();
    }
  }
  return def;
}

/**
 * High-performance parallel batch insert for database operations using Promise.all.
 *
 * @param {*} entity CDS entity definition.
 * @param {object[]} entries Array of entries to insert.
 * @param {number} [batchSize=IMPORT_CONFIG.DEFAULT_BATCH_SIZE] Batch chunk size.
 * @returns {Promise<void>}
 */
async function batchInsert(entity, entries, batchSize = IMPORT_CONFIG.DEFAULT_BATCH_SIZE) {
  if (!entries || entries.length === 0) return;
  const promises = [];
  for (let i = 0; i < entries.length; i += batchSize) {
    const chunk = entries.slice(i, i + batchSize);
    promises.push(INSERT.into(entity).entries(chunk));
  }
  await Promise.all(promises);
}

/**
 * Validates and converts raw date value to YYYY-MM-DD format.
 * Returns { valid: true, dateStr: 'YYYY-MM-DD' } or { valid: false, error: '...' }
 *
 * @param {*} rawDate
 * @param {string} [locale="vi"]
 * @returns {{ valid: boolean, dateStr?: string, error?: string }}
 */
function parseAndValidateDate(rawDate, locale = "vi") {
  if (!rawDate) {
    return { valid: true, dateStr: new Date().toISOString().slice(0, 10) };
  }
  if (rawDate instanceof Date) {
    if (!isNaN(rawDate.getTime())) {
      return { valid: true, dateStr: rawDate.toISOString().slice(0, 10) };
    }
    return { valid: false, error: getText("importExcelDateInvalidObject", [], locale) };
  }

  // Check Excel serial number
  if (
    typeof rawDate === "number" ||
    (!isNaN(rawDate) &&
      !isNaN(parseFloat(rawDate)) &&
      String(rawDate).indexOf("-") === -1 &&
      String(rawDate).indexOf("/") === -1)
  ) {
    const serial = parseFloat(rawDate);
    if (serial > 1000 && serial < 100000) {
      const utcDays = Math.floor(serial - 25569);
      const utcValue = utcDays * 86400;
      const dateInfo = new Date(utcValue * 1000);
      if (!isNaN(dateInfo.getTime())) {
        return { valid: true, dateStr: dateInfo.toISOString().slice(0, 10) };
      }
    }
    return { valid: false, error: getText("importExcelDateSerialInvalid", [rawDate], locale) };
  }

  const s = String(rawDate).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) {
      return { valid: true, dateStr: s };
    }
    return { valid: false, error: getText("importExcelDateNonExistent", [s], locale) };
  }

  const dmyMatch = s.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})$/);
  if (dmyMatch) {
    let day = parseInt(dmyMatch[1], 10);
    let month = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);
    if (month > 12 && day <= 12) {
      const temp = day;
      day = month;
      month = temp;
    }
    const dt = new Date(year, month - 1, day);
    if (dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day) {
      const mm = String(month).padStart(2, "0");
      const dd = String(day).padStart(2, "0");
      return { valid: true, dateStr: `${year}-${mm}-${dd}` };
    }
    return { valid: false, error: getText("importExcelDateInvalid", [s], locale) };
  }

  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return { valid: true, dateStr: d.toISOString().slice(0, 10) };
  }
  return { valid: false, error: getText("importExcelDateUnrecognized", [s], locale) };
}

/**
 * Generates an Excel workbook buffer containing failed rows with error reasons.
 *
 * @param {Array<object>} errorList Array of error items with { row, order, error, rawRow }
 * @param {string} [locale="vi"]
 * @returns {Promise<Buffer>} Excel buffer
 */
async function generateErrorWorkbookBuffer(errorList, locale = "vi") {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SAP Maintenance Cockpit";
  workbook.created = new Date();

  const ws = workbook.addWorksheet("MaintenanceOrders_Errors", {
    views: [{ showGridLines: true }]
  });

  ws.columns = [
    { header: "Line", key: "row", width: 8 },
    { header: "OrderNo", key: "order", width: 14 },
    { header: "Equipment", key: "equipment", width: 16 },
    { header: "Description", key: "description", width: 38 },
    { header: "Plant", key: "plant", width: 12 },
    { header: "Type", key: "type", width: 16 },
    { header: "Priority", key: "priority", width: 14 },
    { header: "Planner", key: "planner", width: 16 },
    { header: "ScheduledFrom", key: "scheduledFrom", width: 16 },
    { header: "ScheduledTo", key: "scheduledTo", width: 16 },
    { header: "Operations", key: "operations", width: 35 },
    { header: "Materials", key: "materials", width: 30 },
    { header: getText("importExcelErrorColHeader", [], locale), key: "errorReason", width: 50 },
  ];

  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.height = 26;
  headerRow.alignment = { vertical: "middle", horizontal: "center" };

  for (let c = 1; c <= 12; c++) {
    const cell = headerRow.getCell(c);
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF004B87" } // SAP Fiori Blue
    };
  }
  const errorColCell = headerRow.getCell(13);
  errorColCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD32F2F" } // Danger Red
  };

  const FIELD_TO_COL = {
    order: 2,
    equipment: 3,
    description: 4,
    plant: 5,
    type: 6,
    priority: 7,
    planner: 8,
    scheduledFrom: 9,
    scheduledTo: 10,
    operations: 11,
    materials: 12,
  };

  errorList.forEach((item) => {
    const raw = item.rawRow || {};
    const row = ws.addRow({
      row: item.row,
      order: raw.order || item.order || "",
      equipment: raw.equipment || "",
      description: raw.description || "",
      plant: raw.plant || "",
      type: raw.type || "",
      priority: raw.priority || "",
      planner: raw.planner || "",
      scheduledFrom: raw.scheduledFrom || "",
      scheduledTo: raw.scheduledTo || "",
      operations: raw.operations || "",
      materials: raw.materials || "",
      errorReason: item.error || raw.errorReason || "",
    });

    // 1. Highlight Error Reason column (column 13)
    const errCell = row.getCell(13);
    errCell.font = { color: { argb: "FFB71C1C" }, bold: true };
    errCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFEBEE" }
    };

    // 2. Identify and highlight specific error cells in RED
    const errorFields = new Set(item.errorFields || []);
    const errText = (item.error || "").toLowerCase();

    if (errText.includes("equipment") || errText.includes("thiết bị")) {
      errorFields.add("equipment");
    }
    if (errText.includes("description") || errText.includes("mô tả")) {
      errorFields.add("description");
    }
    if (errText.includes("plant") || errText.includes("nhà xưởng")) {
      errorFields.add("plant");
    }
    if (errText.includes("start date") || errText.includes("ngày bắt đầu")) {
      errorFields.add("scheduledFrom");
    }
    if (errText.includes("end date") || errText.includes("ngày kết thúc")) {
      errorFields.add("scheduledTo");
    }
    if (errText.includes("later than end date") || errText.includes("lớn hơn ngày kết thúc")) {
      errorFields.add("scheduledFrom");
      errorFields.add("scheduledTo");
    }
    if (errText.includes("operation") || errText.includes("công việc") || errText.includes("giờ")) {
      errorFields.add("operations");
    }
    if (errText.includes("material") || errText.includes("vật tư") || errText.includes("số lượng")) {
      errorFields.add("materials");
    }

    // Highlight each identified cell with red background, bold dark-red text, and red border
    errorFields.forEach((fieldName) => {
      const colIdx = FIELD_TO_COL[fieldName];
      if (colIdx) {
        const cell = row.getCell(colIdx);
        cell.font = { color: { argb: "FFB71C1C" }, bold: true };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFCDD2" } // Soft prominent red fill
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FFE57373" } },
          left: { style: "thin", color: { argb: "FFE57373" } },
          bottom: { style: "thin", color: { argb: "FFE57373" } },
          right: { style: "thin", color: { argb: "FFE57373" } },
        };
      }
    });
  });

  return await workbook.xlsx.writeBuffer();
}

/**
 * High-performance Process Excel file buffer supporting 50,000+ rows.
 *
 * @param {Buffer|import('stream').Readable} fileSource File buffer or stream.
 * @param {string} currentUser ID of user performing import.
 * @param {object} options Optional configs.
 * @returns {Promise<object>} Import result summary.
 */
async function processExcelImport(
  fileSource,
  currentUser = "Current User",
  options = {},
) {
  const startTime = Date.now();
  const locale = options.locale || "vi";
  const t = (key, args) => getText(key, args, locale);

  const notifyProgress = (percent, message) => {
    if (typeof options.onProgress === "function") {
      try {
        options.onProgress({ percent, message });
      } catch (e) {
        console.warn("[ExcelImport] onProgress handler error:", e.message);
      }
    }
  };

  notifyProgress(5, t("importExcelProgressLoadingMasterData"));

  const db = await cds.connect.to("db");
  if (!cds.db) cds.db = db;
  if (!cds.model) {
    cds.model = await cds.load("*");
  }

  const findEntity = (name) => {
    if (typeof cds.entities === "function") {
      try {
        const e = cds.entities("sap.cap.maintenance");
        if (e && e[name] && typeof e[name] === "object" && typeof e[name]._target4 === "function") {
          return e[name];
        }
      } catch (err) {}
    }
    return `sap.cap.maintenance.${name}`;
  };

  const MaintenanceOrders = findEntity("MaintenanceOrders");
  const Equipments = findEntity("Equipments");
  const Plants = findEntity("Plants");
  const MaintenanceTypes = findEntity("MaintenanceTypes");
  const Priorities = findEntity("Priorities");
  const Planners = findEntity("Planners");
  const WorkCenters = findEntity("WorkCenters");
  const MaterialCatalog = findEntity("MaterialCatalog");
  const MaintenanceOperations = findEntity("MaintenanceOperations");
  const OrderMaterials = findEntity("OrderMaterials");
  const AuditHistory = findEntity("AuditHistory");
  const OrderHistory = findEntity("OrderHistory");

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
  const setWorkCenters = new Set((aWorkCenters || []).map((w) => w.key));
  const setPlanners = new Set((aPlanners || []).map((p) => p.key));

  const mapMaterialsCatalog = new Map();
  (aMaterialsCatalog || []).forEach((m) => {
    mapMaterialsCatalog.set(String(m.key).toUpperCase().trim(), {
      material: m.key,
      description: m.description || m.key,
      unit: m.unit || "EA",
      unitPrice: Number(m.unitPrice) || 25.0,
    });
  });

  // Calculate highest existing order sequence in DB
  const mapExistingOrders = new Map();
  let maxOrderSeq = IMPORT_CONFIG.BASE_ORDER_SEQ;
  (aExistingOrders || []).forEach((o) => {
    mapExistingOrders.set(o.order_no, o);
    const m = String(o.order_no).match(/MO-(\d+)/i);
    if (m) {
      const num = parseInt(m[1], 10);
      if (num > maxOrderSeq) maxOrderSeq = num;
    }
  });

  let nextOrderNum = maxOrderSeq + 1;

  // Step 2: Read Excel buffer using high-speed SheetJS parser
  notifyProgress(15, t("importExcelProgressReadingWorkbook"));
  let buffer = fileSource;
  if (!Buffer.isBuffer(fileSource)) {
    const chunks = [];
    for await (const chunk of fileSource) {
      chunks.push(chunk);
    }
    buffer = Buffer.concat(chunks);
  }

  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
    dense: true,
  });

  const sheetNames = workbook.SheetNames || [];
  if (sheetNames.length === 0) {
    throw new Error(t("importExcelNoSheets"));
  }

  // Identify worksheets
  const orderSheetName =
    sheetNames.find(
      (n) => n.toLowerCase().replace(/[\s_-]/g, "") === "maintenanceorders",
    ) || sheetNames[0];

  const opSheetName = sheetNames.find(
    (n) =>
      n.toLowerCase().replace(/[\s_-]/g, "") === "operations" ||
      n.toLowerCase().replace(/[\s_-]/g, "") === "maintenanceoperations",
  );

  const matSheetName = sheetNames.find(
    (n) =>
      n.toLowerCase().replace(/[\s_-]/g, "") === "materials" ||
      n.toLowerCase().replace(/[\s_-]/g, "") === "ordermaterials",
  );

  const orderRowsRaw = XLSX.utils.sheet_to_json(
    workbook.Sheets[orderSheetName] || {},
    { defval: "" },
  );

  if (!orderRowsRaw || orderRowsRaw.length === 0) {
    throw new Error(t("importExcelNoOrderRows"));
  }

  // Step 3: Parse Operations sheet (if present)
  const operationsByKey = new Map();
  if (opSheetName && workbook.Sheets[opSheetName]) {
    const opRowsRaw = XLSX.utils.sheet_to_json(workbook.Sheets[opSheetName], {
      defval: "",
    });
    for (const r of opRowsRaw) {
      const norm = normalizeRowKeys(r);
      const rawKey = getRowField(norm, [
        "equipment",
        "equipmentno",
        "equipmentid",
        "eq",
        "order",
        "orderno",
        "orderid",
        "orderref",
        "id",
      ]).toUpperCase();
      const rawNo = getRowField(
        norm,
        ["operationno", "no", "opno", "seq"],
        "10",
      );
      const rawDesc = getRowField(
        norm,
        ["description", "operationdescription", "task", "desc"],
        t("importExcelDefaultInspection"),
      );
      const rawWc = getRowField(norm, ["workcenter", "wc"], "WC-001");
      const rawTech = getRowField(
        norm,
        ["technician", "tech", "assignedtechnician"],
        "T-001",
      );
      const rawHours =
        parseFloat(
          getRowField(norm, ["plannedhours", "hours", "duration"], "2"),
        ) || 2.0;

      if (rawKey) {
        if (!operationsByKey.has(rawKey)) {
          operationsByKey.set(rawKey, []);
        }
        operationsByKey.get(rawKey).push({
          no: String(rawNo),
          description: rawDesc,
          workCenter: setWorkCenters.has(rawWc) ? rawWc : "WC-001",
          technician: rawTech || "T-001",
          plannedHours: rawHours,
          actualHours: 0.0,
          status: "OPEN",
        });
      }
    }
  }

  // Step 4: Parse Materials sheet (if present)
  const materialsByKey = new Map();
  if (matSheetName && workbook.Sheets[matSheetName]) {
    const matRowsRaw = XLSX.utils.sheet_to_json(workbook.Sheets[matSheetName], {
      defval: "",
    });
    for (const r of matRowsRaw) {
      const norm = normalizeRowKeys(r);
      const rawKey = getRowField(norm, [
        "equipment",
        "equipmentno",
        "equipmentid",
        "eq",
        "order",
        "orderno",
        "orderid",
        "orderref",
        "id",
      ]).toUpperCase();
      const rawMat = getRowField(
        norm,
        ["material", "materialid", "part", "matno"],
        "MAT-001",
      ).toUpperCase();
      const rawQty =
        parseFloat(getRowField(norm, ["quantity", "qty", "amount"], "1")) ||
        1.0;
      const rawUnit = getRowField(norm, ["unit", "uom"], "EA");

      if (rawKey && rawMat) {
        if (!materialsByKey.has(rawKey)) {
          materialsByKey.set(rawKey, []);
        }
        const catalogItem = mapMaterialsCatalog.get(rawMat) || {
          material: rawMat,
          description: rawMat,
          unit: rawUnit || "EA",
          unitPrice: 25.0,
        };
        const unitPrice = catalogItem.unitPrice || 25.0;
        materialsByKey.get(rawKey).push({
          material: catalogItem.material || rawMat,
          description: catalogItem.description,
          qty: rawQty,
          unit: catalogItem.unit || rawUnit || "EA",
          unitPrice: unitPrice,
          value: rawQty * unitPrice,
        });
      }
    }
  }

  // Step 5: Process Order rows and assign sequential MO- numbers
  let totalRows = 0;
  let createdCount = 0;
  let updatedCount = 0;
  let totalOpsImported = 0;
  let totalMatsImported = 0;
  const warnings = [];
  const errors = [];

  const ordersToInsert = [];
  const ordersToUpdate = [];
  const operationsToSave = [];
  const materialsToSave = [];
  const historyToInsert = [];

  const timestampStr = new Date()
    .toISOString()
    .replace("T", " ")
    .substring(0, 16);
  const laborRatePerHour = IMPORT_CONFIG.LABOR_RATE_PER_HOUR;
  const seenOrderNosInFile = new Set();

  for (let idx = 0; idx < orderRowsRaw.length; idx++) {
    if (idx % 100 === 0 || idx === orderRowsRaw.length - 1) {
      const pct = Math.min(65, Math.round(20 + ((idx + 1) / orderRowsRaw.length) * 45));
      notifyProgress(pct, t("importExcelProgressValidatingRow", [idx + 1, orderRowsRaw.length]));
    }
    const row = orderRowsRaw[idx];
    const rowNumber = idx + 2;
    const norm = normalizeRowKeys(row);

    const rawOrderNo = getRowField(norm, [
      "order",
      "orderno",
      "orderid",
      "orderref",
      "id",
    ]);
    const rawEquipment = getRowField(norm, [
      "equipment",
      "equipmentno",
      "equipmentid",
      "eq",
    ]);
    const rawDescription = getRowField(norm, [
      "description",
      "orderdescription",
      "desc",
      "title",
    ]);
    const rawPlant = getRowField(norm, ["plant", "plantid"]);
    const rawType = getRowField(norm, [
      "type",
      "maintenancetype",
      "ordertype",
    ]);
    const rawPriority = getRowField(norm, ["priority", "prio"]);
    const rawPlanner = getRowField(norm, [
      "planner",
      "plannerid",
      "assignedplanner",
    ]);
    const rawFrom = getRowField(norm, [
      "scheduledfrom",
      "from",
      "startdate",
      "scheduledstart",
    ]);
    const rawTo = getRowField(norm, [
      "scheduledto",
      "to",
      "enddate",
      "scheduledend",
    ]);
    const inlineOps = getRowField(norm, [
      "operations",
      "operationsinlineoptional",
      "operationsinline",
      "operationlist",
      "tasks",
    ]);
    const inlineMats = getRowField(norm, [
      "materials",
      "materialsinlineoptional",
      "materialsinline",
      "materiallist",
      "parts",
    ]);

    if (
      !rawOrderNo &&
      !rawDescription &&
      !rawEquipment &&
      !rawPlant &&
      !inlineOps &&
      !inlineMats
    ) {
      continue; // Skip ghost empty row
    }

    totalRows++;

    const rowErrors = [];
    const errorFields = new Set();

    // 1. Equipment validation (Mandatory & Must exist in master data)
    let equipmentNo = rawEquipment ? rawEquipment.trim().toUpperCase() : "";
    if (!equipmentNo) {
      rowErrors.push(t("importExcelEquipmentRequired"));
      errorFields.add("equipment");
    } else if (setEquipments.size > 0 && !setEquipments.has(equipmentNo)) {
      rowErrors.push(t("importExcelEquipmentNotFound", [rawEquipment.trim()]));
      errorFields.add("equipment");
    }

    // 2. Description validation (Mandatory)
    const description = rawDescription ? rawDescription.trim() : "";
    if (!description) {
      rowErrors.push(t("importExcelDescriptionRequired"));
      errorFields.add("description");
    }

    // 3. Plant validation
    let plant = rawPlant ? rawPlant.trim().toUpperCase() : "";
    if (!plant) {
      plant = IMPORT_CONFIG.DEFAULT_PLANT; // default plant if not provided
    } else if (setPlants.size > 0 && !setPlants.has(plant)) {
      rowErrors.push(t("importExcelPlantNotFound", [rawPlant.trim()]));
      errorFields.add("plant");
    }

    // 4. Date validation
    let scheduledFrom = "";
    let scheduledTo = "";
    if (rawFrom) {
      const vFrom = parseAndValidateDate(rawFrom, locale);
      if (!vFrom.valid) {
        rowErrors.push(vFrom.error || t("importExcelDateInvalid", [rawFrom]));
        errorFields.add("scheduledFrom");
      } else {
        scheduledFrom = vFrom.dateStr;
      }
    } else {
      scheduledFrom = new Date().toISOString().slice(0, 10);
    }

    if (rawTo) {
      const vTo = parseAndValidateDate(rawTo, locale);
      if (!vTo.valid) {
        rowErrors.push(vTo.error || t("importExcelDateEndInvalid", [rawTo]));
        errorFields.add("scheduledTo");
      } else {
        scheduledTo = vTo.dateStr;
      }
    } else {
      scheduledTo = scheduledFrom;
    }

    if (scheduledFrom && scheduledTo && scheduledFrom > scheduledTo) {
      rowErrors.push(t("importExcelDateFromAfterTo", [scheduledFrom, scheduledTo]));
      errorFields.add("scheduledFrom");
      errorFields.add("scheduledTo");
    }

    // 5. Inline Operations syntax validation
    if (inlineOps) {
      const parts = String(inlineOps).split(/[;,|]+/);
      for (const p of parts) {
        const segs = p.split(":");
        if (segs.length > 2) {
          const rawH = segs[2].trim();
          const numH = parseFloat(rawH);
          if (isNaN(numH) || numH < 0) {
            rowErrors.push(t("importExcelOpHoursInvalid", [p.trim()]));
            errorFields.add("operations");
            break;
          }
        }
      }
    }

    // 6. Inline Materials syntax validation
    if (inlineMats) {
      const parts = String(inlineMats).split(/[;,|]+/);
      for (const p of parts) {
        const segs = p.split(":");
        if (segs.length > 1) {
          const rawQ = segs[1].trim();
          const numQ = parseFloat(rawQ);
          if (isNaN(numQ) || numQ <= 0) {
            rowErrors.push(t("importExcelMatQtyInvalid", [p.trim()]));
            errorFields.add("materials");
            break;
          }
        }
      }
    }

    // If row has any errors, collect it into errors list and skip saving
    if (rowErrors.length > 0) {
      errors.push({
        row: rowNumber,
        order: rawOrderNo || t("importExcelLineFallback", [rowNumber]),
        error: rowErrors.join("; "),
        errorFields: Array.from(errorFields),
        rawRow: {
          order: rawOrderNo || "",
          equipment: rawEquipment || "",
          description: rawDescription || "",
          plant: rawPlant || "",
          type: rawType || "",
          priority: rawPriority || "",
          planner: rawPlanner || "",
          scheduledFrom: rawFrom || "",
          scheduledTo: rawTo || "",
          operations: inlineOps || "",
          materials: inlineMats || "",
          errorReason: rowErrors.join("; ")
        }
      });
      continue;
    }

    // Assign sequential MO- number if not an existing order
    let finalOrderNo = "";
    let isUpdate = false;

    if (rawOrderNo) {
      const normalizedRaw = rawOrderNo.trim().toUpperCase();
      if (
        normalizedRaw.startsWith("MO-") &&
        mapExistingOrders.has(normalizedRaw)
      ) {
        finalOrderNo = normalizedRaw;
        isUpdate = true;
      }
    }

    if (!finalOrderNo || seenOrderNosInFile.has(finalOrderNo)) {
      finalOrderNo = `MO-${nextOrderNum++}`;
      isUpdate = false;
    }
    seenOrderNosInFile.add(finalOrderNo);

    const maintenanceType = normalizeMaintenanceType(rawType);
    const { priority, priorityState } = normalizePriority(rawPriority);
    let planner = rawPlanner ? rawPlanner.trim() : "";
    if (!planner || (setPlanners.size > 0 && !setPlanners.has(planner))) {
      planner =
        currentUser && currentUser !== "Current User" ? currentUser : IMPORT_CONFIG.DEFAULT_PLANNER;
    }

    // Parse Inline Operations
    const rowOps = [];
    if (inlineOps) {
      const parts = String(inlineOps).split(/[;,|]+/);
      parts.forEach((p, pIdx) => {
        const segs = p.split(":");
        const opNo =
          segs.length > 1 ? segs[0].trim() : String((pIdx + 1) * 10);
        const opDesc = segs.length > 1 ? segs[1].trim() : segs[0].trim();
        const opHours =
          segs.length > 2
            ? parseFloat(segs[2].trim()) || 2.0
            : 2.0;
        if (opDesc) {
          rowOps.push({
            order_no: finalOrderNo,
            no: opNo,
            description: opDesc,
            workCenter: IMPORT_CONFIG.DEFAULT_WORK_CENTER,
            technician: IMPORT_CONFIG.DEFAULT_TECHNICIAN,
            plannedHours: opHours,
            actualHours: 0.0,
            status: ORDER_STATUS.OPEN,
          });
        }
      });
    }

    // Parse Inline Materials
    const rowMats = [];
    if (inlineMats) {
      const parts = String(inlineMats).split(/[;,|]+/);
      parts.forEach((p) => {
        const segs = p.split(":");
        const matKey = segs[0]?.trim()?.toUpperCase();
        const matQty =
          segs.length > 1
            ? parseFloat(segs[1].trim()) || 1.0
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
            order_no: finalOrderNo,
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

    // External operations & materials from other sheets
    const extOps =
      (rawOrderNo && operationsByKey.get(rawOrderNo.trim().toUpperCase())) ||
      operationsByKey.get(equipmentNo) ||
      [];
    const extMats =
      (rawOrderNo && materialsByKey.get(rawOrderNo.trim().toUpperCase())) ||
      materialsByKey.get(equipmentNo) ||
      [];

    const combinedOps = [
      ...extOps.map((o) => ({ ...o, order_no: finalOrderNo })),
      ...rowOps,
    ];
    const combinedMats = [
      ...extMats.map((m) => ({ ...m, order_no: finalOrderNo })),
      ...rowMats,
    ];

    // Deduplicate and resequence operations to guarantee unique (order_no, no)
    const opMap = new Map();
    let opSeq = IMPORT_CONFIG.OPERATION_SEQ_STEP;
    const finalOps = [];

    for (const op of combinedOps) {
      let opNo = op.no ? String(op.no).trim() : "";
      if (!opNo || opMap.has(opNo)) {
        while (opMap.has(String(opSeq))) {
          opSeq += IMPORT_CONFIG.OPERATION_SEQ_STEP;
        }
        opNo = String(opSeq);
        opSeq += IMPORT_CONFIG.OPERATION_SEQ_STEP;
      }
      opMap.set(opNo, true);
      finalOps.push({
        order_no: finalOrderNo,
        no: opNo,
        description: op.description || t("importExcelDefaultTask"),
        workCenter: op.workCenter || IMPORT_CONFIG.DEFAULT_WORK_CENTER,
        technician: op.technician || IMPORT_CONFIG.DEFAULT_TECHNICIAN,
        plannedHours: Number(op.plannedHours) || IMPORT_CONFIG.DEFAULT_PLANNED_HOURS,
        actualHours: Number(op.actualHours) || 0.0,
        status: op.status || ORDER_STATUS.OPEN,
      });
    }

    if (finalOps.length === 0) {
      finalOps.push({
        order_no: finalOrderNo,
        no: String(IMPORT_CONFIG.OPERATION_SEQ_STEP),
        description: t("importExcelDefaultOpDesc"),
        workCenter: IMPORT_CONFIG.DEFAULT_WORK_CENTER,
        technician: IMPORT_CONFIG.DEFAULT_TECHNICIAN,
        plannedHours: IMPORT_CONFIG.DEFAULT_PLANNED_HOURS,
        actualHours: 0.0,
        status: ORDER_STATUS.OPEN,
      });
    }

    // Deduplicate materials by (order_no, material) and merge quantities
    const matMap = new Map();
    for (const mat of combinedMats) {
      const matKey = String(mat.material).trim().toUpperCase();
      if (!matKey) continue;
      if (matMap.has(matKey)) {
        const existing = matMap.get(matKey);
        existing.qty = Number((existing.qty + (Number(mat.qty) || 1.0)).toFixed(2));
        existing.value = Number((existing.qty * existing.unitPrice).toFixed(2));
      } else {
        const unitPrice = Number(mat.unitPrice) || 25.0;
        const qty = Number(mat.qty) || 1.0;
        matMap.set(matKey, {
          order_no: finalOrderNo,
          material: matKey,
          description: mat.description || matKey,
          qty: qty,
          unit: mat.unit || "EA",
          unitPrice: unitPrice,
          value: Number((qty * unitPrice).toFixed(2)),
        });
      }
    }
    const finalMats = Array.from(matMap.values());

    // Aggregations
    const totalPlannedHours = finalOps.reduce(
      (sum, o) => sum + (Number(o.plannedHours) || 0),
      0,
    );
    const totalMaterialCost = finalMats.reduce(
      (sum, m) => sum + (Number(m.value) || 0),
      0,
    );
    const estimatedCost =
      totalMaterialCost + totalPlannedHours * laborRatePerHour;

    const existingInDb = isUpdate ? mapExistingOrders.get(finalOrderNo) : null;
    const status = existingInDb ? existingInDb.status || ORDER_STATUS.OPEN : ORDER_STATUS.OPEN;
    const statusState = existingInDb
      ? existingInDb.status_state || VALUE_STATE.SUCCESS
      : VALUE_STATE.SUCCESS;

    const orderEntity = {
      order_no: finalOrderNo,
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
      operation_count: finalOps.length,
      completed_operation_count: 0,
      planned_hours: totalPlannedHours,
      actual_hours: 0.0,
      estimated_cost: estimatedCost,
      currency: "USD",
      etag: `W/"${Date.now()}"`,
    };

    if (isUpdate) {
      ordersToUpdate.push(orderEntity);
      updatedCount++;
    } else {
      ordersToInsert.push(orderEntity);
      createdCount++;
    }

    finalOps.forEach((op) => operationsToSave.push(op));
    finalMats.forEach((mat) => materialsToSave.push(mat));

    // Keep history records compact for large bulk imports
    if (ordersToInsert.length + ordersToUpdate.length <= IMPORT_CONFIG.MAX_HISTORY_RECORD_COUNT) {
      historyToInsert.push({
        ID: cds.utils?.uuid ? cds.utils.uuid() : crypto.randomUUID(),
        order_no: finalOrderNo,
        title: isUpdate ? t("importExcelHistoryOrderUpdated") : t("importExcelHistoryOrderCreated"),
        dateTime: timestampStr,
        userName: currentUser,
        text: t("importExcelHistorySyncText", [finalOps.length]),
        icon: isUpdate ? "sap-icon://synchronize" : "sap-icon://create",
      });
    }

    totalOpsImported += finalOps.length;
    totalMatsImported += finalMats.length;
  }

  // Step 6: Chunked Database Transactions (prevents SQLite/HANA parameter limits)
  notifyProgress(70, t("importExcelProgressSavingOrders", [ordersToInsert.length + ordersToUpdate.length]));
  if (ordersToInsert.length > 0 || ordersToUpdate.length > 0) {
    await cds.tx(async () => {
      // 0. Clean any pre-existing operations and materials for all orders being processed
      const allProcessedOrderNos = [
        ...ordersToInsert.map((o) => o.order_no),
        ...ordersToUpdate.map((o) => o.order_no),
      ];
      if (allProcessedOrderNos.length > 0) {
        for (let i = 0; i < allProcessedOrderNos.length; i += IMPORT_CONFIG.CLEANUP_CHUNK_SIZE) {
          const chunk = allProcessedOrderNos.slice(i, i + IMPORT_CONFIG.CLEANUP_CHUNK_SIZE);
          await DELETE.from(MaintenanceOperations).where({ order_no: { in: chunk } });
          await DELETE.from(OrderMaterials).where({ order_no: { in: chunk } });
        }
      }

      // 1. Insert new orders in batches
      await batchInsert(MaintenanceOrders, ordersToInsert, IMPORT_CONFIG.DEFAULT_BATCH_SIZE);

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
      }

      notifyProgress(85, t("importExcelProgressSavingOpsAndMats"));
      // 3. Batch save operations (safeguard deduplication by order_no + no)
      const uniqueOpsMap = new Map();
      const cleanOperations = [];
      for (const op of operationsToSave) {
        const key = `${op.order_no}#${op.no}`;
        if (!uniqueOpsMap.has(key)) {
          uniqueOpsMap.set(key, true);
          cleanOperations.push(op);
        }
      }
      await batchInsert(MaintenanceOperations, cleanOperations, IMPORT_CONFIG.DEFAULT_BATCH_SIZE);

      // 4. Batch save materials (safeguard deduplication by order_no + material)
      const uniqueMatsMap = new Map();
      const cleanMaterials = [];
      for (const mat of materialsToSave) {
        const key = `${mat.order_no}#${mat.material}`;
        if (!uniqueMatsMap.has(key)) {
          uniqueMatsMap.set(key, mat);
          cleanMaterials.push(mat);
        } else {
          const existing = uniqueMatsMap.get(key);
          existing.qty = Number((existing.qty + (Number(mat.qty) || 1.0)).toFixed(2));
          existing.value = Number((existing.qty * existing.unitPrice).toFixed(2));
        }
      }
      await batchInsert(OrderMaterials, cleanMaterials, IMPORT_CONFIG.DEFAULT_BATCH_SIZE);

      // 5. Batch save history
      await batchInsert(OrderHistory, historyToInsert, IMPORT_CONFIG.DEFAULT_BATCH_SIZE);
    });
  }

  const durationMs = Date.now() - startTime;
  const durationSec = (durationMs / 1000).toFixed(2);
  const importedCount = createdCount + updatedCount;

  // Generate error workbook if there are failed rows
  let errorFileBase64 = null;
  let errorFileName = null;
  if (errors.length > 0) {
    try {
      const errorBuffer = await generateErrorWorkbookBuffer(errors, locale);
      errorFileBase64 = Buffer.from(errorBuffer).toString("base64");
      errorFileName = `MaintenanceOrders_Errors_${new Date().toISOString().slice(0, 10)}.xlsx`;
    } catch (err) {
      console.error("[ExcelImport] Error generating error workbook:", err);
    }
  }

  // Step 7: Record summary audit log
  notifyProgress(95, t("importExcelProgressRecordingAudit"));
  if (importedCount > 0) {
    await INSERT.into(AuditHistory).entries({
      ID: cds.utils?.uuid ? cds.utils.uuid() : crypto.randomUUID(),
      timestamp: timestampStr,
      user: currentUser,
      object: t("importExcelAuditObject", [importedCount]),
      action: "IMPORT",
      details: t("importExcelAuditDetails", [importedCount, createdCount, updatedCount, errors.length, durationSec]),
    });
  }

  notifyProgress(100, t("importExcelProgressCompleted", [orderRowsRaw.length]));

  return {
    success: importedCount > 0 || totalRows === 0,
    totalRows,
    importedCount,
    createdCount,
    updatedCount,
    operationsCount: totalOpsImported,
    materialsCount: totalMatsImported,
    failedCount: errors.length,
    durationMs,
    durationSec: `${durationSec}s`,
    warnings,
    errors,
    hasErrors: errors.length > 0,
    errorFileName,
    errorFileBase64,
  };
}

module.exports = {
  processExcelImport,
  generateErrorWorkbookBuffer,
  parseAndValidateDate,
  normalizeMaintenanceType,
  normalizePriority,
};
