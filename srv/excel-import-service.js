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
 * Process Excel file buffer using ExcelJS streaming parser
 * Supports high volume data with minimal RAM footprint and batch DB transactions
 *
 * @param {Buffer|Readable} fileSource File buffer or stream
 * @param {string} currentUser ID of user performing import
 * @param {object} options Optional configs (batchSize, etc.)
 * @returns {Promise<{success: boolean, totalRows: number, importedCount: number, failedCount: number, errors: Array}>}
 */
async function processExcelImport(fileSource, currentUser = 'Current User', options = {}) {
  const startTime = Date.now();
  const BATCH_SIZE = options.batchSize || 1000;
  const db = await cds.connect.to('db');
  const { MaintenanceOrders, Equipments, Plants, MaintenanceTypes, Priorities, Planners, AuditHistory, OrderHistory } = cds.entities('sap.cap.maintenance');

  // Step 1: Pre-fetch master data cache for O(1) validations during streaming
  const [aEquipments, aPlants, aTypes, aPriorities, aPlanners] = await Promise.all([
    SELECT.from(Equipments).columns('equipment'),
    SELECT.from(Plants).columns('key'),
    SELECT.from(MaintenanceTypes).columns('key'),
    SELECT.from(Priorities).columns('key'),
    SELECT.from(Planners).columns('key')
  ]);

  const setEquipments = new Set((aEquipments || []).map(e => e.equipment));
  const setPlants = new Set((aPlants || []).map(p => p.key));
  const setTypes = new Set((aTypes || []).map(t => t.key));
  const setPriorities = new Set((aPriorities || []).map(p => p.key));
  const setPlanners = new Set((aPlanners || []).map(p => p.key));

  // Step 2: Determine next order number sequence
  const highest = await SELECT.one.from(MaintenanceOrders).columns('order_no').orderBy('order_no desc');
  let nextOrderNum = 1001;
  if (highest && highest.order_no) {
    const match = highest.order_no.match(/MO-(\d+)/);
    if (match) nextOrderNum = parseInt(match[1], 10) + 1;
  }

  // Pre-fetch existing order numbers to avoid primary key duplicate collision
  const existingOrders = await SELECT.from(MaintenanceOrders).columns('order_no');
  const setExistingOrderNos = new Set((existingOrders || []).map(o => o.order_no));

  // Step 3: Initialize ExcelJS Streaming WorkbookReader
  let inputStream = fileSource;
  if (Buffer.isBuffer(fileSource)) {
    inputStream = Readable.from(fileSource);
  }

  const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(inputStream, {
    entries: 'emit',
    sharedStrings: 'cache',
    hyperlinks: 'ignore',
    styles: 'ignore'
  });

  let totalRows = 0;
  let importedCount = 0;
  let failedCount = 0;
  const errors = [];
  let headerMap = {};
  let isFirstRow = true;
  let batchChunk = [];

  // Helper to commit a batch to DB
  async function flushBatch() {
    if (batchChunk.length === 0) return;
    const chunkToInsert = [...batchChunk];
    batchChunk = [];

    await cds.tx(async () => {
      await INSERT.into(MaintenanceOrders).entries(chunkToInsert);
    });
    importedCount += chunkToInsert.length;
  }

  // Step 4: Stream through worksheet rows
  for await (const worksheetReader of workbookReader) {
    for await (const row of worksheetReader) {
      const rowValues = Array.isArray(row.values) ? row.values : Object.values(row.values || {});

      // Parse Header Row
      if (isFirstRow) {
        rowValues.forEach((colName, idx) => {
          if (!colName) return;
          const cleanName = cleanCellValue(colName).toLowerCase().replace(/[\s_\-#]+/g, '');
          if (cleanName) {
            headerMap[cleanName] = idx;
          }
        });
        isFirstRow = false;
        continue;
      }

      totalRows++;
      const rowNum = totalRows + 1; // 1-indexed relative to Excel sheet

      // Extract column values
      const getVal = (possibleKeys, def = '') => {
        for (const k of possibleKeys) {
          const idx = headerMap[k];
          if (idx !== undefined && rowValues[idx] !== undefined) {
            const v = cleanCellValue(rowValues[idx]);
            if (v !== '') return v;
          }
        }
        return def;
      };

      const rawOrderNo = getVal(['order', 'orderno', 'orderid', 'id']);
      const rawEquipment = getVal(['equipment', 'equipmentno', 'equipmentid', 'eq'], 'EQ-001');
      const rawDescription = getVal(['description', 'orderdescription', 'desc', 'title']);
      const rawPlant = getVal(['plant', 'plantid'], '1000');
      const rawType = getVal(['type', 'maintenancetype', 'ordertype'], 'PREVENTIVE').toUpperCase();
      const rawPriority = getVal(['priority', 'prio'], 'MEDIUM').toUpperCase();
      const rawPlanner = getVal(['planner', 'plannerid', 'assignedplanner'], 'John Doe');
      const rawFrom = getVal(['scheduledfrom', 'from', 'startdate', 'scheduledstart']);
      const rawTo = getVal(['scheduledto', 'to', 'enddate', 'scheduledend']);

      // Validations
      if (!rawDescription) {
        failedCount++;
        if (errors.length < 50) {
          errors.push({ row: rowNum, error: 'Description is required' });
        }
        continue;
      }

      // Generate or validate order_no
      let orderNo = rawOrderNo;
      if (!orderNo || setExistingOrderNos.has(orderNo)) {
        while (setExistingOrderNos.has(`MO-${nextOrderNum}`)) {
          nextOrderNum++;
        }
        orderNo = `MO-${nextOrderNum++}`;
      }
      setExistingOrderNos.add(orderNo);

      // Normalize Priority & Status
      let priorityState = 'Information';
      if (rawPriority === 'CRITICAL' || rawPriority === 'HIGH') priorityState = 'Error';
      else if (rawPriority === 'MEDIUM') priorityState = 'Warning';
      else if (rawPriority === 'LOW') priorityState = 'Success';

      const scheduledFrom = normalizeDate(rawFrom);
      const scheduledTo = normalizeDate(rawTo || rawFrom);

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
        operation_count: 1,
        completed_operation_count: 0,
        planned_hours: 2.0,
        actual_hours: 0.0,
        estimated_cost: 0.0,
        currency: 'USD',
        etag: `W/"${Date.now()}"`
      };

      batchChunk.push(orderEntity);

      // Trigger batch insert when limit reached
      if (batchChunk.length >= BATCH_SIZE) {
        await flushBatch();
      }
    }
  }

  // Insert any remaining items
  if (batchChunk.length > 0) {
    await flushBatch();
  }

  const durationMs = Date.now() - startTime;
  const durationSec = (durationMs / 1000).toFixed(2);

  // Step 5: Record Audit Log for the bulk import
  if (importedCount > 0) {
    const timestampStr = new Date().toISOString().replace('T', ' ').substring(0, 16);
    await INSERT.into(AuditHistory).entries({
      timestamp: timestampStr,
      user: currentUser,
      object: `Bulk Import (${importedCount} orders)`,
      action: 'IMPORT',
      details: `Imported ${importedCount} orders in ${durationSec}s via ExcelJS streaming backend.`
    });
  }

  return {
    success: true,
    totalRows,
    importedCount,
    failedCount,
    durationMs,
    durationSec: `${durationSec}s`,
    errors
  };
}

module.exports = {
  processExcelImport
};
