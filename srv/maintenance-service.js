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
    const rawId = user && user.id ? user.id : "user";
    const isInternalFallback = !user || !user.id || user.id === "privileged" || user.id === "anonymous";

    let isAdmin = false;
    let isUser = true;

    if (!isInternalFallback) {
      isAdmin = typeof user.is === "function" && user.is("Admin");
      isUser = typeof user.is === "function" ? user.is("User") : true;
    } else {
      // Internal or unauthenticated caller: default to standard user
      isAdmin = rawId.toLowerCase() === "admin";
      isUser = true;
    }

    const roles = [];
    if (isAdmin) roles.push("Admin");
    if (isUser) roles.push("User");

    let displayName = "Standard User";
    if (user && user.attr && user.attr.logon_name) {
      displayName = user.attr.logon_name;
    } else if (isAdmin) {
      displayName = "Administrator";
    } else if (!isInternalFallback && rawId) {
      displayName = rawId;
    }

    const email =
      user && user.attr && user.attr.email
        ? user.attr.email
        : rawId.includes("@")
          ? rawId
          : isAdmin
            ? "admin@maintenance.sap"
            : "user@maintenance.sap";

    return {
      id: isInternalFallback ? (isAdmin ? "admin" : "user") : rawId,
      name: displayName,
      email: email,
      roles: roles,
      isAdmin: isAdmin,
      isUser: isUser,
    };
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
