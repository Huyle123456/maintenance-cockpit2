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
         * Loads maintenance order data and calculates dashboard metrics.
         *
         * @returns {Promise<void>} Resolves after the dashboard model is populated.
         */
        async onInit() {
          try {
            const aOrders = (await CAPService.getMaintenanceOrders()) || [];
            let iOpenCount = 0;
            let iInProcessCount = 0;
            let iCompletedCount = 0;
            let iCancelledCount = 0;
            let iCriticalCount = 0;
            const aCriticalOrders = [];

            aOrders.forEach((oOrder) => {
              if (oOrder.status === constants.STATUS.OPEN) {
                iOpenCount++;
              } else if (oOrder.status === constants.STATUS.IN_PROCESS) {
                iInProcessCount++;
              } else if (oOrder.status === constants.STATUS.COMPLETED) {
                iCompletedCount++;
              } else if (oOrder.status === constants.STATUS.CANCELLED) {
                iCancelledCount++;
              }

              if (oOrder.priority === constants.PRIORITY.CRITICAL) {
                iCriticalCount++;
                aCriticalOrders.push(oOrder);
              }
            });

            const iTotal = aOrders.length;
            const oDashboardData = {
              kpi: {
                open: iOpenCount,
                inProcess: iInProcessCount,
                critical: iCriticalCount,
                completed: iCompletedCount,
              },
              statusDistribution: {
                openPercent: iTotal ? (iOpenCount / iTotal) * 100 : 0,
                openCount: iOpenCount,
                inProcessPercent: iTotal ? (iInProcessCount / iTotal) * 100 : 0,
                inProcessCount: iInProcessCount,
                completedPercent: iTotal ? (iCompletedCount / iTotal) * 100 : 0,
                completedCount: iCompletedCount,
                cancelledPercent: iTotal ? (iCancelledCount / iTotal) * 100 : 0,
                cancelledCount: iCancelledCount,
              },
              criticalOrders: aCriticalOrders,
            };

            const oModel = new JSONModel(oDashboardData);
            this.getView().setModel(oModel, "dashboard");
          } catch (err) {
            console.error("Failed to load dashboard data from CAP:", err);
          }
        },

        /**
         * Navigates to the selected critical order's detail page with loading indicator.
         *
         * @param {sap.ui.base.Event} oEvent List item title press event.
         * @returns {void}
         */
        onCriticalOrderPress(oEvent) {
          const sOrderNo = oEvent
            .getSource()
            .getBindingContext("dashboard")
            .getProperty("order_no");

          sap.ui.core.BusyIndicator.show(0);
          UIComponent.getRouterFor(this).navTo("RouteOrderDetail", {
            orderId: sOrderNo,
          });
          setTimeout(() => {
            sap.ui.core.BusyIndicator.hide();
          }, 80);
        },

        /**
         * Navigates to the Maintenance Orders page with loading indicator.
         *
         * @returns {void}
         */
        onOpenOrderPress() {
          sap.ui.core.BusyIndicator.show(0);
          UIComponent.getRouterFor(this).navTo("RouteMaintenanceOrders");
          setTimeout(() => {
            sap.ui.core.BusyIndicator.hide();
          }, 80);
        },
      },
    );
  },
);
