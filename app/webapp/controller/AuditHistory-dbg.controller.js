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
         * Initializes the audit-history model from the global AuditHistoryService.
         *
         * @returns {void}
         */
        onInit: function () {
          const oModel = new JSONModel({
            history: AuditHistoryService.getHistory(),
          });
          this.getView().setModel(oModel, "auditHistory");

          AuditHistoryService.onChange((aHistory) => {
            const oModel = this.getView() && this.getView().getModel("auditHistory");
            if (oModel) {
              oModel.setProperty("/history", aHistory);
            }
          });
        },

        /**
         * Navigates to an order detail page when an audit-history order link is selected.
         *
         * @param {sap.ui.base.Event} oEvent Event emitted by the selected control.
         * @returns {void}
         */
        onObjectPress: function (oEvent) {
          const oSource = oEvent.getSource();
          const sObject = oSource.getText();

          if (sObject && sObject.startsWith("MO-")) {
            const oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo("RouteOrderDetail", {
              orderId: sObject,
            });
          }
        },
      },
    );
  },
);
