sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/UIComponent",
    "sap/ui/model/json/JSONModel",
    "com/fsoft/zpmmaintenancecockpit/model/formatter",
    "com/fsoft/zpmmaintenancecockpit/model/constants",
    "com/fsoft/zpmmaintenancecockpit/model/CAPService",
  ],
  function (
    Controller,
    UIComponent,
    JSONModel,
    formatter,
    constants,
    CAPService,
  ) {
    "use strict";
    return Controller.extend(
      "com.fsoft.zpmmaintenancecockpit.controller.OperationsDashboard",
      {
        formatter,
        /**
         * Loads maintenance order data and calculates dashboard metrics.
         *
         * @returns {Promise<void>} Resolves after the dashboard model is populated.
         */
        async onInit() {
          try {
            const orders = await CAPService.getMaintenanceOrders();
            let openCount = 0;
            let inProcessCount = 0;
            let completedCount = 0;
            let cancelledCount = 0;
            let criticalCount = 0;
            const criticalOrders = [];
            orders.forEach((order) => {
              if (order.status === constants.STATUS.OPEN) openCount++;
              else if (order.status === constants.STATUS.IN_PROCESS)
                inProcessCount++;
              else if (order.status === constants.STATUS.COMPLETED)
                completedCount++;
              else if (order.status === constants.STATUS.CANCELLED)
                cancelledCount++;
              if (order.priority === constants.PRIORITY.CRITICAL) {
                criticalCount++;
                criticalOrders.push(order);
              }
            });
            const totalOrders = orders.length;
            const dashboardData = {
              kpi: {
                open: openCount,
                inProcess: inProcessCount,
                critical: criticalCount,
                completed: completedCount,
              },
              statusDistribution: {
                openPercent: totalOrders ? (openCount / totalOrders) * 100 : 0,
                openCount,
                inProcessPercent: totalOrders
                  ? (inProcessCount / totalOrders) * 100
                  : 0,
                inProcessCount,
                completedPercent: totalOrders
                  ? (completedCount / totalOrders) * 100
                  : 0,
                completedCount,
                cancelledPercent: totalOrders
                  ? (cancelledCount / totalOrders) * 100
                  : 0,
                cancelledCount,
              },
              criticalOrders,
            };
            const dashboardModel = new JSONModel(dashboardData);
            this.getView().setModel(dashboardModel, "dashboard");
          } catch (error) {
            console.error("Failed to load dashboard data from CAP:", error);
          }
        },

        /**
         * Navigates to the selected critical order's detail page with loading indicator.
         *
         * @param {sap.ui.base.Event} oEvent List item title press event.
         * @returns {void}
         */
        onCriticalOrderPress(event) {
          const orderId = event
            .getSource()
            .getBindingContext("dashboard")
            .getProperty("order_no");

          sap.ui.core.BusyIndicator.show(0);
          UIComponent.getRouterFor(this).navTo("RouteOrderDetail", { orderId });
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
