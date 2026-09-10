sap.ui.define([], () => {
  "use strict";

  return {
    /**
     * Maintenance Order Lifecycle Statuses
     */
    STATUS: Object.freeze({
      OPEN: "OPEN",
      IN_PROCESS: "IN_PROCESS",
      IN_PROCESS_DISPLAY: "IN PROCESS",
      COMPLETED: "COMPLETED",
      CANCELLED: "CANCELLED",
    }),

    /**
     * Equipment Operational Statuses
     */
    EQUIPMENT_STATUS: Object.freeze({
      ACTIVE: "ACTIVE",
      INACTIVE: "INACTIVE",
    }),

    /**
     * Priority Levels
     */
    PRIORITY: Object.freeze({
      LOW: "LOW",
      MEDIUM: "MEDIUM",
      HIGH: "HIGH",
      CRITICAL: "CRITICAL",
    }),

    /**
     * Maintenance Order Types
     */
    MAINTENANCE_TYPE: Object.freeze({
      PREVENTIVE: "PREVENTIVE",
      CORRECTIVE: "CORRECTIVE",
      EMERGENCY: "EMERGENCY",
    }),

    /**
     * SAPUI5 Value State Colors
     */
    VALUE_STATE: Object.freeze({
      NONE: "None",
      SUCCESS: "Success",
      WARNING: "Warning",
      ERROR: "Error",
      INFORMATION: "Information",
    }),
  };
});