sap.ui.define([], () => {
  "use strict";

  let _aOrders = [];

  return {
    /**
     * Sets the local orders array.
     *
     * @param {Array} aOrders List of order objects
     */
    setOrders(aOrders) {
      _aOrders = aOrders || [];
    },

    /**
     * Returns the local orders array.
     *
     * @returns {Array} List of order objects
     */
    getOrders() {
      return _aOrders;
    },

    /**
     * Finds a single order by its ID or number.
     *
     * @param {string} sOrderId Order number/ID
     * @returns {object|undefined} Found order or undefined
     */
    getOrderById(sOrderId) {
      return _aOrders.find(
        (oOrder) => oOrder.order === sOrderId || oOrder.order_no === sOrderId,
      );
    },

    /**
     * Prepends a newly created order to the orders cache.
     *
     * @param {object} oOrder Order object
     */
    addOrder(oOrder) {
      _aOrders.unshift(oOrder);
    },
  };
});