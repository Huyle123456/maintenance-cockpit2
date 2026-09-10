/**
 * Centralized Constants and Enums for Backend Services.
 *
 * Provides immutable references for Order Statuses, Priorities,
 * Maintenance Types, SAP Fiori Value States, and Import Configurations.
 */

"use strict";

/**
 * Maintenance Order Lifecycle Statuses.
 */
const ORDER_STATUS = Object.freeze({
  OPEN: "OPEN",
  IN_PROCESS: "IN_PROCESS",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
});

/**
 * Priority Levels.
 */
const PRIORITY = Object.freeze({
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  CRITICAL: "CRITICAL",
});

/**
 * Maintenance Order Types.
 */
const MAINTENANCE_TYPE = Object.freeze({
  PREVENTIVE: "PREVENTIVE",
  CORRECTIVE: "CORRECTIVE",
  EMERGENCY: "EMERGENCY",
});

/**
 * SAP Fiori Value States.
 */
const VALUE_STATE = Object.freeze({
  NONE: "None",
  SUCCESS: "Success",
  WARNING: "Warning",
  ERROR: "Error",
  INFORMATION: "Information",
});

/**
 * Excel Import Service & Background Job Configurations.
 */
const IMPORT_CONFIG = Object.freeze({
  DEFAULT_BATCH_SIZE: 500,
  CLEANUP_CHUNK_SIZE: 200,
  MAX_HISTORY_RECORD_COUNT: 5000,
  LABOR_RATE_PER_HOUR: 50.0,
  DEFAULT_PLANT: "1000",
  DEFAULT_WORK_CENTER: "WC-001",
  DEFAULT_TECHNICIAN: "T-001",
  DEFAULT_PLANNER: "JOHN",
  DEFAULT_PLANNED_HOURS: 2.0,
  BASE_ORDER_SEQ: 1000,
  OPERATION_SEQ_STEP: 10,
  MAX_FILE_SIZE_BYTES: 100 * 1024 * 1024, // 100MB
  JOB_CLEANUP_INTERVAL_MS: 15 * 60 * 1000, // 15 minutes
  JOB_EXPIRY_MS: 60 * 60 * 1000, // 1 hour
});

module.exports = {
  ORDER_STATUS,
  PRIORITY,
  MAINTENANCE_TYPE,
  VALUE_STATE,
  IMPORT_CONFIG,
};
