const cds = global.cds || require("@sap/cds");

module.exports = cds.service.impl(async function () {
  const {
    MaintenanceOrders,
    AuditHistory,
    OrderHistory,
    MaintenanceOperations,
  } = this.entities;

  /**
   * Returns the current user's profile and assigned roles.
   *
   * @param {import('@sap/cds').Request} req CAP request containing the authenticated user.
   * @returns {Promise<{id: string, name: string, email: string, roles: string[], isAdmin: boolean, isUser: boolean}>} Current user details.
   */
  this.on("getUserInfo", async (req) => {
    const user = req.user;
    const userId = user && user.id ? user.id : "admin";
    const isAdmin =
      user && typeof user.is === "function"
        ? user.is("Admin")
        : userId.toLowerCase().includes("admin");
    const isUser =
      user && typeof user.is === "function" ? user.is("User") : true;

    const roles = [];
    if (isAdmin) roles.push("Admin");
    if (isUser) roles.push("User");

    let displayName = userId;
    if (user && user.attr && user.attr.logon_name) {
      displayName = user.attr.logon_name;
    } else if (userId === "admin") {
      displayName = "Administrator";
    } else if (userId === "user") {
      displayName = "Standard User";
    }

    const email =
      user && user.attr && user.attr.email
        ? user.attr.email
        : userId.includes("@")
          ? userId
          : `${userId}@maintenance.sap`;

    return {
      id: userId,
      name: displayName,
      email: email,
      roles: roles,
      isAdmin: isAdmin,
      isUser: isUser,
    };
  });

  /**
   * Directly queries the database to calculate real-time KPI metrics for all maintenance orders.
   * Works consistently on both SAP HANA and SQLite.
   *
   * @param {import('@sap/cds').Request} req CAP request.
   * @returns {Promise<{openCount: number, inProcessCount: number, criticalCount: number, overdueCount: number, totalOrders: number, rawEstimatedCost: number, estimatedCost: string}>} KPI metrics summary.
   */
  this.on("getKpiMetrics", async (req) => {
    const today = new Date().toISOString().slice(0, 10);
    const db = await cds.connect.to("db");

    const sql = `
      SELECT 
        count(case when UPPER(status) = 'OPEN' then 1 end) as "openCount",
        count(case when UPPER(status) in ('IN_PROCESS', 'IN PROCESS', 'IN-PROCESS') then 1 end) as "inProcessCount",
        count(case when UPPER(priority) in ('CRITICAL', '1-VERY HIGH', 'VERY HIGH', '1') then 1 end) as "criticalCount",
        count(case when scheduled_to < '${today}' and UPPER(status) not in ('COMPLETED', 'CANCELLED') then 1 end) as "overdueCount",
        count(1) as "totalOrders",
        sum(case 
          when estimated_cost is not null and estimated_cost > 0 then estimated_cost
          when UPPER(priority) in ('CRITICAL', '1-VERY HIGH', 'VERY HIGH', '1') then 15000
          when UPPER(priority) in ('HIGH', '2-HIGH', '2') then 8000
          when UPPER(priority) in ('MEDIUM', '3-MEDIUM', '3') then 3000
          when UPPER(priority) in ('LOW', '4-LOW', '4') then 1000
          else 0
        end) as "rawEstimatedCost"
      FROM sap_cap_maintenance_MaintenanceOrders
    `;

    try {
      let res;
      try {
        res = await db.run(sql);
      } catch (tableErr) {
        console.warn("[MaintenanceService] Table query failed, trying view...", tableErr.message);
        const viewSql = sql.replace('sap_cap_maintenance_MaintenanceOrders', 'MaintenanceService_MaintenanceOrders');
        res = await db.run(viewSql);
      }

      const row = (Array.isArray(res) ? res[0] : res) || {};
      const openCount = Number(row.openCount ?? row.OPENCOUNT ?? 0);
      const inProcessCount = Number(row.inProcessCount ?? row.INPROCESSCOUNT ?? 0);
      const criticalCount = Number(row.criticalCount ?? row.CRITICALCOUNT ?? 0);
      const overdueCount = Number(row.overdueCount ?? row.OVERDUECOUNT ?? 0);
      const totalOrders = Number(row.totalOrders ?? row.TOTALORDERS ?? 0);
      const rawEstimatedCost = Number(row.rawEstimatedCost ?? row.RAWESTIMATEDCOST ?? 0);

      let estimatedCost = `$${rawEstimatedCost.toFixed(0)}`;
      if (rawEstimatedCost >= 1000000) {
        estimatedCost = `$${(rawEstimatedCost / 1000000).toFixed(1)}M`;
      } else if (rawEstimatedCost >= 1000) {
        estimatedCost = `$${(rawEstimatedCost / 1000).toFixed(1)}K`;
      }

      return {
        openCount,
        inProcessCount,
        criticalCount,
        overdueCount,
        totalOrders,
        rawEstimatedCost,
        estimatedCost,
      };
    } catch (err) {
      console.error("[MaintenanceService] Failed to query getKpiMetrics from DB:", err);
      return {
        openCount: 0,
        inProcessCount: 0,
        criticalCount: 0,
        overdueCount: 0,
        totalOrders: 0,
        rawEstimatedCost: 0,
        estimatedCost: "$0",
      };
    }
  });

  /**
   * Applies default values before a maintenance order is created.
   *
   * @param {import('@sap/cds').Request} req Create request containing order data.
   * @returns {Promise<void>} Resolves after the order defaults are populated.
   */
  this.before("CREATE", "MaintenanceOrders", async (req) => {
    const data = req.data;
    if (!data.order_no) {
      const highest = await SELECT.one
        .from(MaintenanceOrders)
        .columns("order_no")
        .orderBy("order_no desc");
      let nextNum = 1001;
      if (highest && highest.order_no) {
        const match = highest.order_no.match(/MO-(\d+)/);
        if (match) nextNum = parseInt(match[1], 10) + 1;
      }
      data.order_no = `MO-${nextNum}`;
    }
    if (!data.status) data.status = "OPEN";
    if (!data.status_state) data.status_state = "Success";
    if (!data.etag) data.etag = `W/"${Date.now()}"`;
  });

  /**
   * Creates audit and order-history records after an order is created.
   *
   * @param {object} data Newly created maintenance order.
   * @param {import('@sap/cds').Request} req Create request containing the current user.
   * @returns {Promise<void>} Resolves after history entries are persisted.
   */
  this.after("CREATE", "MaintenanceOrders", async (data, req) => {
    const currentUser = req.user?.id || "Current User";
    await INSERT.into(AuditHistory).entries({
      timestamp: new Date().toISOString().replace("T", " ").substring(0, 16),
      user: currentUser,
      object: data.order_no,
      action: "CREATE",
      details: "Maintenance order created",
    });

    await INSERT.into(OrderHistory).entries({
      order_no: data.order_no,
      title: "Order created",
      dateTime: new Date().toISOString().replace("T", " ").substring(0, 16),
      userName: currentUser,
      text: "Order initialized in system",
      icon: "sap-icon://create",
    });
  });

  /**
   * Cancels an order and records the reason in its audit history.
   *
   * @param {import('@sap/cds').Request} req Action request containing the order number and reason.
   * @returns {Promise<object|void>} Updated order, or a CAP validation error.
   */
  this.on("cancelOrder", async (req) => {
    const { order_no, reason } = req.data;
    if (!order_no) return req.error(400, "Order number is required");

    await UPDATE(MaintenanceOrders)
      .set({ status: "CANCELLED", status_state: "Error" })
      .where({ order_no });

    const currentUser = req.user?.id || "Current User";
    await INSERT.into(AuditHistory).entries({
      timestamp: new Date().toISOString().replace("T", " ").substring(0, 16),
      user: currentUser,
      object: order_no,
      action: "CANCEL",
      details: reason || "Order cancelled by user",
    });

    await INSERT.into(OrderHistory).entries({
      order_no: order_no,
      title: "Status changed to CANCELLED",
      dateTime: new Date().toISOString().replace("T", " ").substring(0, 16),
      userName: currentUser,
      text: reason || "Order cancelled",
      icon: "sap-icon://cancel",
    });

    return await SELECT.one.from(MaintenanceOrders).where({ order_no });
  });

  /**
   * Completes an order and records the status change in its history.
   *
   * @param {import('@sap/cds').Request} req Action request containing the order number.
   * @returns {Promise<object|void>} Updated order, or a CAP validation error.
   */
  this.on("completeOrder", async (req) => {
    const { order_no } = req.data;
    if (!order_no) return req.error(400, "Order number is required");

    await UPDATE(MaintenanceOrders)
      .set({ status: "COMPLETED", status_state: "Success" })
      .where({ order_no });

    const currentUser = req.user?.id || "Current User";
    await INSERT.into(AuditHistory).entries({
      timestamp: new Date().toISOString().replace("T", " ").substring(0, 16),
      user: currentUser,
      object: order_no,
      action: "COMPLETE",
      details: "Order marked as completed",
    });

    await INSERT.into(OrderHistory).entries({
      order_no: order_no,
      title: "Status changed to COMPLETED",
      dateTime: new Date().toISOString().replace("T", " ").substring(0, 16),
      userName: currentUser,
      text: "Maintenance work finished",
      icon: "sap-icon://complete",
    });

    return await SELECT.one.from(MaintenanceOrders).where({ order_no });
  });
});
