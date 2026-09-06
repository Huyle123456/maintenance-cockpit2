const ExcelJS = require('exceljs');
const { Readable } = require('stream');
const cds = global.cds || require('@sap/cds');

/**
 * Clean & normalize cell value from ExcelJS cell
 */
function cleanCellValue(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object') {
    if (val instanceof Date) {
      return val.toISOString().slice(0, 10);
    }
    if (val.text !== undefined) return String(val.text).trim();
    if (val.result !== undefined) return String(val.result).trim();
    if (Array.isArray(val.richText)) {
      return val.richText.map(t => t.text || '').join('').trim();
    }
  }
  return String(val).trim();
}

/**
 * Format date string to YYYY-MM-DD
 */
function normalizeDate(rawDate) {
  if (!rawDate) return new Date().toISOString().slice(0, 10);
  if (rawDate instanceof Date) return rawDate.toISOString().slice(0, 10);
  const s = String(rawDate).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

/**
 * Parse header row to create lowercase mapping of column index
 */
function buildHeaderMap(worksheet) {
  const headerMap = {};
  if (!worksheet || worksheet.rowCount < 1) return headerMap;

  const headerRow = worksheet.getRow(1);
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const cleanName = cleanCellValue(cell.value).toLowerCase().replace(/[\s_\-#]+/g, '');
    if (cleanName) {
      headerMap[cleanName] = colNumber;
    }
  });
  return headerMap;
}

/**
 * Get value from row by checking list of possible column keys
 */
function getRowVal(row, headerMap, possibleKeys, def = '') {
  for (const k of possibleKeys) {
    const colIdx = headerMap[k];
    if (colIdx !== undefined) {
      const cell = row.getCell(colIdx);
      if (cell && cell.value !== null && cell.value !== undefined) {
        const v = cleanCellValue(cell.value);
        if (v !== '') return v;
      }
    }
  }
  return def;
}

/**
 * Process Excel file buffer using ExcelJS
 * Supports:
 * 1. Multi-Sheet imports (Sheet 1: MaintenanceOrders, Sheet 2: Operations, Sheet 3: Materials)
 * 2. Single-Sheet imports with inline operations/materials
 * 3. Automatic validation against Master Data Catalogs
 * 4. Batch DB transactions for MaintenanceOrders, MaintenanceOperations, OrderMaterials, History & Audit
 *
 * @param {Buffer|Readable} fileSource File buffer or stream
 * @param {string} currentUser ID of user performing import
 * @param {object} options Optional configs (batchSize, etc.)
 * @returns {Promise<{success: boolean, totalRows: number, importedCount: number, operationsCount: number, materialsCount: number, failedCount: number, errors: Array}>}
 */
async function processExcelImport(fileSource, currentUser = 'Current User', options = {}) {
  const startTime = Date.now();
  const BATCH_SIZE = options.batchSize || 1000;
  const db = await cds.connect.to('db');
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
    OrderHistory
  } = cds.entities('sap.cap.maintenance');

  // Step 1: Pre-fetch master data cache for validations during processing
  const [aEquipments, aPlants, aTypes, aPriorities, aPlanners, aWorkCenters, aMaterialsCatalog] = await Promise.all([
    SELECT.from(Equipments).columns('equipment'),
    SELECT.from(Plants).columns('key'),
    SELECT.from(MaintenanceTypes).columns('key'),
    SELECT.from(Priorities).columns('key'),
    SELECT.from(Planners).columns('key'),
    SELECT.from(WorkCenters).columns('key'),
    SELECT.from(MaterialCatalog).columns('key', 'description', 'unit', 'unitPrice')
  ]);

  const setEquipments = new Set((aEquipments || []).map(e => e.equipment));
  const setPlants = new Set((aPlants || []).map(p => p.key));
  const setTypes = new Set((aTypes || []).map(t => t.key));
  const setPriorities = new Set((aPriorities || []).map(p => p.key));
  const setPlanners = new Set((aPlanners || []).map(p => p.key));
  const setWorkCenters = new Set((aWorkCenters || []).map(w => w.key));

  const mapMaterialsCatalog = new Map();
  (aMaterialsCatalog || []).forEach(m => {
    mapMaterialsCatalog.set(m.key, {
      material: m.key,
      description: m.description || m.key,
      unit: m.unit || 'EA',
      unitPrice: Number(m.unitPrice) || 25.0
    });
  });

  // Step 2: Determine next order number sequence
  const highest = await SELECT.one.from(MaintenanceOrders).columns('order_no').orderBy('order_no desc');
  let nextOrderNum = 1001;
  if (highest && highest.order_no) {
    const match = highest.order_no.match(/MO-(\d+)/);
    if (match) nextOrderNum = parseInt(match[1], 10) + 1;
  }

  // Pre-fetch existing order numbers to avoid duplicate key collision
  const existingOrders = await SELECT.from(MaintenanceOrders).columns('order_no');
  const setExistingOrderNos = new Set((existingOrders || []).map(o => o.order_no));

  // Step 3: Load workbook
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
  const orderSheet = workbook.getWorksheet('MaintenanceOrders') || workbook.worksheets[0];
  const opSheet = workbook.getWorksheet('Operations') || workbook.getWorksheet('maintenanceoperations');
  const matSheet = workbook.getWorksheet('Materials') || workbook.getWorksheet('ordermaterials');

  if (!orderSheet || orderSheet.rowCount < 2) {
    throw new Error('The uploaded Excel file has no order rows to process.');
  }

  // Step 4: Parse Operations from Operations Sheet (if present)
  // Map: rawOrderIdentifier -> Array of operation objects
  const operationsByOrder = new Map();
  if (opSheet && opSheet.rowCount >= 2) {
    const opHeaderMap = buildHeaderMap(opSheet);
    opSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return; // skip header
      const rawOrderKey = getRowVal(row, opHeaderMap, ['order', 'orderno', 'orderid', 'id']);
      const rawNo = getRowVal(row, opHeaderMap, ['operationno', 'no', 'opno', 'seq'], '10');
      const rawDesc = getRowVal(row, opHeaderMap, ['description', 'operationdescription', 'task', 'desc'], 'Inspection & Maintenance');
      const rawWc = getRowVal(row, opHeaderMap, ['workcenter', 'wc'], 'WC-001');
      const rawTech = getRowVal(row, opHeaderMap, ['technician', 'tech', 'assignedtechnician'], 'T-001');
      const rawHours = parseFloat(getRowVal(row, opHeaderMap, ['plannedhours', 'hours', 'duration'], '2')) || 2.0;

      if (rawOrderKey) {
        if (!operationsByOrder.has(rawOrderKey)) {
          operationsByOrder.set(rawOrderKey, []);
        }
        operationsByOrder.get(rawOrderKey).push({
          no: String(rawNo),
          description: rawDesc,
          workCenter: setWorkCenters.has(rawWc) ? rawWc : 'WC-001',
          technician: rawTech,
          plannedHours: rawHours,
          actualHours: 0.0,
          status: 'OPEN'
        });
      }
    });
  }

  // Step 5: Parse Materials from Materials Sheet (if present)
  // Map: rawOrderIdentifier -> Array of material objects
  const materialsByOrder = new Map();
  if (matSheet && matSheet.rowCount >= 2) {
    const matHeaderMap = buildHeaderMap(matSheet);
    matSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return; // skip header
      const rawOrderKey = getRowVal(row, matHeaderMap, ['order', 'orderno', 'orderid', 'id']);
      const rawMat = getRowVal(row, matHeaderMap, ['material', 'materialid', 'part', 'matno'], 'MAT-001');
      const rawQty = parseFloat(getRowVal(row, matHeaderMap, ['quantity', 'qty', 'amount'], '1')) || 1.0;
      const rawUnit = getRowVal(row, matHeaderMap, ['unit', 'uom'], 'EA');

      if (rawOrderKey && rawMat) {
        if (!materialsByOrder.has(rawOrderKey)) {
          materialsByOrder.set(rawOrderKey, []);
        }
        const catalogItem = mapMaterialsCatalog.get(rawMat) || {
          description: rawMat,
          unit: rawUnit,
          unitPrice: 25.0
        };

        const unitPrice = catalogItem.unitPrice || 25.0;
        const value = rawQty * unitPrice;

        materialsByOrder.get(rawOrderKey).push({
          material: rawMat,
          description: catalogItem.description,
          qty: rawQty,
          unit: catalogItem.unit || rawUnit,
          unitPrice: unitPrice,
          value: value
        });
      }
    });
  }

  // Step 6: Parse Orders and assemble complete entities
  const orderHeaderMap = buildHeaderMap(orderSheet);
  let totalRows = 0;
  let importedCount = 0;
  let totalOpsImported = 0;
  let totalMatsImported = 0;
  let failedCount = 0;
  const errors = [];

  const ordersToInsert = [];
  const operationsToInsert = [];
  const materialsToInsert = [];
  const historyToInsert = [];

  orderSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // skip header
    totalRows++;

    const rawOrderNo = getRowVal(row, orderHeaderMap, ['order', 'orderno', 'orderid', 'id']);
    const rawEquipment = getRowVal(row, orderHeaderMap, ['equipment', 'equipmentno', 'equipmentid', 'eq'], 'EQ-001');
    const rawDescription = getRowVal(row, orderHeaderMap, ['description', 'orderdescription', 'desc', 'title']);
    const rawPlant = getRowVal(row, orderHeaderMap, ['plant', 'plantid'], '1000');
    const rawType = getRowVal(row, orderHeaderMap, ['type', 'maintenancetype', 'ordertype'], 'PREVENTIVE').toUpperCase();
    const rawPriority = getRowVal(row, orderHeaderMap, ['priority', 'prio'], 'MEDIUM').toUpperCase();
    const rawPlanner = getRowVal(row, orderHeaderMap, ['planner', 'plannerid', 'assignedplanner'], 'JOHN');
    const rawFrom = getRowVal(row, orderHeaderMap, ['scheduledfrom', 'from', 'startdate', 'scheduledstart']);
    const rawTo = getRowVal(row, orderHeaderMap, ['scheduledto', 'to', 'enddate', 'scheduledend']);
    const inlineOps = getRowVal(row, orderHeaderMap, ['operations', 'operationlist', 'tasks']);
    const inlineMats = getRowVal(row, orderHeaderMap, ['materials', 'materiallist', 'parts']);

    // Row-Level Validations
    const rowErrors = [];

    if (!rawDescription) {
      rowErrors.push('Description is required');
    }

    if (rawEquipment && setEquipments.size > 0 && !setEquipments.has(rawEquipment)) {
      rowErrors.push(`Equipment '${rawEquipment}' does not exist in master data`);
    }

    if (rawPlant && setPlants.size > 0 && !setPlants.has(rawPlant)) {
      rowErrors.push(`Plant '${rawPlant}' is invalid`);
    }

    if (rawType && setTypes.size > 0 && !setTypes.has(rawType)) {
      rowErrors.push(`Maintenance Type '${rawType}' is invalid`);
    }

    if (rawPriority && setPriorities.size > 0 && !setPriorities.has(rawPriority)) {
      rowErrors.push(`Priority '${rawPriority}' is invalid`);
    }

    const scheduledFrom = normalizeDate(rawFrom);
    const scheduledTo = normalizeDate(rawTo || rawFrom);

    if (scheduledFrom && scheduledTo && scheduledFrom > scheduledTo) {
      rowErrors.push(`Scheduled start date (${scheduledFrom}) is after end date (${scheduledTo})`);
    }

    if (rowErrors.length > 0) {
      failedCount++;
      if (errors.length < 200) {
        errors.push({
          row: rowNumber,
          order: rawOrderNo || `Row #${rowNumber}`,
          details: rowErrors.join('; ')
        });
      }
      return;
    }

    // Generate or validate unique order_no
    let orderNo = rawOrderNo;
    if (!orderNo || setExistingOrderNos.has(orderNo)) {
      while (setExistingOrderNos.has(`MO-${nextOrderNum}`)) {
        nextOrderNum++;
      }
      orderNo = `MO-${nextOrderNum++}`;
    }
    setExistingOrderNos.add(orderNo);

    // Normalize Priority State
    let priorityState = 'Information';
    if (rawPriority === 'CRITICAL' || rawPriority === 'HIGH') priorityState = 'Error';
    else if (rawPriority === 'MEDIUM') priorityState = 'Warning';
    else if (rawPriority === 'LOW') priorityState = 'Success';

    // Assemble Operations for this order
    const orderOps = [];
    // 1. From Operations Sheet
    if (rawOrderNo && operationsByOrder.has(rawOrderNo)) {
      operationsByOrder.get(rawOrderNo).forEach(op => {
        orderOps.push({ ...op, order_no: orderNo });
      });
    }
    // 2. From Inline Operations string if present (e.g. "10:Check Bearing:2h; 20:Lubrication:1h")
    if (inlineOps) {
      const parts = inlineOps.split(/[;,|]+/);
      parts.forEach((p, idx) => {
        const segs = p.split(/[:\-]/);
        const opNo = segs.length > 1 ? segs[0].trim() : String((idx + 1) * 10);
        const opDesc = segs.length > 1 ? segs[1].trim() : segs[0].trim();
        const opHours = segs.length > 2 ? parseFloat(segs[2].replace(/[^\d.]/g, '')) || 2.0 : 2.0;
        if (opDesc) {
          orderOps.push({
            order_no: orderNo,
            no: opNo,
            description: opDesc,
            workCenter: 'WC-001',
            technician: 'T-001',
            plannedHours: opHours,
            actualHours: 0.0,
            status: 'OPEN'
          });
        }
      });
    }
    // 3. Fallback default operation if none provided
    if (orderOps.length === 0) {
      orderOps.push({
        order_no: orderNo,
        no: '10',
        description: 'Standard Maintenance & Inspection',
        workCenter: 'WC-001',
        technician: 'T-001',
        plannedHours: 2.0,
        actualHours: 0.0,
        status: 'OPEN'
      });
    }

    // Assemble Materials for this order
    const orderMats = [];
    // 1. From Materials Sheet
    if (rawOrderNo && materialsByOrder.has(rawOrderNo)) {
      materialsByOrder.get(rawOrderNo).forEach(mat => {
        orderMats.push({ ...mat, order_no: orderNo });
      });
    }
    // 2. From Inline Materials string if present (e.g. "MAT-001:2; MAT-003:5")
    if (inlineMats) {
      const parts = inlineMats.split(/[;,|]+/);
      parts.forEach(p => {
        const segs = p.split(/[:\-xX\s*]+/);
        const matKey = segs[0]?.trim()?.toUpperCase();
        const matQty = segs.length > 1 ? parseFloat(segs[1].replace(/[^\d.]/g, '')) || 1.0 : 1.0;
        if (matKey) {
          const catalogItem = mapMaterialsCatalog.get(matKey) || {
            description: matKey,
            unit: 'EA',
            unitPrice: 25.0
          };
          const unitPrice = catalogItem.unitPrice || 25.0;
          orderMats.push({
            order_no: orderNo,
            material: matKey,
            description: catalogItem.description,
            qty: matQty,
            unit: catalogItem.unit || 'EA',
            unitPrice: unitPrice,
            value: matQty * unitPrice
          });
        }
      });
    }

    // Calculate aggregations
    const totalPlannedHours = orderOps.reduce((sum, o) => sum + (Number(o.plannedHours) || 0), 0);
    const totalMaterialCost = orderMats.reduce((sum, m) => sum + (Number(m.value) || 0), 0);
    const laborRatePerHour = 50.0;
    const estimatedCost = totalMaterialCost + (totalPlannedHours * laborRatePerHour);

    const orderEntity = {
      order_no: orderNo,
      equipment_no: rawEquipment,
      description: rawDescription,
      plant: rawPlant,
      maintenance_type: rawType,
      priority: rawPriority,
      priority_state: priorityState,
      status: 'OPEN',
      status_state: 'Success',
      planner: rawPlanner,
      scheduled_from: scheduledFrom,
      scheduled_to: scheduledTo,
      operation_count: orderOps.length,
      completed_operation_count: 0,
      planned_hours: totalPlannedHours,
      actual_hours: 0.0,
      estimated_cost: estimatedCost,
      currency: 'USD',
      etag: `W/"${Date.now()}"`
    };

    ordersToInsert.push(orderEntity);
    orderOps.forEach(op => operationsToInsert.push(op));
    orderMats.forEach(mat => materialsToInsert.push(mat));

    historyToInsert.push({
      order_no: orderNo,
      title: 'Order created via Excel import',
      dateTime: new Date().toISOString().replace('T', ' ').substring(0, 16),
      userName: currentUser,
      text: `Maintenance order imported with ${orderOps.length} operation(s) and ${orderMats.length} material(s).`,
      icon: 'sap-icon://excel-attachment'
    });
  });

  // Step 7: Perform Batch Transaction Inserts
  if (ordersToInsert.length > 0) {
    for (let i = 0; i < ordersToInsert.length; i += BATCH_SIZE) {
      const orderChunk = ordersToInsert.slice(i, i + BATCH_SIZE);
      const orderNosInChunk = new Set(orderChunk.map(o => o.order_no));

      const opChunk = operationsToInsert.filter(o => orderNosInChunk.has(o.order_no));
      const matChunk = materialsToInsert.filter(m => orderNosInChunk.has(m.order_no));
      const histChunk = historyToInsert.filter(h => orderNosInChunk.has(h.order_no));

      await cds.tx(async () => {
        await INSERT.into(MaintenanceOrders).entries(orderChunk);
        if (opChunk.length > 0) {
          await INSERT.into(MaintenanceOperations).entries(opChunk);
        }
        if (matChunk.length > 0) {
          await INSERT.into(OrderMaterials).entries(matChunk);
        }
        if (histChunk.length > 0) {
          await INSERT.into(OrderHistory).entries(histChunk);
        }
      });

      importedCount += orderChunk.length;
      totalOpsImported += opChunk.length;
      totalMatsImported += matChunk.length;
    }
  }

  const durationMs = Date.now() - startTime;
  const durationSec = (durationMs / 1000).toFixed(2);

  // Step 8: Record Audit Log for the bulk import
  if (importedCount > 0) {
    const timestampStr = new Date().toISOString().replace('T', ' ').substring(0, 16);
    await INSERT.into(AuditHistory).entries({
      timestamp: timestampStr,
      user: currentUser,
      object: `Bulk Import (${importedCount} orders)`,
      action: 'IMPORT',
      details: `Imported ${importedCount} orders, ${totalOpsImported} operations, and ${totalMatsImported} materials in ${durationSec}s.`
    });
  }

  return {
    success: true,
    totalRows,
    importedCount,
    operationsCount: totalOpsImported,
    materialsCount: totalMatsImported,
    failedCount,
    durationMs,
    durationSec: `${durationSec}s`,
    errors
  };
}

module.exports = {
  processExcelImport
};
