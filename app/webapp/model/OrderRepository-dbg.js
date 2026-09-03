sap.ui.define([], () => {
  "use strict";

  let aOrders = [];

  return {
    setOrders(aData) {
      aOrders = aData || [];
    },

    getOrders() {
      return aOrders;
    },

    getOrderById(sOrderId) {
      return aOrders.find(
        (oOrder) => oOrder.order === sOrderId || oOrder.order_no === sOrderId,
      );
    },

    addOrder(oOrder) {
      aOrders.unshift(oOrder);
    },
  };
});
