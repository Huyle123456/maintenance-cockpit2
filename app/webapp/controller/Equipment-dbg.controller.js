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
        async onInit() {
          this.getView().setModel(
            new JSONModel({
              detailVisible: false,
              layout: "OneColumn",
            }),
            "ui",
          );

          try {
            const aEquipment = await CAPService.getEquipments();
            // Process recent orders for each equipment if present
            aEquipment.forEach(eq => {
              if (eq.orders && Array.isArray(eq.orders)) {
                eq.recentOrders = eq.orders.map(o => ({
                  order: o.order_no,
                  description: o.description,
                  status: o.status
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

        /**
         * Displays details for the equipment represented by the selected list item.
         *
         * @param {sap.ui.base.Event} oEvent List selection or press event.
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

          const oSelected = oContext.getObject();
          this.getView()
            .getModel("equipment")
            .setProperty("/selected", oSelected);

          this.getView().setModel(
            new JSONModel({
              header: `${oSelected.equipment} - ${oSelected.description}`,
              equipment: oSelected.equipment,
              description: oSelected.description,
              type: oSelected.type,
              plant: oSelected.plant,
              location: oSelected.location,
              status: oSelected.status,
              statusState: this.formatter.formatStatusState(oSelected.status),
              criticality: oSelected.criticality,
              manufacturer: oSelected.manufacturer,
              recentOrders: (oSelected.recentOrders || []).map((oOrder) => ({
                ...oOrder,
                statusState: this.formatter.formatStatusState(oOrder.status),
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
         * Closes the equipment detail panel and restores the single-column layout.
         *
         * @returns {void}
         */
        onCloseEquipmentPanel() {
          this.getView().getModel("ui").setProperty("/layout", "OneColumn");
        },

        /**
         * Shows the placeholder notification for the future add-equipment action.
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
      },
    );
  },
);
