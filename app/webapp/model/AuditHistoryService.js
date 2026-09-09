/**
 * AuditHistoryService — store for audit history entries backed by CAP OData V4 Service.
 */
sap.ui.define([
    "com/fsoft/zpmmaintenancecockpit/model/CAPService",
    "com/fsoft/zpmmaintenancecockpit/model/AuthService"
], function (CAPService, AuthService) {
    "use strict";

    let _aHistory = [];
    const _oListeners = [];

    /**
     * Formats current date and time as 'YYYY-MM-DD HH:mm'.
     *
     * @returns {string} Formatted timestamp string.
     */
    function _now() {
        const d = new Date();
        return d.getFullYear() + "-" +
            String(d.getMonth() + 1).padStart(2, "0") + "-" +
            String(d.getDate()).padStart(2, "0") + " " +
            String(d.getHours()).padStart(2, "0") + ":" +
            String(d.getMinutes()).padStart(2, "0");
    }

    /**
     * Notifies all registered listener callbacks with a shallow copy of the audit history list.
     *
     * @returns {void}
     */
    function _notify() {
        _oListeners.forEach(fn => fn([..._aHistory]));
    }

    // Initial load from CAP
    CAPService.getAuditHistory().then(aData => {
        _aHistory = aData || [];
        _notify();
    }).catch(err => {
        console.warn("AuditHistory initial load warning:", err);
    });

    return {
        /**
         * Adds a new entry at the top of the history list and persists it to the CAP backend.
         *
         * @param {string} sObject - Target object identifier (e.g. "MO-1010").
         * @param {string} sAction - Performed action type (e.g. "CREATE" | "UPDATE" | "DELETE").
         * @param {string} sDetails - Detailed description of the operation (e.g. "Maintenance order created").
         * @param {string} [sUser] - User who executed the action, defaults to current authenticated user.
         * @returns {void}
         */
        addEntry: function (sObject, sAction, sDetails, sUser) {
            const currentUserName = (AuthService.getCurrentUser() && AuthService.getCurrentUser().name) || "Administrator";
            const oEntry = {
                timestamp: _now(),
                user:      sUser || currentUserName,
                object:    sObject || "",
                action:    sAction || "UPDATE",
                details:   sDetails || ""
            };
            _aHistory.unshift(oEntry);
            _notify();

            CAPService.addAuditEntry(oEntry).catch(err => {
                console.error("Failed to persist audit entry to CAP:", err);
            });
        },

        /**
         * Retrieves a shallow copy of the entire in-memory audit history records.
         *
         * @returns {Array<object>} Copy of the audit history list.
         */
        getHistory: function () {
            return [..._aHistory];
        },

        /**
         * Refreshes audit history records by re-querying the CAP backend service.
         *
         * @returns {Promise<Array<object>>} Updated audit history array.
         */
        async refresh() {
            try {
                const aData = await CAPService.getAuditHistory();
                _aHistory = aData || [];
                _notify();
                return _aHistory;
            } catch (err) {
                console.error("Failed to refresh audit history:", err);
                return _aHistory;
            }
        },

        /**
         * Registers an event callback listener that triggers whenever the history list changes.
         *
         * @param {Function} fnCallback - Listener callback receiving updated history array.
         * @returns {void}
         */
        onChange: function (fnCallback) {
            if (typeof fnCallback === "function") {
                _oListeners.push(fnCallback);
            }
        }
    };
});