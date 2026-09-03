sap.ui.define([], function () {
  "use strict";

  const Formatter = {
    // Format schedule range.
    formatScheduleRange(sScheduledStart, sScheduledEnd) {
      if (!sScheduledStart || !sScheduledEnd) {
        return "";
      }

      return `${sScheduledStart} → ${sScheduledEnd}`;
    },

    // Format collection count.
    formatCount(aItems) {
      return String((aItems || []).length);
    },

    /**
     * Normalize status value for consistent processing.
     *
     * @param {string} sStatus Status value
     * @returns {string} Normalized status
     */
    normalizeStatus(sStatus) {
      return (sStatus || "").toString().trim().toUpperCase().replace(/_/g, " ");
    },

    /**
     * Normalize priority value for consistent comparison.
     *
     * @param {string} sPriority Priority value
     * @returns {string} Normalized priority
     */
    normalizePriority(sPriority) {
      return (sPriority || "").toString().trim().toUpperCase();
    },

    /**
     * Determines whether a maintenance order is overdue.
     *
     * @param {string} sScheduledTo Scheduled end date
     * @param {string} sStatus Order status
     * @returns {boolean} True if overdue
     */
    isOverdue(sScheduledTo, sStatus) {
      const sNormalizedStatus = Formatter.normalizeStatus(sStatus);
      const bIsClosedStatus =
        sNormalizedStatus === "COMPLETED" || sNormalizedStatus === "CANCELLED";

      if (bIsClosedStatus || !sScheduledTo) {
        return false;
      }

      const oScheduledDate = new Date(sScheduledTo);
      if (Number.isNaN(oScheduledDate.getTime())) {
        return false;
      }

      const oToday = new Date();
      oToday.setHours(0, 0, 0, 0);

      return oScheduledDate < oToday;
    },

    /**
     * Calculates the estimated cost formatted string from orders.
     *
     * @param {object[]} aRows Maintenance order collection
     * @returns {string} Formatted estimated cost value
     */
    calculateEstimatedCost(aRows) {
      const mCostByPriority = {
        LOW: 1000,
        MEDIUM: 3000,
        HIGH: 8000,
        CRITICAL: 15000,
      };

      const iTotalCost = (aRows || []).reduce((iTotal, oRow) => {
        const iOrderCost =
          mCostByPriority[Formatter.normalizePriority(oRow.priority)] || 0;
        return iTotal + iOrderCost;
      }, 0);

      if (iTotalCost >= 1000) {
        return `$${(iTotalCost / 1000).toFixed(1)}K`;
      }

      return `$${iTotalCost}`;
    },

    /**
     * Convert status value to SAP semantic state.
     *
     * @param {string} sStatus Status value
     * @returns {string} Semantic state
     */
    formatStatusState(sStatus) {
      const sNormalized = Formatter.normalizeStatus(sStatus);

      const mStatusToState = {
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

      return mStatusToState[sNormalized] || "None";
    },

    /**
     * Convert priority value to SAP semantic state.
     *
     * @param {string} sPriority Priority value
     * @returns {string} Semantic state
     */
    formatPriorityState(sPriority) {
      const sValue = Formatter.normalizePriority(sPriority);

      switch (sValue) {
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
     * Format currency value.
     *
     * @param {number|string} fValue Currency value
     * @returns {string} Formatted amount
     */
    formatCurrency(fValue) {
      if (fValue === undefined || fValue === null) {
        return "";
      }

      return `$${parseFloat(fValue).toFixed(2)}`;
    },

    /**
     * Convert technician availability to semantic state.
     *
     * @param {string} sAvailable Availability flag
     * @returns {string} Semantic state
     */
    formatAvailableState(sAvailable) {
      return sAvailable === "YES" ? "Success" : "Error";
    },
  };

  return Formatter;
});
