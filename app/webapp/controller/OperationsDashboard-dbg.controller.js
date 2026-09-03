sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/UIComponent",
    "sap/ui/model/json/JSONModel",
    "com/fsoft/zpmmaintenancecockpit/model/formatter",
    "com/fsoft/zpmmaintenancecockpit/model/constants",
    "com/fsoft/zpmmaintenancecockpit/model/CAPService",
  ],
  function (Controller, UIComponent, JSONModel, formatter, constants, CAPService) {
    "use strict";

    return Controller.extend(
      "com.fsoft.zpmmaintenancecockpit.controller.OperationsDashboard",
      {
        formatter: formatter,

        /**
         * Loads maintenance-order data from CAP service and calculates dashboard KPI and distribution values.
         *
         * @returns {void}
         */
        onInit: async function () {
          try {
            const aOrders = await CAPService.getMaintenanceOrders();

            let iOpen = 0,
              iInProcess = 0,
              iCompleted = 0,
              iCancelled = 0;
            let iCritical = 0;
            const aCriticalOrders = [];

            aOrders.forEach((oOrder) => {
              // Count statuses
              if (oOrder.status === constants.STATUS.OPEN) iOpen++;
              else if (oOrder.status === constants.STATUS.IN_PROCESS)
                iInProcess++;
              else if (oOrder.status === constants.STATUS.COMPLETED)
                iCompleted++;
              else if (oOrder.status === constants.STATUS.CANCELLED)
                iCancelled++;

              // Count critical (assume HIGH or CRITICAL priority is critical)
              if (
                oOrder.priority === constants.PRIORITY.HIGH ||
                oOrder.priority === constants.PRIORITY.CRITICAL
              ) {
                iCritical++;
                aCriticalOrders.push(oOrder);
              }
            });

            const total = aOrders.length;

            const oDashboardData = {
              kpi: {
                open: iOpen,
                inProcess: iInProcess,
                critical: iCritical,
                completed: iCompleted,
              },
              statusDistribution: {
                openPercent: total ? (iOpen / total) * 100 : 0,
                openCount: iOpen,
                inProcessPercent: total ? (iInProcess / total) * 100 : 0,
                inProcessCount: iInProcess,
                completedPercent: total ? (iCompleted / total) * 100 : 0,
                completedCount: iCompleted,
                cancelledPercent: total ? (iCancelled / total) * 100 : 0,
                cancelledCount: iCancelled,
              },
              criticalOrders: aCriticalOrders,
            };

            const oDashboardModel = new JSONModel(oDashboardData);
            this.getView().setModel(oDashboardModel, "dashboard");
          } catch (err) {
            console.error("Failed to load dashboard data from CAP:", err);
          }
        },

        /**
         * Opens the maintenance order detail page.
         *
         * @param {sap.ui.base.Event} oEvent Link press event
         * @returns {void}
         */
        onCriticalOrderPress(oEvent) {
          const sOrderNo = oEvent
            .getSource()
            .getBindingContext("dashboard")
            .getProperty("order_no");

          UIComponent.getRouterFor(this).navTo("RouteOrderDetail", {
            orderId: sOrderNo,
          });
        },

        /**
         * Navigates to the Maintenance Orders list page.
         *
         * @returns {void}
         */
        onOpenOrderPress: function () {
          UIComponent.getRouterFor(this).navTo("RouteMaintenanceOrders");
        },
      },
    );
  },
);
