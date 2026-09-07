sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/UIComponent",
    "sap/ui/model/json/JSONModel",
    "com/fsoft/zpmmaintenancecockpit/model/formatter",
    "com/fsoft/zpmmaintenancecockpit/model/constants",
    "com/fsoft/zpmmaintenancecockpit/model/CAPService",
  ],
  function (e, t, o, n, r, c) {
    "use strict";
    return e.extend(
      "com.fsoft.zpmmaintenancecockpit.controller.OperationsDashboard",
      {
        formatter: n,
        /**
         * Loads maintenance order data and calculates dashboard metrics.
         *
         * @returns {Promise<void>} Resolves after the dashboard model is populated.
         */
        onInit: async function () {
          try {
            const e = await c.getMaintenanceOrders();
            let t = 0,
              n = 0,
              s = 0,
              i = 0;
            let a = 0;
            const d = [];
            e.forEach((e) => {
              if (e.status === r.STATUS.OPEN) t++;
              else if (e.status === r.STATUS.IN_PROCESS) n++;
              else if (e.status === r.STATUS.COMPLETED) s++;
              else if (e.status === r.STATUS.CANCELLED) i++;
              if (e.priority === r.PRIORITY.CRITICAL) {
                a++;
                d.push(e);
              }
            });
            const l = e.length;
            const p = {
              kpi: { open: t, inProcess: n, critical: a, completed: s },
              statusDistribution: {
                openPercent: l ? (t / l) * 100 : 0,
                openCount: t,
                inProcessPercent: l ? (n / l) * 100 : 0,
                inProcessCount: n,
                completedPercent: l ? (s / l) * 100 : 0,
                completedCount: s,
                cancelledPercent: l ? (i / l) * 100 : 0,
                cancelledCount: i,
              },
              criticalOrders: d,
            };
            const u = new o(p);
            this.getView().setModel(u, "dashboard");
          } catch (e) {
            console.error("Failed to load dashboard data from CAP:", e);
          }
        },
        /**
         * Navigates to the selected critical order's detail page with loading indicator.
         *
         * @param {sap.ui.base.Event} e List item title press event.
         * @returns {void}
         */
        onCriticalOrderPress(e) {
          const o = e
            .getSource()
            .getBindingContext("dashboard")
            .getProperty("order_no");
          sap.ui.core.BusyIndicator.show(0);
          t.getRouterFor(this).navTo("RouteOrderDetail", { orderId: o });
          setTimeout(() => {
            sap.ui.core.BusyIndicator.hide();
          }, 80);
        },
        /**
         * Navigates to the Maintenance Orders page with loading indicator.
         *
         * @returns {void}
         */
        onOpenOrderPress: function () {
          sap.ui.core.BusyIndicator.show(0);
          t.getRouterFor(this).navTo("RouteMaintenanceOrders");
          setTimeout(() => {
            sap.ui.core.BusyIndicator.hide();
          }, 80);
        },
      },
    );
  },
);
//# sourceMappingURL=OperationsDashboard.controller.js.map
