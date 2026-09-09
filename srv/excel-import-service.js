const ExcelJS = require("exceljs");
const XLSX = require("xlsx");
const cds = global.cds || require("@sap/cds");

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
  if (
    typeof rawDate === "number" ||
    (!isNaN(rawDate) &&
      !isNaN(parseFloat(rawDate)) &&
      String(rawDate).indexOf("-") === -1 &&
      String(rawDate).indexOf("/") === -1)
  ) {
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
 * Normalizes Maintenance Type strings to valid system values.
 *
 * @param {string} raw
 * @returns {string} PREVENTIVE | CORRECTIVE | EMERGENCY
 */
function normalizeMaintenanceType(raw) {
  if (!raw) return "PREVENTIVE";
  const s = String(raw).toUpperCase().trim();
  if (
    s.includes("PREV") ||
    s.includes("PHÒNG") ||
    s.includes("ĐỊNH KỲ") ||
    s.includes("PLAN")
  ) {
    return "PREVENTIVE";
  }
  if (
    s.includes("CORR") ||
    s.includes("SỬA CHỮA") ||
    s.includes("FIX") ||
    s.includes("BREAK")
  ) {
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
  if (
    s.includes("CRIT") ||
    s.includes("KHẨN") ||
    s.includes("VERY HIGH") ||
    s.includes("P1")
  ) {
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
 * High-performance batch insert for database operations to prevent parameter limits.
 *
 * @param {*} entity CDS entity definition.
 * @param {object[]} entries Array of entries to insert.
 * @param {number} batchSize Batch chunk size.
 */
async function batchInsert(entity, entries, batchSize = 500) {
  if (!entries || entries.length === 0) return;
  for (let i = 0; i < entries.length; i += batchSize) {
    const chunk = entries.slice(i, i + batchSize);
    await INSERT.into(entity).entries(chunk);
  }
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
  const notifyProgress = (percent, message) => {
    if (typeof options.onProgress === "function") {
      try {
        options.onProgress({ percent, message });
      } catch (e) {
        console.warn("[ExcelImport] onProgress handler error:", e.message);
      }
    }
  };

  notifyProgress(5, "Loading master data cache...");

  const db = await cds.connect.to("db");
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

  // Step 2: Read Excel buffer using high-speed SheetJS parser
  notifyProgress(15, "Reading Excel workbook...");
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
    throw new Error("Uploaded workbook contains no sheets.");
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
    throw new Error("The uploaded Excel file has no order rows to process.");
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
        "Inspection & Maintenance",
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
  const laborRatePerHour = 50.0;
  const seenOrderNosInFile = new Set();

  for (let idx = 0; idx < orderRowsRaw.length; idx++) {
    if (idx % 100 === 0 || idx === orderRowsRaw.length - 1) {
      const pct = Math.min(65, Math.round(20 + ((idx + 1) / orderRowsRaw.length) * 45));
      notifyProgress(pct, `Validating order row ${idx + 1} of ${orderRowsRaw.length}...`);
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
      "operationlist",
      "tasks",
    ]);
    const inlineMats = getRowField(norm, [
      "materials",
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

    // Equipment validation & fallback
    let equipmentNo = rawEquipment ? rawEquipment.trim().toUpperCase() : "";
    if (
      !equipmentNo ||
      (setEquipments.size > 0 && !setEquipments.has(equipmentNo))
    ) {
      equipmentNo = "EQ-001";
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

    const description = rawDescription || `Maintenance for ${equipmentNo}`;
    let plant = rawPlant ? rawPlant.trim().toUpperCase() : "1000";
    if (setPlants.size > 0 && !setPlants.has(plant)) {
      plant = "1000";
    }

    const maintenanceType = normalizeMaintenanceType(rawType);
    const { priority, priorityState } = normalizePriority(rawPriority);
    let planner = rawPlanner ? rawPlanner.trim() : "";
    if (!planner || (setPlanners.size > 0 && !setPlanners.has(planner))) {
      planner =
        currentUser && currentUser !== "Current User" ? currentUser : "JOHN";
    }

    let scheduledFrom = normalizeDate(rawFrom);
    let scheduledTo = normalizeDate(rawTo || rawFrom);
    if (scheduledFrom && scheduledTo && scheduledFrom > scheduledTo) {
      const temp = scheduledFrom;
      scheduledFrom = scheduledTo;
      scheduledTo = temp;
    }

    // Parse Inline Operations
    const rowOps = [];
    if (inlineOps) {
      const parts = String(inlineOps).split(/[;,|]+/);
      parts.forEach((p, pIdx) => {
        const segs = p.split(/[:\-]/);
        const opNo =
          segs.length > 1 ? segs[0].trim() : String((pIdx + 1) * 10);
        const opDesc = segs.length > 1 ? segs[1].trim() : segs[0].trim();
        const opHours =
          segs.length > 2
            ? parseFloat(segs[2].replace(/[^\d.]/g, "")) || 2.0
            : 2.0;
        if (opDesc) {
          rowOps.push({
            order_no: finalOrderNo,
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

    // Parse Inline Materials
    const rowMats = [];
    if (inlineMats) {
      const parts = String(inlineMats).split(/[;,|]+/);
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
    let opSeq = 10;
    const finalOps = [];

    for (const op of combinedOps) {
      let opNo = op.no ? String(op.no).trim() : "";
      if (!opNo || opMap.has(opNo)) {
        while (opMap.has(String(opSeq))) {
          opSeq += 10;
        }
        opNo = String(opSeq);
        opSeq += 10;
      }
      opMap.set(opNo, true);
      finalOps.push({
        order_no: finalOrderNo,
        no: opNo,
        description: op.description || "Maintenance Operation",
        workCenter: op.workCenter || "WC-001",
        technician: op.technician || "T-001",
        plannedHours: Number(op.plannedHours) || 2.0,
        actualHours: Number(op.actualHours) || 0.0,
        status: op.status || "OPEN",
      });
    }

    if (finalOps.length === 0) {
      finalOps.push({
        order_no: finalOrderNo,
        no: "10",
        description: "Standard Maintenance & Inspection",
        workCenter: "WC-001",
        technician: "T-001",
        plannedHours: 2.0,
        actualHours: 0.0,
        status: "OPEN",
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
    const status = existingInDb ? existingInDb.status || "OPEN" : "OPEN";
    const statusState = existingInDb
      ? existingInDb.status_state || "Success"
      : "Success";

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
    if (ordersToInsert.length + ordersToUpdate.length <= 5000) {
      historyToInsert.push({
        ID: cds.utils?.uuid ? cds.utils.uuid() : require("crypto").randomUUID(),
        order_no: finalOrderNo,
        title: isUpdate ? "Order updated via import" : "Order created",
        dateTime: timestampStr,
        userName: currentUser,
        text: `Maintenance order synced with ${finalOps.length} op(s).`,
        icon: isUpdate ? "sap-icon://synchronize" : "sap-icon://create",
      });
    }

    totalOpsImported += finalOps.length;
    totalMatsImported += finalMats.length;
  }

  // Step 6: Chunked Database Transactions (prevents SQLite/HANA parameter limits)
  notifyProgress(70, `Saving ${ordersToInsert.length + ordersToUpdate.length} orders to database...`);
  await cds.tx(async () => {
    // 0. Clean any pre-existing operations and materials for all orders being processed
    const allProcessedOrderNos = [
      ...ordersToInsert.map((o) => o.order_no),
      ...ordersToUpdate.map((o) => o.order_no),
    ];
    if (allProcessedOrderNos.length > 0) {
      for (let i = 0; i < allProcessedOrderNos.length; i += 200) {
        const chunk = allProcessedOrderNos.slice(i, i + 200);
        await DELETE.from(MaintenanceOperations).where({ order_no: { in: chunk } });
        await DELETE.from(OrderMaterials).where({ order_no: { in: chunk } });
      }
    }

    // 1. Insert new orders in batches of 500
    await batchInsert(MaintenanceOrders, ordersToInsert, 500);

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

    notifyProgress(85, "Saving operations and materials...");
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
    await batchInsert(MaintenanceOperations, cleanOperations, 500);

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
    await batchInsert(OrderMaterials, cleanMaterials, 500);

    // 5. Batch save history
    await batchInsert(OrderHistory, historyToInsert, 500);
  });

  const durationMs = Date.now() - startTime;
  const durationSec = (durationMs / 1000).toFixed(2);
  const importedCount = createdCount + updatedCount;

  // Step 7: Record summary audit log
  notifyProgress(95, "Recording audit history...");
  if (importedCount > 0) {
    await INSERT.into(AuditHistory).entries({
      ID: cds.utils?.uuid ? cds.utils.uuid() : require("crypto").randomUUID(),
      timestamp: timestampStr,
      user: currentUser,
      object: `Bulk Import (${importedCount} orders)`,
      action: "IMPORT",
      details: `Imported ${importedCount} orders (${createdCount} created, ${updatedCount} updated), ${totalOpsImported} operations in ${durationSec}s.`,
    });
  }

  notifyProgress(100, `Completed processing ${orderRowsRaw.length} rows.`);

  return {
    success: true,
    totalRows,
    importedCount,
    createdCount,
    updatedCount,
    operationsCount: totalOpsImported,
    materialsCount: totalMatsImported,
    failedCount: 0,
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
