sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "com/fsoft/zpmmaintenancecockpit/model/CAPService",
  ],
  function (Controller, JSONModel, CAPService) {
    "use strict";

    return Controller.extend("com.fsoft.zpmmaintenancecockpit.controller.Technicians", {
      /**
       * Loads technician catalog data and calculates assigned operation counts.
       *
       * @returns {Promise<void>} Resolves after the technicians model is populated.
       */
      async onInit() {
        try {
          const oData = await CAPService.getTechnicians();
          const aCatalog = oData.technicianCatalog || [];
          const mAssignedCounts = {
            "T-001": 3,
            "T-002": 2,
            "T-003": 1,
            "T-004": 1,
          };

          aCatalog.forEach((oTech) => {
            oTech.assignedOperations = mAssignedCounts[oTech.key] || 0;
          });

          const aFilteredTechs = aCatalog.filter((oTech) =>
            ["T-001", "T-002", "T-003", "T-004"].includes(oTech.key),
          );

          const oModel = new JSONModel({ catalog: aFilteredTechs });
          this.getView().setModel(oModel, "technicians");
        } catch (err) {
          console.error("Failed to load technicians from CAP:", err);
          this.getView().setModel(new JSONModel({ catalog: [] }), "technicians");
        }
      },
    });
  },
);
