sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "com/fsoft/zpmmaintenancecockpit/model/AuditHistoryService",
  ],
  function (Controller, JSONModel, AuditHistoryService) {
    "use strict";

    return Controller.extend("com.fsoft.zpmmaintenancecockpit.controller.AuditHistory", {
      /**
       * Initializes the audit-history model and subscribes to its updates.
       *
       * @returns {void}
       */
      onInit() {
        const oModel = new JSONModel({ history: AuditHistoryService.getHistory() });
        this.getView().setModel(oModel, "auditHistory");

        AuditHistoryService.onChange((aHistory) => {
          const oCurrentModel = this.getView() && this.getView().getModel("auditHistory");
          if (oCurrentModel) {
            oCurrentModel.setProperty("/history", aHistory);
          }
        });
      },

      /**
       * Navigates to an order detail page when an order reference is selected.
       *
       * @param {sap.ui.base.Event} oEvent Object-link press event.
       * @returns {void}
       */
      onObjectPress(oEvent) {
        const oSource = oEvent.getSource();
        const sOrderNo = oSource.getText();

        if (sOrderNo && sOrderNo.startsWith("MO-")) {
          sap.ui.core.BusyIndicator.show(0);
          const oRouter = this.getOwnerComponent().getRouter();
          setTimeout(() => {
            oRouter.navTo("RouteOrderDetail", { orderId: sOrderNo });
          }, 60);
        }
      },
    });
  },
);
