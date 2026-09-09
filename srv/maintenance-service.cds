using { sap.cap.maintenance as my } from '../db/schema';

service MaintenanceService @(path: '/odata/v4/maintenance') {

  // Entity projections with open read and admin/any write permissions
  entity MaintenanceOrders @(
    restrict: [
      { grant: 'READ', to: ['User', 'Admin', 'any'] },
      { grant: ['CREATE', 'UPDATE', 'DELETE'], to: ['Admin', 'any'] }
    ]
  ) as projection on my.MaintenanceOrders;

  entity Equipments @(
    restrict: [
      { grant: 'READ', to: ['User', 'Admin', 'any'] },
      { grant: ['CREATE', 'UPDATE', 'DELETE'], to: ['Admin', 'any'] }
    ]
  ) as projection on my.Equipments;

  entity MaintenanceOperations @(
    restrict: [
      { grant: 'READ', to: ['User', 'Admin', 'any'] },
      { grant: ['CREATE', 'UPDATE', 'DELETE'], to: ['Admin', 'any'] }
    ]
  ) as projection on my.MaintenanceOperations;

  entity OrderMaterials @(
    restrict: [
      { grant: 'READ', to: ['User', 'Admin', 'any'] },
      { grant: ['CREATE', 'UPDATE', 'DELETE'], to: ['Admin', 'any'] }
    ]
  ) as projection on my.OrderMaterials;

  entity Materials @(
    restrict: [
      { grant: 'READ', to: ['User', 'Admin', 'any'] },
      { grant: ['CREATE', 'UPDATE', 'DELETE'], to: ['Admin', 'any'] }
    ]
  ) as projection on my.Materials;

  entity MaterialCatalog @(
    restrict: [
      { grant: 'READ', to: ['User', 'Admin', 'any'] }
    ]
  ) as projection on my.MaterialCatalog;

  entity Technicians @(
    restrict: [
      { grant: 'READ', to: ['User', 'Admin', 'any'] },
      { grant: ['CREATE', 'UPDATE', 'DELETE'], to: ['Admin', 'any'] }
    ]
  ) as projection on my.Technicians;

  entity TechnicianCatalog @(
    restrict: [
      { grant: 'READ', to: ['User', 'Admin', 'any'] }
    ]
  ) as projection on my.TechnicianCatalog;

  entity AuditHistory @(
    restrict: [
      { grant: 'READ', to: ['User', 'Admin', 'any'] },
      { grant: 'CREATE', to: ['User', 'Admin', 'any'] }
    ]
  ) as projection on my.AuditHistory;

  entity OrderHistory @(
    restrict: [
      { grant: 'READ', to: ['User', 'Admin', 'any'] },
      { grant: 'CREATE', to: ['User', 'Admin', 'any'] }
    ]
  ) as projection on my.OrderHistory;

  // Master Data (Read-only)
  entity Plants @(restrict: [{ grant: 'READ', to: ['User', 'Admin', 'any'] }]) as projection on my.Plants;
  entity MaintenanceTypes @(restrict: [{ grant: 'READ', to: ['User', 'Admin', 'any'] }]) as projection on my.MaintenanceTypes;
  entity Priorities @(restrict: [{ grant: 'READ', to: ['User', 'Admin', 'any'] }]) as projection on my.Priorities;
  entity Planners @(restrict: [{ grant: 'READ', to: ['User', 'Admin', 'any'] }]) as projection on my.Planners;
  entity WorkCenters @(restrict: [{ grant: 'READ', to: ['User', 'Admin', 'any'] }]) as projection on my.WorkCenters;
  entity Statuses @(restrict: [{ grant: 'READ', to: ['User', 'Admin', 'any'] }]) as projection on my.Statuses;

  // Actions
  action cancelOrder(order_no: String, reason: String) returns MaintenanceOrders;
  action completeOrder(order_no: String) returns MaintenanceOrders;

  // Function to return current authenticated user profile
  type CurrentUserProfile {
    id: String;
    name: String;
    email: String;
    roles: array of String;
    isAdmin: Boolean;
    isUser: Boolean;
  };

  function getUserInfo() returns CurrentUserProfile;

  // KPI Metrics direct database aggregation summary
  type KpiSummary {
    openCount: Integer;
    inProcessCount: Integer;
    criticalCount: Integer;
    overdueCount: Integer;
    totalOrders: Integer;
    rawEstimatedCost: Decimal(15, 2);
    estimatedCost: String;
  };

  function getKpiMetrics() returns KpiSummary;
}
