sap.ui.define([], function () {
  "use strict";

  return {
    /**
     * Formats the scheduled date range display string.
     *
     * @param {string} sFrom Start date string
     * @param {string} sTo End date string
     * @returns {string} Formatted range "from → to"
     */
    formatScheduleRange(sFrom, sTo) {
      if (!sFrom || !sTo) {
        return "";
      }
      return `${sFrom} → ${sTo}`;
    },

    /**
     * Formats the count of items in an array.
     *
     * @param {Array} aList List of items
     * @returns {string} String representation of array length
     */
    formatCount(aList) {
      return String((aList || []).length);
    },

    /**
     * Normalizes a status string to uppercase and replaces underscores with spaces.
     *
     * @param {string} sStatus Status text
     * @returns {string} Normalized status string
     */
    normalizeStatus(sStatus) {
      return (sStatus || "")
        .toString()
        .trim()
        .toUpperCase()
        .replace(/_/g, " ");
    },

    /**
     * Normalizes a priority string to uppercase.
     *
     * @param {string} sPriority Priority text
     * @returns {string} Normalized priority string
     */
    normalizePriority(sPriority) {
      return (sPriority || "").toString().trim().toUpperCase();
    },

    /**
     * Determines whether an order is overdue based on scheduled end date and status.
     *
     * @param {string} sScheduledTo Scheduled end date
     * @param {string} sStatus Current order status
     * @returns {boolean} True if overdue, false otherwise
     */
    isOverdue(sScheduledTo, sStatus) {
      const sNormStatus = this.normalizeStatus(sStatus);
      const bIsCompleted =
        sNormStatus === "COMPLETED" || sNormStatus === "CANCELLED";

      if (bIsCompleted || !sScheduledTo) {
        return false;
      }

      const oDueDate = new Date(sScheduledTo);
      if (Number.isNaN(oDueDate.getTime())) {
        return false;
      }

      const oToday = new Date();
      oToday.setHours(0, 0, 0, 0);

      return oDueDate < oToday;
    },

    /**
     * Calculates the total estimated cost for a given list of maintenance orders.
     *
     * @param {Array} aOrders List of order objects
     * @returns {string} Formatted cost (e.g. "$32.0K" or "$500")
     */
    calculateEstimatedCost(aOrders) {
      const mCostByPriority = {
        LOW: 1000,
        MEDIUM: 3000,
        HIGH: 8000,
        CRITICAL: 15000,
      };

      const iTotal = (aOrders || []).reduce((acc, oOrder) => {
        const sPriority = this.normalizePriority(oOrder.priority);
        const iCost = mCostByPriority[sPriority] || 0;
        return acc + iCost;
      }, 0);

      if (iTotal >= 1000) {
        return `$${(iTotal / 1000).toFixed(1)}K`;
      }
      return `$${iTotal}`;
    },

    /**
     * Maps an order or equipment status to a SAPUI5 ValueState / Indication color.
     *
     * @param {string} sStatus Status text
     * @returns {string} SAPUI5 ValueState or Indication color string
     */
    formatStatusState(sStatus) {
      const sNormStatus = this.normalizeStatus(sStatus);
      const mStateMap = {
        ACTIVE: "Success",
        INACTIVE: "Error",
        OPEN: "Indication15",
        "IN PROCESS": "Indication13",
        "IN-PROCESS": "Indication13",
        IN_PROCESS: "Indication13",
        COMPLETED: "Indication14",
        CANCELLED: "Indication12",
        CRITICAL: "Error",
        HIGH: "Error",
        MEDIUM: "Warning",
        LOW: "Success",
      };
      return mStateMap[sNormStatus] || "None";
    },

    /**
     * Maps an order priority to a SAPUI5 ValueState color.
     *
     * @param {string} sPriority Priority text
     * @returns {string} SAPUI5 ValueState (Error, Warning, Success, None)
     */
    formatPriorityState(sPriority) {
      const sNormPriority = this.normalizePriority(sPriority);
      switch (sNormPriority) {
        case "CRITICAL":
        case "HIGH":
          return "Error";
        case "MEDIUM":
          return "Warning";
        case "LOW":
          return "Success";
        default:
          return "None";
      }
    },

    /**
     * Formats a numeric value as a currency string ($XX.XX).
     *
     * @param {number|string} nAmount Amount value
     * @returns {string} Formatted currency string
     */
    formatCurrency(nAmount) {
      if (nAmount === undefined || nAmount === null || nAmount === "") {
        return "";
      }
      return `$${parseFloat(nAmount).toFixed(2)}`;
    },

    /**
     * Formats equipment / technician availability into a ValueState.
     *
     * @param {string} sAvailable "YES" or "NO"
     * @returns {string} "Success" or "Error"
     */
    formatAvailableState(sAvailable) {
      return sAvailable === "YES" ? "Success" : "Error";
    },
  };
});
