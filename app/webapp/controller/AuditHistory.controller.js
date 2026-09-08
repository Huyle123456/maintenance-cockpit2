sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "com/fsoft/zpmmaintenancecockpit/model/AuditHistoryService",
  ],
  function (t, e, o) {
    "use strict";
    return t.extend("com.fsoft.zpmmaintenancecockpit.controller.AuditHistory", {
      /**
       * Initializes the audit-history model and subscribes to its updates.
       *
       * @returns {void}
       */
      onInit: function () {
        const t = new e({ history: o.getHistory() });
        this.getView().setModel(t, "auditHistory");
        o.onChange((t) => {
          const e = this.getView() && this.getView().getModel("auditHistory");
          if (e) {
            e.setProperty("/history", t);
          }
        });
      },
      /**
       * Navigates to an order detail page when an order reference is selected.
       *
       * @param {sap.ui.base.Event} t Object-link press event.
       * @returns {void}
       */
      onObjectPress: function (t) {
        const e = t.getSource();
        const o = e.getText();
        if (o && o.startsWith("MO-")) {
          sap.ui.core.BusyIndicator.show(0);
          const r = this.getOwnerComponent().getRouter();
          setTimeout(() => {
            r.navTo("RouteOrderDetail", { orderId: o });
          }, 60);
        }
      },
    });
  },
);
