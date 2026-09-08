sap.ui.define([], function () {
  "use strict";

  const DIRECT_SRV_URL = "https://3b342f32trial-dev-zpm-maintenance-cockpit-srv.cfapps.us10-001.hana.ondemand.com";

  function getBaseUrl() {
    // If running directly on local CAP server (port 4004), use relative path
    if (
      typeof window !== "undefined" &&
      window.location &&
      (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") &&
      window.location.port === "4004"
    ) {
      return "";
    }
    // In SAP Build Work Zone, Fiori Launchpad, or HTML5 repo, use DIRECT_SRV_URL directly
    return DIRECT_SRV_URL;
  }

  function getODataUrl() {
    return getBaseUrl() + "/odata/v4/maintenance";
  }

  function getApiUrl() {
    return getBaseUrl() + "/api/maintenance";
  }

  function _getDirectUrl(url) {
    if (!url) return DIRECT_SRV_URL;
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
    const idx = url.indexOf("/odata/v4/maintenance");
    if (idx !== -1) {
      return DIRECT_SRV_URL + url.substring(idx);
    }
    const apiIdx = url.indexOf("/api/maintenance");
    if (apiIdx !== -1) {
      return DIRECT_SRV_URL + url.substring(apiIdx);
    }
    return DIRECT_SRV_URL + (url.startsWith("/") ? url : "/" + url);
  }

  async function _fetchJson(url, options = {}) {
    const defaultHeaders = {
      "Accept": "application/json",
      "Content-Type": "application/json"
    };
    options.headers = Object.assign(defaultHeaders, options.headers || {});
    
    // Resolve target URL directly and ensure proper URI encoding
    let targetUrl = url.startsWith("http://") || url.startsWith("https://") ? url : _getDirectUrl(url);
    targetUrl = encodeURI(targetUrl);

    try {
      const res = await fetch(targetUrl, options);
      if (res.ok) {
        if (res.status === 204) return null;
        return await res.json();
      }
      const errText = await res.text().catch(() => "");
      console.warn(`[CAPService] Response ${res.status} on ${targetUrl}:`, errText);
      return { value: [] };
    } catch (err) {
      console.warn(`[CAPService] Fetch error on ${targetUrl}:`, err);
      return { value: [] };
    }
  }

  return {
    getBaseUrl,
    getODataUrl,
    getApiUrl,
    getDirectUrl: _getDirectUrl,

    /**
     * Get all maintenance orders (optimized for fast table rendering)
     */
    async getMaintenanceOrders() {
      const data = await _fetchJson(`${getODataUrl()}/MaintenanceOrders?$orderby=order_no desc&$top=5000`);
      return data?.value || [];
    },

    /**
     * Get a single maintenance order by ID (with deep expands)
     */
    async getOrderById(orderId) {
      const data = await _fetchJson(`${getODataUrl()}/MaintenanceOrders('${orderId}')?$expand=operations,materials,equipment,history`);
      return data;
    },

    /**
     * Create a new maintenance order
     */
    async createOrder(payload) {
      return await _fetchJson(`${getODataUrl()}/MaintenanceOrders`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },

    /**
     * Update an existing maintenance order
     */
    async updateOrder(orderId, payload) {
      return await _fetchJson(`${getODataUrl()}/MaintenanceOrders('${orderId}')`, {
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
        const result = await _fetchJson(`${getODataUrl()}/$batch`, {
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
      return await _fetchJson(`${getODataUrl()}/cancelOrder`, {
        method: "POST",
        body: JSON.stringify({ order_no: orderNo, reason: reason })
      });
    },

    /**
     * Complete an order action
     */
    async completeOrder(orderNo) {
      return await _fetchJson(`${getODataUrl()}/completeOrder`, {
        method: "POST",
        body: JSON.stringify({ order_no: orderNo })
      });
    },

    /**
     * Get equipment list
     */
    async getEquipments() {
      const data = await _fetchJson(`${getODataUrl()}/Equipments`);
      return data?.value || [];
    },

    /**
     * Get operations for order
     */
    async getOperations(orderNo) {
      const data = await _fetchJson(`${getODataUrl()}/MaintenanceOperations?$filter=order_no eq '${orderNo}'`);
      return data.value || [];
    },

    /**
     * Get materials for order
     */
    async getOrderMaterials(orderNo) {
      const data = await _fetchJson(`${getODataUrl()}/OrderMaterials?$filter=order_no eq '${orderNo}'`);
      return data.value || [];
    },

    /**
     * Get all technicians
     */
    async getTechnicians() {
      const [techs, catalog] = await Promise.all([
        _fetchJson(`${getODataUrl()}/Technicians`),
        _fetchJson(`${getODataUrl()}/TechnicianCatalog`)
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
        _fetchJson(`${getODataUrl()}/Materials`),
        _fetchJson(`${getODataUrl()}/MaterialCatalog`)
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
        _fetchJson(`${getODataUrl()}/Plants`),
        _fetchJson(`${getODataUrl()}/MaintenanceTypes`),
        _fetchJson(`${getODataUrl()}/Priorities`),
        _fetchJson(`${getODataUrl()}/Planners`),
        _fetchJson(`${getODataUrl()}/WorkCenters`),
        _fetchJson(`${getODataUrl()}/Statuses`)
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
      const data = await _fetchJson(`${getODataUrl()}/AuditHistory?$orderby=timestamp desc&$top=500`);
      return data?.value || [];
    },

    /**
     * Add new audit history entry
     */
    async addAuditEntry(entry) {
      return await _fetchJson(`${getODataUrl()}/AuditHistory`, {
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
      const data = await _fetchJson(`${getODataUrl()}/OrderHistory${filter}`);
      return data.value || [];
    },

    /**
     * Get authenticated user profile and roles from CAP/XSUAA service
     */
    async getUserInfo() {
      return await _fetchJson(`${getODataUrl()}/getUserInfo()`);
    },

    /**
     * Upload and import Excel file directly to Backend using ExcelJS streaming
     * @param {File} oFile
     * @returns {Promise<object>} Import summary
     */
    async importOrdersExcel(oFile) {
      const formData = new FormData();
      formData.append("file", oFile, oFile.name);

      let res;
      try {
        res = await fetch(`${getApiUrl()}/import-excel`, {
          method: "POST",
          body: formData
        });
        if (!res.ok && res.status >= 500) {
          const directUrl = _getDirectUrl(`${getApiUrl()}/import-excel`);
          res = await fetch(directUrl, { method: "POST", body: formData });
        }
      } catch (e) {
        const directUrl = _getDirectUrl(`${getApiUrl()}/import-excel`);
        res = await fetch(directUrl, { method: "POST", body: formData });
      }

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(errJson.error || `Import failed with status [${res.status}]`);
      }

      return await res.json();
    }
  };
});