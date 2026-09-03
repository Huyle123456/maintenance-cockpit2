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
         * Loads technician data from CAP backend, enriches it with assigned-operation counts, and binds it to the view.
         *
         * @returns {void}
         */
        onInit: async function () {
          try {
            const data = await CAPService.getTechnicians();
            const aCatalog = data.technicianCatalog || [];

            // Assigned operations count
            const mAssignedOperations = {
              "T-001": 3,
              "T-002": 2,
              "T-003": 1,
              "T-004": 1,
            };

            aCatalog.forEach((oTech) => {
              oTech.assignedOperations = mAssignedOperations[oTech.key] || 0;
            });

            // Filter T-001 to T-004
            const aFilteredCatalog = aCatalog.filter((oTech) =>
              ["T-001", "T-002", "T-003", "T-004"].includes(oTech.key),
            );

            const oTechniciansModel = new JSONModel({
              catalog: aFilteredCatalog,
            });

            this.getView().setModel(oTechniciansModel, "technicians");
          } catch (err) {
            console.error("Failed to load technicians from CAP:", err);
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
