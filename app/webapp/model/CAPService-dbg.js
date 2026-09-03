sap.ui.define([], function () {
  "use strict";

  const BASE_URL = "/odata/v4/maintenance";

  async function _fetchJson(url, options = {}) {
    const defaultHeaders = {
      "Accept": "application/json",
      "Content-Type": "application/json"
    };
    options.headers = Object.assign(defaultHeaders, options.headers || {});
    const res = await fetch(url, options);
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`CAP Service error [${res.status}]: ${errText}`);
    }
    if (res.status === 204) return null;
    return await res.json();
  }

  return {
    /**
     * Get all maintenance orders with operations
     */
    async getMaintenanceOrders() {
      const data = await _fetchJson(`${BASE_URL}/MaintenanceOrders?$expand=operations,equipment&$orderby=order_no desc`);
      return data.value || [];
    },

    /**
     * Get a single maintenance order by ID
     */
    async getOrderById(orderId) {
      const data = await _fetchJson(`${BASE_URL}/MaintenanceOrders('${orderId}')?$expand=operations,equipment,history`);
      return data;
    },

    /**
     * Create a new maintenance order
     */
    async createOrder(payload) {
      return await _fetchJson(`${BASE_URL}/MaintenanceOrders`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },

    /**
     * Update an existing maintenance order
     */
    async updateOrder(orderId, payload) {
      return await _fetchJson(`${BASE_URL}/MaintenanceOrders('${orderId}')`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
    },

    /**
     * Mass update multiple orders via OData V4 $batch request
     */
    async massUpdateOrders(aOrderKeys, oChanges) {
      if (!aOrderKeys || aOrderKeys.length === 0) return [];
      
      const batchPayload = {
        requests: aOrderKeys.map((key, index) => ({
          id: `req${index + 1}`,
          method: "PATCH",
          url: `MaintenanceOrders('${key}')`,
          headers: {
            "content-type": "application/json"
          },
          body: oChanges
        }))
      };

      try {
        const result = await _fetchJson(`${BASE_URL}/$batch`, {
          method: "POST",
          body: JSON.stringify(batchPayload)
        });
        return result?.responses || [];
      } catch (err) {
        // Fallback: parallel PATCH requests
        return await Promise.all(
          aOrderKeys.map(key => this.updateOrder(key, oChanges))
        );
      }
    },

    /**
     * Cancel an order action
     */
    async cancelOrder(orderNo, reason) {
      return await _fetchJson(`${BASE_URL}/cancelOrder`, {
        method: "POST",
        body: JSON.stringify({ order_no: orderNo, reason: reason })
      });
    },

    /**
     * Complete an order action
     */
    async completeOrder(orderNo) {
      return await _fetchJson(`${BASE_URL}/completeOrder`, {
        method: "POST",
        body: JSON.stringify({ order_no: orderNo })
      });
    },

    /**
     * Get equipment list
     */
    async getEquipments() {
      const data = await _fetchJson(`${BASE_URL}/Equipments?$expand=orders`);
      return data.value || [];
    },

    /**
     * Get operations for order
     */
    async getOperations(orderNo) {
      const data = await _fetchJson(`${BASE_URL}/MaintenanceOperations?$filter=order_no eq '${orderNo}'`);
      return data.value || [];
    },

    /**
     * Get all technicians
     */
    async getTechnicians() {
      const [techs, catalog] = await Promise.all([
        _fetchJson(`${BASE_URL}/Technicians`),
        _fetchJson(`${BASE_URL}/TechnicianCatalog`)
      ]);
      return {
        technicians: techs.value || [],
        technicianCatalog: catalog.value || []
      };
    },

    /**
     * Get all materials & catalog
     */
    async getMaterials() {
      const [mats, catalog] = await Promise.all([
        _fetchJson(`${BASE_URL}/Materials`),
        _fetchJson(`${BASE_URL}/MaterialCatalog`)
      ]);
      return {
        materials: mats.value || [],
        materialCatalog: catalog.value || []
      };
    },

    /**
     * Get master data (plants, maintenance types, priorities, planners, work centers, statuses)
     */
    async getMasterData() {
      const [plants, types, priorities, planners, workCenters, statuses] = await Promise.all([
        _fetchJson(`${BASE_URL}/Plants`),
        _fetchJson(`${BASE_URL}/MaintenanceTypes`),
        _fetchJson(`${BASE_URL}/Priorities`),
        _fetchJson(`${BASE_URL}/Planners`),
        _fetchJson(`${BASE_URL}/WorkCenters`),
        _fetchJson(`${BASE_URL}/Statuses`)
      ]);

      return {
        plants: plants.value || [],
        maintenance_types: types.value || [],
        priorities: priorities.value || [],
        planners: planners.value || [],
        work_centers: workCenters.value || [],
        statuses: statuses.value || []
      };
    },

    /**
     * Get audit history entries
     */
    async getAuditHistory() {
      const data = await _fetchJson(`${BASE_URL}/AuditHistory?$orderby=timestamp desc`);
      return data.value || [];
    },

    /**
     * Add new audit history entry
     */
    async addAuditEntry(entry) {
      return await _fetchJson(`${BASE_URL}/AuditHistory`, {
        method: "POST",
        body: JSON.stringify(entry)
      });
    },

    /**
     * Get history for order
     */
    async getOrderHistory(orderNo) {
      let filter = "";
      if (orderNo) {
        filter = `?$filter=order_no eq '${orderNo}'&$orderby=dateTime desc`;
      } else {
        filter = `?$orderby=dateTime desc`;
      }
      const data = await _fetchJson(`${BASE_URL}/OrderHistory${filter}`);
      return data.value || [];
    },

    /**
     * Get authenticated user profile and roles from CAP/XSUAA service
     */
    async getUserInfo() {
      return await _fetchJson(`${BASE_URL}/getUserInfo()`);
    }
  };
});
