sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "com/fsoft/zpmmaintenancecockpit/model/formatter",
    "com/fsoft/zpmmaintenancecockpit/model/CAPService",
  ],
  (Controller, JSONModel, MessageToast, formatter, CAPService) => {
    "use strict";

    return Controller.extend(
      "com.fsoft.zpmmaintenancecockpit.controller.Equipment",
      {
        formatter: formatter,

        /**
         * Loads equipment data from CAP service and initializes UI state.
         *
         * @returns {void}
         */
        onInit() {
          this.getView().setModel(
            new JSONModel({
              detailVisible: false,
              layout: "OneColumn",
            }),
            "ui",
          );

          this._initControllerAsync();
        },

        /**
         * Handles table row selection to display equipment details
         * in the side panel.
         *
         * @param {sap.ui.base.Event} oEvent Row press event
         * @returns {void}
         */
        onRowPress(oEvent) {
          const oItem = oEvent.getParameter("listItem") || oEvent.getSource();
          if (!oItem) {
            return;
          }

          const oContext = oItem.getBindingContext("equipment");
          if (!oContext) {
            return;
          }

          const oEquipment = oContext.getObject();

          this.getView()
            .getModel("equipment")
            .setProperty("/selected", oEquipment);

          this.getView().setModel(
            new JSONModel({
              header: `${oEquipment.equipment} - ${oEquipment.description}`,
              equipment: oEquipment.equipment,
              description: oEquipment.description,
              type: oEquipment.type,
              plant: oEquipment.plant,
              location: oEquipment.location,
              status: oEquipment.status,
              statusState: this.formatter.formatStatusState(oEquipment.status),
              criticality: oEquipment.criticality,
              manufacturer: oEquipment.manufacturer,
              recentOrders: (oEquipment.recentOrders || []).map((o) => ({
                ...o,
                statusState: this.formatter.formatStatusState(o.status),
              })),
            }),
            "equipmentDetail",
          );

          this.getView().getModel("ui").setProperty("/detailVisible", true);
          this.getView()
            .getModel("ui")
            .setProperty("/layout", "TwoColumnsMidExpanded");
        },

        /**
         * Closes the side panel and restores single-column layout.
         *
         * @returns {void}
         */
        onCloseEquipmentPanel() {
          this.getView().getModel("ui").setProperty("/layout", "OneColumn");
        },

        /**
         * Handler for adding new equipment.
         *
         * @returns {void}
         */
        onAddEquipment() {
          MessageToast.show(
            this.getView()
              .getModel("i18n")
              .getResourceBundle()
              .getText("equipmentAddNotImplemented"),
          );
        },

        /**
         * Loads and normalizes equipment data for the equipment model.
         *
         * @returns {Promise<void>} Resolves after the equipment model is populated.
         */
        async _initControllerAsync() {
          try {
            const aEquipment = await CAPService.getEquipments();
            // Process recent orders for each equipment if present
            aEquipment.forEach((eq) => {
              if (eq.orders && Array.isArray(eq.orders)) {
                eq.recentOrders = eq.orders.map((o) => ({
                  order: o.order_no,
                  description: o.description,
                  status: o.status,
                }));
              } else if (!eq.recentOrders) {
                eq.recentOrders = [];
              }
            });

            this.getView().setModel(
              new JSONModel({
                equipment: aEquipment,
                selected: null,
              }),
              "equipment",
            );
          } catch (err) {
            console.error("Failed to load equipment from CAP:", err);
            this.getView().setModel(
              new JSONModel({
                equipment: [],
                selected: null,
              }),
              "equipment",
            );
          }
        },
      },
    );
  },
);
