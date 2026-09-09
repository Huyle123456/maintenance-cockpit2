sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "com/fsoft/zpmmaintenancecockpit/model/AuditHistoryService",
  ],
  function (Controller, JSONModel, AuditHistoryService) {
    "use strict";
    return Controller.extend(
      "com.fsoft.zpmmaintenancecockpit.controller.AuditHistory",
      {
        /**
         * Initializes the audit-history model and subscribes to its updates.
         *
         * @returns {void}
         */
        onInit: function () {
          const historyModel = new JSONModel({
            history: AuditHistoryService.getHistory(),
          });
          this.getView().setModel(historyModel, "auditHistory");
          AuditHistoryService.onChange((history) => {
            const auditHistoryModel =
              this.getView() && this.getView().getModel("auditHistory");
            if (auditHistoryModel) {
              auditHistoryModel.setProperty("/history", history);
            }
          });
        },
        /**
         * Navigates to an order detail page when an order reference is selected.
         *
         * @param {sap.ui.base.Event} event Object-link press event.
         * @returns {void}
         */
        onObjectPress: function (event) {
          const orderLink = event.getSource();
          const orderId = orderLink.getText();
          if (orderId && orderId.startsWith("MO-")) {
            sap.ui.core.BusyIndicator.show(0);
            const router = this.getOwnerComponent().getRouter();
            setTimeout(() => {
              router.navTo("RouteOrderDetail", { orderId });
            }, 60);
          }
        },
      },
    );
  },
);
