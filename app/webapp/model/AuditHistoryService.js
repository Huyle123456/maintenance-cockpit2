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

    function _now() {
        const d = new Date();
        return d.getFullYear() + "-" +
            String(d.getMonth() + 1).padStart(2, "0") + "-" +
            String(d.getDate()).padStart(2, "0") + " " +
            String(d.getHours()).padStart(2, "0") + ":" +
            String(d.getMinutes()).padStart(2, "0");
    }

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
         * Add a new entry at the top of the history list and persist to CAP backend.
         * @param {string} sObject  - e.g. "MO-1010"
         * @param {string} sAction  - e.g. "CREATE" | "UPDATE"
         * @param {string} sDetails - e.g. "Maintenance order created"
         * @param {string} [sUser]  - defaults to current user
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
         * Get a copy of the full history array.
         * @returns {Array}
         */
        getHistory: function () {
            return [..._aHistory];
        },

        /**
         * Refresh audit history from CAP backend.
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
         * Register a callback that fires whenever the history changes.
         * @param {function} fnCallback
         */
        onChange: function (fnCallback) {
            if (typeof fnCallback === "function") {
                _oListeners.push(fnCallback);
            }
        }
    };
});