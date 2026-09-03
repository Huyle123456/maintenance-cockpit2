const cds = global.cds || require('@sap/cds');

module.exports = cds.service.impl(async function () {
  const { MaintenanceOrders, AuditHistory, OrderHistory, MaintenanceOperations } = this.entities;

  // Retrieve current user profile and roles from SAP XSUAA or mock auth
  this.on('getUserInfo', async (req) => {
    const user = req.user;
    const userId = (user && user.id) ? user.id : 'admin';
    const isAdmin = (user && typeof user.is === 'function') ? user.is('Admin') : (userId.toLowerCase().includes('admin'));
    const isUser = (user && typeof user.is === 'function') ? user.is('User') : true;

    const roles = [];
    if (isAdmin) roles.push('Admin');
    if (isUser) roles.push('User');

    let displayName = userId;
    if (user && user.attr && user.attr.logon_name) {
      displayName = user.attr.logon_name;
    } else if (userId === 'admin') {
      displayName = 'Administrator';
    } else if (userId === 'user') {
      displayName = 'Standard User';
    }

    const email = (user && user.attr && user.attr.email)
      ? user.attr.email
      : (userId.includes('@') ? userId : `${userId}@maintenance.sap`);

    return {
      id: userId,
      name: displayName,
      email: email,
      roles: roles,
      isAdmin: isAdmin,
      isUser: isUser
    };
  });

  this.before('CREATE', 'MaintenanceOrders', async (req) => {
    const data = req.data;
    if (!data.order_no) {
      const highest = await SELECT.one.from(MaintenanceOrders).columns('order_no').orderBy('order_no desc');
      let nextNum = 1001;
      if (highest && highest.order_no) {
        const match = highest.order_no.match(/MO-(\d+)/);
        if (match) nextNum = parseInt(match[1], 10) + 1;
      }
      data.order_no = `MO-${nextNum}`;
    }
    if (!data.status) data.status = 'OPEN';
    if (!data.status_state) data.status_state = 'Success';
    if (!data.etag) data.etag = `W/"${Date.now()}"`;
  });

  this.after('CREATE', 'MaintenanceOrders', async (data, req) => {
    const currentUser = req.user?.id || 'Current User';
    await INSERT.into(AuditHistory).entries({
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
      user: currentUser,
      object: data.order_no,
      action: 'CREATE',
      details: 'Maintenance order created'
    });

    await INSERT.into(OrderHistory).entries({
      order_no: data.order_no,
      title: 'Order created',
      dateTime: new Date().toISOString().replace('T', ' ').substring(0, 16),
      userName: currentUser,
      text: 'Order initialized in system',
      icon: 'sap-icon://create'
    });
  });

  this.on('cancelOrder', async (req) => {
    const { order_no, reason } = req.data;
    if (!order_no) return req.error(400, 'Order number is required');

    await UPDATE(MaintenanceOrders)
      .set({ status: 'CANCELLED', status_state: 'Error' })
      .where({ order_no });

    const currentUser = req.user?.id || 'Current User';
    await INSERT.into(AuditHistory).entries({
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
      user: currentUser,
      object: order_no,
      action: 'CANCEL',
      details: reason || 'Order cancelled by user'
    });

    await INSERT.into(OrderHistory).entries({
      order_no: order_no,
      title: 'Status changed to CANCELLED',
      dateTime: new Date().toISOString().replace('T', ' ').substring(0, 16),
      userName: currentUser,
      text: reason || 'Order cancelled',
      icon: 'sap-icon://cancel'
    });

    return await SELECT.one.from(MaintenanceOrders).where({ order_no });
  });

  this.on('completeOrder', async (req) => {
    const { order_no } = req.data;
    if (!order_no) return req.error(400, 'Order number is required');

    await UPDATE(MaintenanceOrders)
      .set({ status: 'COMPLETED', status_state: 'Success' })
      .where({ order_no });

    const currentUser = req.user?.id || 'Current User';
    await INSERT.into(AuditHistory).entries({
      timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
      user: currentUser,
      object: order_no,
      action: 'COMPLETE',
      details: 'Order marked as completed'
    });

    await INSERT.into(OrderHistory).entries({
      order_no: order_no,
      title: 'Status changed to COMPLETED',
      dateTime: new Date().toISOString().replace('T', ' ').substring(0, 16),
      userName: currentUser,
      text: 'Maintenance work finished',
      icon: 'sap-icon://complete'
    });

    return await SELECT.one.from(MaintenanceOrders).where({ order_no });
  });
});
