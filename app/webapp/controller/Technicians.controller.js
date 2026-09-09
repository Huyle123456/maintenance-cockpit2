sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "com/fsoft/zpmmaintenancecockpit/model/CAPService",
  ],
  function (Controller, JSONModel, CAPService) {
    "use strict";
    return Controller.extend(
      "com.fsoft.zpmmaintenancecockpit.controller.Technicians",
      {
        /**
         * Loads technician catalog data and calculates assigned operation counts.
         *
         * @returns {Promise<void>} Resolves after the technicians model is populated.
         */
        onInit: async function () {
          try {
            const technicianData = await CAPService.getTechnicians();
            const technicianCatalog = technicianData.technicianCatalog || [];
            const assignedOperationCounts = {
              "T-001": 3,
              "T-002": 2,
              "T-003": 1,
              "T-004": 1,
            };
            technicianCatalog.forEach((technician) => {
              technician.assignedOperations =
                assignedOperationCounts[technician.key] || 0;
            });
            const activeTechnicians = technicianCatalog.filter((technician) =>
              ["T-001", "T-002", "T-003", "T-004"].includes(technician.key),
            );
            const techniciansModel = new JSONModel({
              catalog: activeTechnicians,
            });
            this.getView().setModel(techniciansModel, "technicians");
          } catch (error) {
            console.error("Failed to load technicians from CAP:", error);
            this.getView().setModel(
              new JSONModel({ catalog: [] }),
              "technicians",
            );
          }
        },
      },
    );
  },
);
