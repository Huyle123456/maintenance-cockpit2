namespace sap.cap.maintenance;

using { cuid, managed } from '@sap/cds/common';

entity MaintenanceOrders : managed {
  key order_no                 : String(20);
      equipment_no             : String(20);
      description              : String(255);
      plant                    : String(10);
      maintenance_type         : String(50);
      priority                 : String(20);
      priority_state           : String(20);
      status                   : String(20);
      status_state             : String(20);
      planner                  : String(100);
      scheduled_from           : Date;
      scheduled_to             : Date;
      location                 : String(255);
      work_center              : String(50);
      operation_count          : Integer default 0;
      completed_operation_count: Integer default 0;
      planned_hours            : Decimal(10, 2) default 0.0;
      actual_hours             : Decimal(10, 2) default 0.0;
      estimated_cost           : Decimal(15, 2) default 0.0;
      currency                 : String(5) default 'USD';
      etag                     : String(50);
      equipment                : Association to Equipments on equipment.equipment = equipment_no;
      operations               : Composition of many MaintenanceOperations on operations.order_no = order_no;
      materials                : Composition of many OrderMaterials on materials.order_no = order_no;
      history                  : Composition of many OrderHistory on history.order_no = order_no;
}

entity StagingMaintenanceOrders {
  key order_no                 : String(20);
      equipment_no             : String(20);
      description              : String(255);
      plant                    : String(10);
      maintenance_type         : String(50);
      priority                 : String(20);
      priority_state           : String(20);
      status                   : String(20);
      status_state             : String(20);
      planner                  : String(100);
      scheduled_from           : Date;
      scheduled_to             : Date;
      location                 : String(255);
      work_center              : String(50);
      operation_count          : Integer default 0;
      completed_operation_count: Integer default 0;
      planned_hours            : Decimal(10, 2) default 0.0;
      actual_hours             : Decimal(10, 2) default 0.0;
      estimated_cost           : Decimal(15, 2) default 0.0;
      currency                 : String(5) default 'USD';
      etag                     : String(50);
}

entity Equipments : managed {
  key equipment    : String(20);
      description  : String(255);
      type         : String(50);
      plant        : String(10);
      location     : String(255);
      status       : String(20);
      criticality  : String(20);
      manufacturer : String(100);
      orders       : Association to many MaintenanceOrders on orders.equipment_no = equipment;
}

entity MaintenanceOperations : managed {
  key order_no     : String(20);
  key no           : String(10);
      description  : String(255);
      workCenter   : String(50);
      technician   : String(50);
      plannedHours : Decimal(10, 2) default 0.0;
      actualHours  : Decimal(10, 2) default 0.0;
      status       : String(20);
      order        : Association to MaintenanceOrders on order.order_no = order_no;
}

entity OrderMaterials : managed {
  key order_no       : String(20);
  key material       : String(50);
      description    : String(255);
      qty            : Decimal(10, 2);
      unit           : String(10);
      unitPrice      : Decimal(15, 2);
      value          : Decimal(15, 2);
      order          : Association to MaintenanceOrders on order.order_no = order_no;
}

entity Materials : managed {
  key material       : String(50);
      description    : String(255);
      qty            : Decimal(10, 2);
      unit           : String(10);
      availableStock : Decimal(10, 2);
      value          : Decimal(15, 2);
}

entity MaterialCatalog : managed {
  key ![key]         : String(50);
      description    : String(255);
      unit           : String(10);
      availableStock : Decimal(10, 2);
      unitPrice      : Decimal(15, 2);
}

entity Technicians : managed {
  key ![key]     : String(20);
      text       : String(100);
      employee   : String(20);
      name       : String(100);
      skill      : String(100);
      workCenter : String(50);
      available  : String(10);
}

entity TechnicianCatalog : managed {
  key ![key]     : String(20);
      name       : String(100);
      skill      : String(100);
      workCenter : String(50);
      available  : String(10);
}

entity AuditHistory : cuid, managed {
      timestamp : String(50);
      user      : String(100);
      object    : String(50);
      action    : String(50);
      details   : String(500);
}

entity OrderHistory : cuid, managed {
      order_no  : String(20);
      title     : String(255);
      dateTime  : String(50);
      userName  : String(100);
      text      : String(500);
      icon      : String(100);
}

// Master Data Code Lists
entity Plants {
  key ![key]  : String(20);
      text    : String(100);
}

entity MaintenanceTypes {
  key ![key]  : String(50);
      text    : String(100);
}

entity Priorities {
  key ![key]  : String(20);
      text    : String(100);
}

entity Planners {
  key ![key]  : String(50);
      text    : String(100);
}

entity WorkCenters {
  key ![key]  : String(50);
      text    : String(100);
}

entity Statuses {
  key ![key]  : String(50);
      text    : String(100);
}
