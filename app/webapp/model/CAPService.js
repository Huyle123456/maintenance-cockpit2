sap.ui.define([], function () {
  "use strict";

  const DIRECT_SRV_URL = "https://3b342f32trial-dev-zpm-maintenance-cockpit-srv.cfapps.us10-001.hana.ondemand.com";

  /**
   * Resolves the base URL for backend service requests.
   * Uses relative root path if running on local CAP development server (port 4004),
   * otherwise points directly to the deployed Cloud Foundry service URL.
   *
   * @returns {string} Base URL for backend communications.
   */
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

  /**
   * Returns the base URL for OData V4 maintenance service endpoints.
   *
   * @returns {string} OData V4 service root URL.
   */
  function getODataUrl() {
    return getBaseUrl() + "/odata/v4/maintenance";
  }

  /**
   * Returns the base URL for custom REST maintenance endpoints.
   *
   * @returns {string} REST API root URL.
   */
  function getApiUrl() {
    return getBaseUrl() + "/api/maintenance";
  }

  /**
   * Resolves a relative or absolute URL into a direct absolute URL pointing to the Cloud Foundry backend service.
   * Essential for cross-origin requests when running inside SAP Build Work Zone / Fiori Launchpad iframe.
   *
   * @param {string} url - Input path or URL.
   * @returns {string} Fully qualified direct backend URL.
   */
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

  /**
   * Performs an asynchronous HTTP request returning parsed JSON.
   * Handles direct URL resolution, URI encoding, status 204 No Content, and fallback error handling.
   *
   * @param {string} url - Target endpoint URL or path.
   * @param {RequestInit} [options={}] - Fetch configuration options (headers, method, body, etc.).
   * @returns {Promise<any>} Parsed JSON response payload or fallback object.
   */
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
     * Retrieves all maintenance orders with sorting and limit.
     *
     * @returns {Promise<Array<object>>} List of maintenance order entities.
     */
    async getMaintenanceOrders() {
      const data = await _fetchJson(`${getODataUrl()}/MaintenanceOrders?$orderby=order_no desc&$top=5000`);
      return data?.value || [];
    },

    /**
     * Retrieves a single maintenance order by its order number with deep expansion of relations.
     *
     * @param {string} orderId - Maintenance order number (e.g., 'MO-1001').
     * @returns {Promise<object|null>} Complete order details including operations, materials, equipment, and history.
     */
    async getOrderById(orderId) {
      const data = await _fetchJson(`${getODataUrl()}/MaintenanceOrders('${orderId}')?$expand=operations,materials,equipment,history`);
      return data;
    },

    /**
     * Creates a new maintenance order entity.
     *
     * @param {object} payload - New maintenance order data.
     * @returns {Promise<object>} Created order entity response from backend.
     */
    async createOrder(payload) {
      return await _fetchJson(`${getODataUrl()}/MaintenanceOrders`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
    },

    /**
     * Updates an existing maintenance order entity.
     *
     * @param {string} orderId - Maintenance order number to update.
     * @param {object} payload - Partial or complete maintenance order fields to update.
     * @returns {Promise<object>} Updated order entity response.
     */
    async updateOrder(orderId, payload) {
      return await _fetchJson(`${getODataUrl()}/MaintenanceOrders('${orderId}')`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
    },

    /**
     * Mass updates multiple maintenance orders via OData V4 $batch request, with parallel PATCH fallback.
     *
     * @param {string[]} aOrderKeys - Array of order keys / order numbers to update.
     * @param {object} oChanges - Changed field values to apply across all specified orders.
     * @returns {Promise<Array<object>>} Array of responses for each updated order.
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
     * Executes the cancel order action on the backend.
     *
     * @param {string} orderNo - Maintenance order number to cancel.
     * @param {string} [reason] - Optional cancellation reason.
     * @returns {Promise<object>} Action result.
     */
    async cancelOrder(orderNo, reason) {
      return await _fetchJson(`${getODataUrl()}/cancelOrder`, {
        method: "POST",
        body: JSON.stringify({ order_no: orderNo, reason: reason })
      });
    },

    /**
     * Executes the complete order action on the backend.
     *
     * @param {string} orderNo - Maintenance order number to mark as completed.
     * @returns {Promise<object>} Action result.
     */
    async completeOrder(orderNo) {
      return await _fetchJson(`${getODataUrl()}/completeOrder`, {
        method: "POST",
        body: JSON.stringify({ order_no: orderNo })
      });
    },

    /**
     * Retrieves the master list of equipments.
     *
     * @returns {Promise<Array<object>>} List of equipment records.
     */
    async getEquipments() {
      const data = await _fetchJson(`${getODataUrl()}/Equipments`);
      return data?.value || [];
    },

    /**
     * Retrieves maintenance operations associated with a specific order.
     *
     * @param {string} orderNo - Maintenance order number.
     * @returns {Promise<Array<object>>} List of operations for the order.
     */
    async getOperations(orderNo) {
      const data = await _fetchJson(`${getODataUrl()}/MaintenanceOperations?$filter=order_no eq '${orderNo}'`);
      return data.value || [];
    },

    /**
     * Retrieves material line items associated with a specific order.
     *
     * @param {string} orderNo - Maintenance order number.
     * @returns {Promise<Array<object>>} List of order materials.
     */
    async getOrderMaterials(orderNo) {
      const data = await _fetchJson(`${getODataUrl()}/OrderMaterials?$filter=order_no eq '${orderNo}'`);
      return data.value || [];
    },

    /**
     * Retrieves all assigned technicians along with the technician master catalog.
     *
     * @returns {Promise<{technicians: Array<object>, technicianCatalog: Array<object>}>} Technician lists.
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
     * Retrieves all assigned materials along with the full material master catalog.
     *
     * @returns {Promise<{materials: Array<object>, materialCatalog: Array<object>}>} Material lists.
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
     * Retrieves application master data (plants, maintenance types, priorities, planners, work centers, statuses) in parallel.
     *
     * @returns {Promise<{plants: Array<object>, maintenance_types: Array<object>, priorities: Array<object>, planners: Array<object>, work_centers: Array<object>, statuses: Array<object>}>} Master data collections.
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
     * Retrieves the audit trail log entries sorted newest first.
     *
     * @returns {Promise<Array<object>>} Recent audit history log entries.
     */
    async getAuditHistory() {
      const data = await _fetchJson(`${getODataUrl()}/AuditHistory?$orderby=timestamp desc&$top=500`);
      return data?.value || [];
    },

    /**
     * Creates a new audit history entry record.
     *
     * @param {object} entry - Audit log entry details (action, details, order_no, user, timestamp).
     * @returns {Promise<object>} Created audit entry result.
     */
    async addAuditEntry(entry) {
      return await _fetchJson(`${getODataUrl()}/AuditHistory`, {
        method: "POST",
        body: JSON.stringify(entry)
      });
    },

    /**
     * Retrieves historical lifecycle change events for a given order or for all orders.
     *
     * @param {string} [orderNo] - Optional order number filter.
     * @returns {Promise<Array<object>>} List of order history logs.
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
     * Retrieves the current authenticated user profile, roles, and privileges from the backend security context.
     *
     * @returns {Promise<{id: string, name: string, email: string, roles: string[], isAdmin: boolean, isUser: boolean}>} User profile information.
     */
    async getUserInfo() {
      return await _fetchJson(`${getODataUrl()}/getUserInfo()`);
    },

    /**
     * Directly queries backend database to fetch aggregated real-time KPI metrics for all maintenance orders.
     * Supports OData V4 function call with automatic fallback to REST API.
     *
     * @returns {Promise<{openCount: number, inProcessCount: number, criticalCount: number, overdueCount: number, totalOrders: number, rawEstimatedCost: number, estimatedCost: string}|null>} Real-time KPI summary.
     */
    async getKpiMetrics() {
      try {
        const data = await _fetchJson(`${getODataUrl()}/getKpiMetrics()`);
        if (data && typeof data.openCount === "number") {
          return data;
        }
        // Fallback to REST endpoint
        const restData = await _fetchJson(`${getApiUrl()}/kpi-metrics`);
        return restData || null;
      } catch (e) {
        try {
          const restData = await _fetchJson(`${getApiUrl()}/kpi-metrics`);
          return restData || null;
        } catch (err2) {
          console.warn("[CAPService] Error fetching KPI metrics from DB:", err2);
          return null;
        }
      }
    },

    /**
     * Uploads and imports an Excel file directly to the backend using streaming multipart form data.
     *
     * @param {File} oFile - Excel spreadsheet file (.xlsx / .xls).
     * @returns {Promise<object>} Import result summary containing processed order statistics.
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