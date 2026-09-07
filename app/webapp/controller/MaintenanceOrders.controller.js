sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/core/Fragment",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "com/fsoft/zpmmaintenancecockpit/model/formatter",
    "com/fsoft/zpmmaintenancecockpit/controller/CreateMaintenanceOrderDialog",
    "com/fsoft/zpmmaintenancecockpit/model/OrderRepository",
    "com/fsoft/zpmmaintenancecockpit/model/constants",
    "com/fsoft/zpmmaintenancecockpit/model/CAPService",
    "com/fsoft/zpmmaintenancecockpit/model/AuditHistoryService",
    "com/fsoft/zpmmaintenancecockpit/model/AuthService",
  ],
  (
    Controller,
    JSONModel,
    Filter,
    FilterOperator,
    Fragment,
    MessageBox,
    MessageToast,
    formatter,
    CreateMaintenanceOrderDialog,
    OrderRepository,
    constants,
    CAPService,
    AuditHistoryService,
    AuthService,
  ) => {
    "use strict";

    return Controller.extend(
      "com.fsoft.zpmmaintenancecockpit.controller.MaintenanceOrders",
      {
        formatter: formatter,

        /**
         * Initializes the Maintenance Orders page with CAP backend data.
         *
         * @returns {void}
         */
        onInit() {
          // Step 1: Create page UI model
          this.getView().setModel(
            new JSONModel({
              layout: "OneColumn",
            }),
            "ui",
          );

          this._initControllerAsync();
        },

        /**
         * Loads page data and initializes dependent view models.
         *
         * @returns {Promise<void>} Resolves after controller data is initialized.
         */
        async _initControllerAsync() {
          try {
            // Step 2: Load equipment master data from CAP
            const aEquipment = await CAPService.getEquipments();
            this.getView().setModel(
              new JSONModel({
                equipment: aEquipment || [],
              }),
              "equipmentData",
            );

            // Step 3: Load maintenance orders from CAP
            const aRawOrders = await CAPService.getMaintenanceOrders();

            // Default navigation items
            const aNavItems = [
              { text: "Orders", icon: "sap-icon://wrench", selected: true },
              {
                text: "Operations",
                icon: "sap-icon://action-settings",
                selected: false,
              },
              {
                text: "Equipment",
                icon: "sap-icon://machine",
                selected: false,
              },
              {
                text: "Technicians",
                icon: "sap-icon://group",
                selected: false,
              },
            ];

            // Transform maintenance order records
            const aOrderRows = (aRawOrders || []).map((oOrderItem) => ({
              order: oOrderItem.order_no,
              equipment: oOrderItem.equipment_no,
              description: oOrderItem.description,
              plant: oOrderItem.plant,
              type: oOrderItem.maintenance_type,
              priority: oOrderItem.priority,
              priorityState: oOrderItem.priority_state,
              statusLabel: oOrderItem.status,
              statusKey: formatter.normalizeStatus(oOrderItem.status),
              statusState: formatter.formatStatusState(oOrderItem.status),
              planner: oOrderItem.planner,
              scheduledFrom: oOrderItem.scheduled_from,
              scheduledTo: oOrderItem.scheduled_to,
              scheduled: `${oOrderItem.scheduled_from} -> ${oOrderItem.scheduled_to}`,
              isCritical:
                formatter.normalizePriority(oOrderItem.priority) ===
                constants.PRIORITY.CRITICAL,
              isOverdue: formatter.isOverdue(
                oOrderItem.scheduled_to,
                oOrderItem.status,
              ),
              etag: oOrderItem.etag,
            }));

            OrderRepository.setOrders(aOrderRows);

            // Register Navigation model
            this.getView().setModel(
              new JSONModel({
                items: aNavItems,
              }),
              "navModel",
            );

            // Register Orders model
            this.getView().setModel(
              new JSONModel({
                rows: aOrderRows,
              }),
              "orders",
            );

            // Create KPI dashboard model
            this.getView().setModel(
              new JSONModel({
                openCount: this._countOrdersByStatus(
                  aOrderRows,
                  constants.STATUS.OPEN,
                ),
                inProcessCount: this._countOrdersByStatus(
                  aOrderRows,
                  constants.STATUS.IN_PROCESS_DISPLAY,
                ),
                criticalCount: this._countOrdersByFlag(
                  aOrderRows,
                  "isCritical",
                ),
                overdueCount: this._countOrdersByFlag(aOrderRows, "isOverdue"),
                estimatedCost: formatter.calculateEstimatedCost(aOrderRows),
                activeFilterKey: "",
                visibleOrderCount: aOrderRows.length,
              }),
              "kpi",
            );

            // Initialize Mass Change model
            this._initMassChangeModel();

            // Build dropdown values for FilterBar
            this._initFilterData(aOrderRows);

            // Initialize Adapt Filters settings
            this._initFilterConfigModel();
          } catch (err) {
            console.error(
              "Failed to initialize MaintenanceOrders from CAP:",
              err,
            );
            this.getView().setModel(new JSONModel({ rows: [] }), "orders");
          }
        },

        // =========================
        // Public: KPI card actions
        // =========================

        /**
         * Applies the Open KPI filter.
         *
         * Updates the Status filter dropdown and displays
         * only maintenance orders with OPEN status.
         *
         * @returns {void}
         */
        onOpenCardPress() {
          this.byId("selStatus").setSelectedKey(constants.STATUS.OPEN);

          this._applyKpiFilter(
            "STATUS_OPEN",
            new Filter("statusKey", FilterOperator.EQ, constants.STATUS.OPEN),
          );
        },

        /**
         * Applies the In Process KPI filter.
         *
         * Updates the Status filter dropdown and displays
         * only maintenance orders currently in process.
         *
         * @returns {void}
         */
        onInProcessCardPress() {
          this.byId("selStatus").setSelectedKey(constants.STATUS.IN_PROCESS);

          this._applyKpiFilter(
            "STATUS_IN_PROCESS",
            new Filter(
              "statusKey",
              FilterOperator.EQ,
              constants.STATUS.IN_PROCESS_DISPLAY,
            ),
          );
        },

        /**
         * Applies the Critical KPI filter.
         *
         * Updates the Priority filter dropdown and displays
         * only maintenance orders with CRITICAL priority.
         *
         * @returns {void}
         */
        onCriticalCardPress() {
          this.byId("selPriority").setSelectedKey(constants.PRIORITY.CRITICAL);

          this._applyKpiFilter(
            "PRIORITY_CRITICAL",
            new Filter("isCritical", FilterOperator.EQ, true),
          );
        },

        /**
         * Applies the Overdue KPI filter.
         *
         * Displays only maintenance orders that are
         * identified as overdue.
         *
         * @returns {void}
         */
        onOverdueCardPress() {
          this._applyKpiFilter(
            "OVERDUE",
            new Filter("isOverdue", FilterOperator.EQ, true),
          );
        },

        /**
         * Opens the Create Maintenance Order dialog.
         *
         * Loads the dialog lazily if it has not been
         * initialized yet.
         *
         * @returns {void}
         */
        onCreateOrderPress() {
          this._openCreateOrderDialog();
        },

        // ===========================
        // Public: Filter bar actions
        // ===========================

        /**
         * Applies all filter bar conditions to the
         * Maintenance Orders table.
         *
         * Supported Filters:
         * - Search
         * - Equipment
         * - Plant
         * - Status
         * - Priority
         * - Maintenance Type
         * - Planner
         * - Scheduled Date
         *
         * Processing Flow:
         * 1. Read all filter values from the FilterBar.
         * 2. Build SAPUI5 filter objects.
         * 3. Apply filters to the table binding.
         * 4. Update the visible order counter.
         *
         * @returns {void}
         */
        onFilterGo() {
          const aFilters = [];

          // Step 1: Read filter values from the FilterBar
          const sSearch = this.byId("inpSearch").getValue();

          const aSelectedEquipments =
            this.getView()
              .getModel("filters")
              .getProperty("/selectedEquipments") || [];

          const sPlant = this.byId("selPlant").getSelectedKey();

          const sStatus = this.byId("selStatus").getSelectedKey();

          const sPriority = this.byId("selPriority").getSelectedKey();

          const sType = this.byId("selMaintenanceType").getSelectedKey();

          const sPlanner = this.byId("selPlanner").getSelectedKey();

          const oDate = this.byId("dpScheduledDateFrom").getDateValue();

          // Step 2: Build filter collection

          // Filter by equipment
          if (aSelectedEquipments.length > 0) {
            const aEquipmentFilters = aSelectedEquipments.map(
              (sEq) => new Filter("equipment", FilterOperator.EQ, sEq),
            );

            aFilters.push(
              new Filter({
                filters: aEquipmentFilters,
                and: false,
              }),
            );
          }

          // Filter by plant
          if (sPlant !== "All") {
            aFilters.push(new Filter("plant", FilterOperator.EQ, sPlant));
          }

          // Filter by status
          if (sStatus !== "All") {
            aFilters.push(
              new Filter("statusLabel", FilterOperator.EQ, sStatus),
            );
          }

          // Filter by priority
          if (sPriority !== "All") {
            aFilters.push(new Filter("priority", FilterOperator.EQ, sPriority));
          }

          // Filter by maintenance type
          if (sType !== "All") {
            aFilters.push(new Filter("type", FilterOperator.EQ, sType));
          }

          // Filter by planner
          if (sPlanner !== "All") {
            aFilters.push(new Filter("planner", FilterOperator.EQ, sPlanner));
          }

          // Search across multiple columns
          if (sSearch) {
            aFilters.push(
              new Filter({
                filters: [
                  new Filter("order", FilterOperator.Contains, sSearch),
                  new Filter("equipment", FilterOperator.Contains, sSearch),
                  new Filter("description", FilterOperator.Contains, sSearch),
                ],
                and: false,
              }),
            );
          }

          // Filter by scheduled start date
          if (oDate) {
            const sDate = oDate.toISOString().split("T")[0];

            aFilters.push(
              new Filter("scheduledFrom", FilterOperator.GE, sDate),
            );
          }

          // Step 3: Apply filters to the table binding
          const oBinding = this.byId("ordersTable").getBinding("items");

          oBinding.filter(aFilters);

          // Step 4: Update KPI visible order count and estimated cost
          const iLength = oBinding.getLength();
          const oKpiModel = this.getView().getModel("kpi");

          oKpiModel.setProperty("/visibleOrderCount", iLength);

          const aFilteredContexts = oBinding.getContexts(0, iLength);
          const aFilteredOrders = aFilteredContexts.map((oContext) =>
            oContext.getObject(),
          );

          oKpiModel.setProperty(
            "/estimatedCost",
            formatter.calculateEstimatedCost(aFilteredOrders),
          );
        },
        /**
         * Clears all active filter conditions and restores
         * the full maintenance order dataset.
         *
         * Processing Flow:
         * 1. Reset search field.
         * 2. Reset all dropdown filters.
         * 3. Reset date filter.
         * 4. Remove table filters.
         * 5. Update the visible order counter.
         *
         * @returns {void}
         */
        onFilterClear() {
          // Step 1: Reset search field
          this.byId("inpSearch").setValue("");

          // Step 2: Reset dropdown filters and value help selections
          this.getView()
            .getModel("filters")
            .setProperty("/selectedEquipments", []);
          this.byId("tblEqValueHelp")?.removeSelections(true);

          this.byId("selPlant").setSelectedKey("All");

          this.byId("selStatus").setSelectedKey("All");

          this.byId("selPriority").setSelectedKey("All");

          this.byId("selMaintenanceType").setSelectedKey("All");

          this.byId("selPlanner").setSelectedKey("All");

          // Step 3: Reset date and extra filter fields
          this.byId("dpScheduledDateFrom").setValue("");
          if (this.byId("inpEquipmentType"))
            this.byId("inpEquipmentType").setValue("");
          if (this.byId("selCriticality"))
            this.byId("selCriticality").setSelectedKey("All");
          if (this.byId("dpActualStart"))
            this.byId("dpActualStart").setValue("");
          if (this.byId("inpLocation")) this.byId("inpLocation").setValue("");
          if (this.byId("inpCreatedBy")) this.byId("inpCreatedBy").setValue("");
          if (this.byId("dpActualEnd")) this.byId("dpActualEnd").setValue("");

          // Step 4: Remove all table filters
          const oBinding = this.byId("ordersTable").getBinding("items");

          oBinding.filter([]);

          // Step 5: Update KPI visible order count and estimated cost
          const iLength = oBinding.getLength();
          const oKpiModel = this.getView().getModel("kpi");

          oKpiModel.setProperty("/visibleOrderCount", iLength);

          const aFilteredContexts = oBinding.getContexts(0, iLength);
          const aFilteredOrders = aFilteredContexts.map((oContext) =>
            oContext.getObject(),
          );

          oKpiModel.setProperty(
            "/estimatedCost",
            formatter.calculateEstimatedCost(aFilteredOrders),
          );
        },

        // ==================================
        // Public: View lifecycle and layout
        // ==================================

        /**
         * Opens the Equipment Detail panel for the
         * selected maintenance order.
         *
         * @param {sap.ui.base.Event} oEvent Press event
         * @returns {void}
         */
        onEquipmentPress(oEvent) {
          // Step 1: Get the selected order context
          const oSource = oEvent.getSource();

          const oContext = oSource.getBindingContext("orders");

          if (!oContext) {
            return;
          }

          // Step 2: Retrieve the selected order
          const oOrder = oContext.getObject();

          // Step 3: Open the equipment detail panel
          this._openEquipmentDetail(oOrder);
        },

        /**
         * Closes the Equipment Detail panel and restores
         * the default single-column layout.
         *
         * @returns {void}
         */
        onCloseEquipmentPanel() {
          this.getView().getModel("ui").setProperty("/layout", "OneColumn");
        },

        /**
         * Handles maintenance order selection for
         * Mass Change processing.
         *
         * Updates the selected orders collection in the
         * Mass Change model.
         *
         * @param {sap.ui.base.Event} oEvent Selection event
         * @returns {void}
         */
        onOrderSelect(oEvent) {
          // Step 1: Read the current selection state
          const bSelected = oEvent.getParameter("selected");

          const oContext = oEvent.getSource().getBindingContext("orders");

          const oOrder = oContext.getObject();

          // Step 2: Get the current selected orders
          const oModel = this.getView().getModel("massChange");

          let aSelected = oModel.getProperty("/selectedOrders") || [];

          // Step 3: Add or remove the selected order
          if (bSelected) {
            aSelected.push(oOrder.order);
          } else {
            aSelected = aSelected.filter((sOrder) => sOrder !== oOrder.order);
          }

          // Step 4: Update the Mass Change model
          oModel.setProperty("/selectedOrders", aSelected);
        },

        // =============================
        // Public: Selection and updates
        // =============================
        /**
         * Opens the Mass Change dialog.
         *
         * Validation Rules:
         * - At least one order must be selected.
         * - CANCELLED orders cannot be modified.
         * - Users may continue with valid orders only.
         *
         * @returns {Promise<void>}
         */
        async onMassChangePress() {
          // Step 1: Get selected orders
          const aSelected = this.getView()
            .getModel("massChange")
            .getProperty("/selectedOrders");

          // Step 2: Validate selection
          if (!aSelected.length) {
            MessageBox.warning(
              this.getView()
                .getModel("i18n")
                .getResourceBundle()
                .getText("massChangeSelectAtLeastOne"),
            );

            return;
          }

          // Step 3: Check for CANCELLED orders
          const aAllRows =
            this.getView().getModel("orders").getProperty("/rows") || [];

          const aCancelledSelected = aSelected.filter((sOrderId) => {
            const oRow = aAllRows.find((r) => r.order === sOrderId);

            return oRow && oRow.statusLabel === constants.STATUS.CANCELLED;
          });

          if (aCancelledSelected.length) {
            const sCancelledList = aCancelledSelected.join(", ");

            // Step 4: Block processing if all selected orders are CANCELLED
            if (aCancelledSelected.length === aSelected.length) {
              MessageBox.warning(
                this.getView()
                  .getModel("i18n")
                  .getResourceBundle()
                  .getText("massChangeCancelledCannotChange", [sCancelledList]),
              );

              return;
            }

            // Step 5: Ask for confirmation to continue with valid orders only
            const bContinue = await new Promise((resolve) => {
              MessageBox.confirm(
                this.getView()
                  .getModel("i18n")
                  .getResourceBundle()
                  .getText("massChangeCancelledWillBeSkipped", [
                    sCancelledList,
                  ]),
                {
                  onClose: (sAction) => {
                    if (sAction !== MessageBox.Action.OK) {
                      resolve(false);
                      return;
                    }

                    // Remove CANCELLED orders from the selection
                    const aValidOrders = aSelected.filter(
                      (sId) => !aCancelledSelected.includes(sId),
                    );

                    this.getView()
                      .getModel("massChange")
                      .setProperty("/selectedOrders", aValidOrders);

                    resolve(true);
                  },
                },
              );
            });

            if (!bContinue) {
              return;
            }

            // Step 6: Re-check remaining orders after confirmation
            const aValidAfterFilter =
              this.getView()
                .getModel("massChange")
                .getProperty("/selectedOrders") || [];

            if (!aValidAfterFilter.length) {
              return;
            }
          }

          // Step 7: Lazy load the Mass Change dialog
          if (!this._pMassChangeDialog) {
            this._pMassChangeDialog = Fragment.load({
              id: this.getView().getId(),
              name: "com.fsoft.zpmmaintenancecockpit.view.fragment.MassChange",
              controller: this,
            }).then((oDialog) => {
              this.getView().addDependent(oDialog);

              return oDialog;
            });
          }

          // Step 8: Open the dialog
          const oDialog = await this._pMassChangeDialog;

          oDialog.open();
        },

        /**
         * Closes the Mass Change dialog without
         * applying any changes.
         *
         * @returns {void}
         */
        onMassChangeCancel() {
          this.byId("massChangeDialog").close();
        },

        /**
         * Applies the selected priority value to all
         * selected maintenance orders.
         *
         * Updates:
         * - Priority
         * - Priority state
         * - Critical flag
         * - KPI counters
         *
         * @returns {void}
         */
        onMassChangeApply() {
          // Step 1: Read Mass Change values
          const oMassChangeModel = this.getView().getModel("massChange");

          const aSelectedOrders =
            oMassChangeModel.getProperty("/selectedOrders") || [];

          const sPriority = this.byId("massChangePrioritySelect")
            ? this.byId("massChangePrioritySelect").getSelectedKey()
            : oMassChangeModel.getProperty("/priority") || "LOW";

          const aRows =
            this.getView().getModel("orders").getProperty("/rows") || [];

          // Step 2: Update selected orders (excluding CANCELLED and COMPLETED)
          aRows.forEach((oRow) => {
            if (
              aSelectedOrders.includes(oRow.order) &&
              oRow.statusLabel !== constants.STATUS.CANCELLED
            ) {
              oRow.priority = sPriority;

              oRow.priorityState = formatter.formatPriorityState(sPriority);

              oRow.isCritical = sPriority === constants.PRIORITY.CRITICAL;
            }
          });

          // Sync with OrderRepository
          OrderRepository.setOrders(aRows);

          // Step 3: Refresh order model
          this.getView().getModel("orders").refresh(true);

          // Step 4: Refresh KPI counters
          this._refreshKpiCounts();

          // Step 5: Uncheck table header and row checkboxes
          const oHeaderCheckbox = this.byId("chkSelectHeader");
          if (oHeaderCheckbox) {
            oHeaderCheckbox.setSelected(false);
          }
          const oTable = this.byId("ordersTable");
          if (oTable) {
            oTable.getItems().forEach((oItem) => {
              const oCheckBox = oItem.getCells()[0];
              if (oCheckBox && oCheckBox.setSelected) {
                oCheckBox.setSelected(false);
              }
            });
          }
          oMassChangeModel.setProperty("/selectedOrders", []);

          // Step 6: Close dialog
          this.byId("massChangeDialog").close();

          // Step 7: Show success message
          MessageToast.show(
            this.getView()
              .getModel("i18n")
              .getResourceBundle()
              .getText("massChangeAppliedSuccess"),
          );
        },

        /**
         * Selects or deselects all visible
         * maintenance orders in the table.
         *
         * @param {sap.ui.base.Event} oEvent Selection event
         * @returns {void}
         */
        onSelectAllOrders(oEvent) {
          // Step 1: Read select-all state
          const bSelected = oEvent.getParameter("selected");

          const oTable = this.byId("ordersTable");

          const aItems = oTable.getItems();

          const aSelectedOrders = [];

          // Step 2: Update row selection state
          aItems.forEach((oItem) => {
            const oCheckBox = oItem.getCells()[0];

            oCheckBox.setSelected(bSelected);

            if (bSelected) {
              const oOrder = oItem.getBindingContext("orders").getObject();

              aSelectedOrders.push(oOrder.order);
            }
          });

          // Step 3: Update selected orders model
          this.getView()
            .getModel("massChange")
            .setProperty("/selectedOrders", aSelectedOrders);
        },

        // ======================
        // Public: Export action
        // ======================
        /**
         * Exports the currently visible maintenance orders
         * to a CSV file.
         *
         * Only rows remaining after filtering are exported.
         *
         * @returns {void}
         */
        onExportPress() {
          // Step 1: Get visible rows from the table binding
          const oBinding = this.byId("ordersTable").getBinding("items");

          const aRows = oBinding
            .getContexts()
            .map((oContext) => oContext.getObject());

          // Step 2: Validate export data
          if (!aRows.length) {
            MessageBox.information(
              this.getView()
                .getModel("i18n")
                .getResourceBundle()
                .getText("maintenanceOrdersExportNoData"),
            );

            return;
          }

          // Step 3: Create CSV header row
          const aCsvRows = [
            [
              "Order",
              "Equipment",
              "Description",
              "Plant",
              "Type",
              "Priority",
              "Status",
              "Planner",
              "Scheduled From",
              "Scheduled To",
            ].join(","),
          ];

          // Step 4: Populate CSV data rows
          aRows.forEach((oRow) => {
            aCsvRows.push(
              [
                oRow.order,
                oRow.equipment,
                `"${oRow.description}"`,
                oRow.plant,
                oRow.type,
                oRow.priority,
                oRow.statusLabel,
                oRow.planner,
                oRow.scheduledFrom,
                oRow.scheduledTo,
              ].join(","),
            );
          });

          // Step 5: Generate CSV content
          const sCsvContent = aCsvRows.join("\n");

          const oBlob = new Blob([sCsvContent], {
            type: "text/csv;charset=utf-8;",
          });

          // Step 6: Build export file name
          const sFileName = `MaintenanceOrders_${new Date()
            .toISOString()
            .slice(0, 10)}.csv`;

          // Step 7: Trigger browser download
          const oLink = document.createElement("a");

          oLink.href = URL.createObjectURL(oBlob);

          oLink.download = sFileName;

          document.body.appendChild(oLink);

          oLink.click();

          // Step 8: Clean up temporary resources
          document.body.removeChild(oLink);

          URL.revokeObjectURL(oLink.href);
        },

        // ============================
        // Public: Value help handling
        // ============================
        /**
         * Opens the Equipment Value Help dialog.
         *
         * Loads the fragment lazily, initializes the
         * Equipment Value Help model and displays the dialog.
         *
         * @returns {Promise<void>}
         */
        async onEquipmentValueHelpPress() {
          // Step 1: Load the dialog fragment if it has not been initialized
          if (!this._pEquipmentValueHelp) {
            this._pEquipmentValueHelp = Fragment.load({
              id: this.getView().getId(),
              name: "com.fsoft.zpmmaintenancecockpit.view.fragment.EquipmentValueHelp",
              controller: this,
            }).then((oDialog) => {
              this.getView().addDependent(oDialog);

              return oDialog;
            });
          }

          // Step 2: Initialize Equipment Value Help model
          this._initEquipmentValueHelpModel();

          // Step 3: Open the dialog
          const oDialog = await this._pEquipmentValueHelp;

          oDialog.open();

          // Step 4: Restore previous selections
          const oTable = this.byId("tblEqValueHelp");
          const aSelectedEquipments =
            this.getView()
              .getModel("filters")
              .getProperty("/selectedEquipments") || [];

          oTable.removeSelections(true);

          // Use setTimeout to ensure table items are rendered
          setTimeout(() => {
            oTable.getItems().forEach((oItem) => {
              const oContext = oItem.getBindingContext("equipmentVH");
              if (oContext) {
                const sEquipment = oContext.getProperty("equipment");
                if (aSelectedEquipments.includes(sEquipment)) {
                  oItem.setSelected(true);
                }
              }
            });
          }, 0);
        },

        /**
         * Filters equipment records in the
         * Equipment Value Help dialog.
         *
         * Search is performed against:
         * - Equipment Number
         * - Equipment Description
         *
         * @param {sap.ui.base.Event} oEvent Search event
         * @returns {void}
         */
        onSearchEquipmentValueHelp(oEvent) {
          // Step 1: Read the search keyword
          const sValue = oEvent.getParameter("newValue");

          // Step 2: Get table binding
          const oTable = this.byId("tblEqValueHelp");

          const oBinding = oTable.getBinding("items");

          // Step 3: Create search filter
          const oFilter = new Filter({
            filters: [
              new Filter("equipment", FilterOperator.Contains, sValue),

              new Filter("description", FilterOperator.Contains, sValue),
            ],

            and: false,
          });

          // Step 4: Apply filter to the table
          oBinding.filter(sValue ? [oFilter] : []);
        },

        /**
         * Applies the selected equipment from
         * the Value Help dialog to the FilterBar.
         *
         * Automatically triggers table filtering
         * after the equipment is selected.
         *
         * @returns {void}
         */
        onConfirmEquipmentValueHelp() {
          // Step 1: Get selected rows
          const oTable = this.byId("tblEqValueHelp");

          const aSelectedItems = oTable.getSelectedItems();

          if (!aSelectedItems.length) {
            return;
          }

          // Step 2: Extract selected equipment ids
          const aSelectedEquipments = aSelectedItems.map(
            (oItem) =>
              oItem.getBindingContext("equipmentVH").getObject().equipment,
          );

          // Step 3: Save selected equipment list
          this.getView()
            .getModel("filters")
            .setProperty("/selectedEquipments", aSelectedEquipments);

          // Step 4: Apply filter
          this.onFilterGo();

          // Step 5: Close dialog
          this.byId("dlgEqValueHelp").close();
        },

        /**
         * Closes the Equipment Value Help dialog.
         *
         * @returns {void}
         */
        onCloseEquipmentValueHelp() {
          this.byId("dlgEqValueHelp").close();
        },

        // ================================
        // Public: Adapt filter visibility
        // ================================
        /**
         * Applies the current Adapt Filters configuration
         * and closes the dialog.
         *
         * @returns {void}
         */
        onAdaptFiltersApply() {
          // Step 1: Read draft config
          const oDraftData = this.getView()
            .getModel("filterConfigDraft")
            .getData();

          // Step 2: Apply to actual config
          this.getView()
            .getModel("filterConfig")
            .setData(JSON.parse(JSON.stringify(oDraftData)));

          // Step 3: Close dialog
          this.byId("adaptFiltersDialog").close();
        },

        /**
         * Opens the Adapt Filters dialog.
         *
         * Loads the fragment lazily and displays
         * the filter visibility configuration.
         *
         * @returns {Promise<void>}
         */
        async onAdaptFiltersPress() {
          // Step 1: Create draft config
          const oCurrentConfig = this.getView()
            .getModel("filterConfig")
            .getData();

          this.getView().setModel(
            new JSONModel(JSON.parse(JSON.stringify(oCurrentConfig))),
            "filterConfigDraft",
          );

          // Step 2: Load dialog
          if (!this._pAdaptFiltersDialog) {
            this._pAdaptFiltersDialog = Fragment.load({
              id: this.getView().getId(),
              name: "com.fsoft.zpmmaintenancecockpit.view.fragment.AdaptFilters",
              controller: this,
            }).then((oDialog) => {
              this.getView().addDependent(oDialog);

              return oDialog;
            });
          }

          // Step 3: Open dialog
          const oDialog = await this._pAdaptFiltersDialog;

          oDialog.open();
        },

        /**
         * Closes the Adapt Filters dialog without
         * applying any changes.
         *
         * @returns {void}
         */
        onAdaptFiltersCancel() {
          this.byId("adaptFiltersDialog").close();
        },

        /**
         * Navigates to the Maintenance Order Detail page.
         *
         * @param {sap.ui.base.Event} oEvent Press event
         * @returns {void}
         */
        onOrderPress(oEvent) {
          // Step 1: Get the selected order context
          const oObjectIdentifier = oEvent.getSource();

          const oContext = oObjectIdentifier.getBindingContext("orders");

          if (!oContext) {
            return;
          }

          // Step 2: Read the order number
          const sOrder = oContext.getProperty("order");

          if (!sOrder) {
            return;
          }

          // Step 3: Navigate to the Order Detail page
          this.getOwnerComponent().getRouter().navTo("RouteOrderDetail", {
            orderId: sOrder,
          });
        },

        // ======================================
        // Private: Dialogs and fragment lifecycle
        // ======================================

        /**
         * Loads and opens the Create Maintenance Order dialog.
         *
         * The dialog fragment is loaded lazily and reused
         * during the page lifecycle.
         *
         * @returns {Promise<void>}
         */
        async _openCreateOrderDialog() {
          // Step 1: Ensure dialog controller exists
          this._ensureDialogController();

          // Step 2: Load dialog fragment if not already loaded
          if (!this._pCreateOrderDialog) {
            this._pCreateOrderDialog = Fragment.load({
              id: this.getView().getId(),
              name: "com.fsoft.zpmmaintenancecockpit.view.fragment.CreateMaintenanceOrder",
              controller: this._dialogController,
            }).then((oDialog) => {
              this.getView().addDependent(oDialog);

              return oDialog;
            });
          }

          // Step 3: Get dialog instance
          const oDialog = await this._pCreateOrderDialog;

          // Step 4: Initialize dialog data
          this._dialogController.initDialogState();

          // Step 5: Open dialog
          oDialog.open();
        },

        /**
         * Creates the Create Maintenance Order dialog controller
         * if it does not already exist.
         *
         * Ensures a single controller instance is reused.
         *
         * @returns {void}
         */
        _ensureDialogController() {
          // Step 1: Create controller instance if required
          if (!this._dialogController) {
            this._dialogController = new CreateMaintenanceOrderDialog();

            // Step 2: Register parent controller
            this._dialogController.setParentController(this);
          }
        },

        /**
         * Builds the Equipment Detail model and displays
         * the Equipment Detail panel.
         *
         * Updates the Flexible Column Layout to show
         * the detail section.
         *
         * @param {object} oOrder Selected maintenance order
         * @returns {void}
         */
        _openEquipmentDetail(oOrder) {
          // Step 1: Validate selected order
          if (!oOrder) {
            return;
          }

          // Step 2: Load equipment master data and all orders
          const aEquipment =
            this.getView()
              .getModel("equipmentData")
              ?.getProperty("/equipment") || [];

          const oEquipment = aEquipment.find(
            (item) => item.equipment === oOrder.equipment,
          );

          const sTargetEquipmentKey = oEquipment
            ? oEquipment.equipment
            : oOrder.equipment;
          const aAllOrders =
            this.getView().getModel("orders")?.getProperty("/rows") || [];
          const aMatchingOrders = aAllOrders.filter(
            (row) => row.equipment === sTargetEquipmentKey,
          );

          let aRecentOrdersList = [];
          if (aMatchingOrders.length > 0) {
            aRecentOrdersList = aMatchingOrders.map((row) => ({
              order: row.order,
              description: row.description,
              status: row.statusLabel || row.status,
              statusState: formatter.formatStatusState(
                row.statusLabel || row.status,
              ),
            }));
          } else if (
            oEquipment &&
            oEquipment.orders &&
            Array.isArray(oEquipment.orders) &&
            oEquipment.orders.length > 0
          ) {
            aRecentOrdersList = oEquipment.orders.map((oRecentOrder) => ({
              order: oRecentOrder.order_no || oRecentOrder.order,
              description: oRecentOrder.description,
              status: oRecentOrder.status,
              statusState: formatter.formatStatusState(oRecentOrder.status),
            }));
          } else if (
            oEquipment &&
            oEquipment.recentOrders &&
            Array.isArray(oEquipment.recentOrders) &&
            oEquipment.recentOrders.length > 0
          ) {
            aRecentOrdersList = oEquipment.recentOrders.map((oRecentOrder) => ({
              order: oRecentOrder.order,
              description: oRecentOrder.description,
              status: oRecentOrder.status,
              statusState: formatter.formatStatusState(oRecentOrder.status),
            }));
          } else if (oOrder.order) {
            aRecentOrdersList = [
              {
                order: oOrder.order,
                description: oOrder.description,
                status: oOrder.statusLabel || oOrder.status,
                statusState: formatter.formatStatusState(
                  oOrder.statusLabel || oOrder.status,
                ),
              },
            ];
          }

          // Step 3: Build equipment detail model
          const oEquipmentDetailModel = new JSONModel({
            header: oEquipment
              ? `${oEquipment.equipment} - ${oEquipment.description}`
              : `${oOrder.equipment} - ${oOrder.description}`,

            type: oEquipment ? oEquipment.type : oOrder.type,

            plant: oEquipment ? oEquipment.plant : oOrder.plant,

            location: oEquipment
              ? oEquipment.location
              : `Plant ${oOrder.plant}`,

            status: oEquipment ? oEquipment.status : oOrder.statusLabel,

            statusState: formatter.formatStatusState(
              oEquipment ? oEquipment.status : oOrder.statusLabel,
            ),

            criticality: oEquipment ? oEquipment.criticality : oOrder.priority,

            manufacturer: oEquipment ? oEquipment.manufacturer : "N/A",

            recentOrders: aRecentOrdersList,
          });

          // Step 4: Bind detail model to view
          this.getView().setModel(oEquipmentDetailModel, "equipmentDetail");

          // Step 5: Expand layout
          this.getView()
            .getModel("ui")
            .setProperty("/layout", "TwoColumnsMidExpanded");
        },

        // ===================================
        // Private: KPI and filter application
        // ===================================

        /**
         * Applies or clears a KPI filter on the orders table.
         *
         * @param {string} sFilterKey Identifier for the active KPI filter.
         * @param {sap.ui.model.Filter} oFilter Filter to apply to the order binding.
         * @returns {void}
         */
        _applyKpiFilter(sFilterKey, oFilter) {
          const oTable = this.byId("ordersTable");

          const oItemsBinding = oTable.getBinding("items");

          const oKpiModel = this.getView().getModel("kpi");

          const sActiveFilterKey = oKpiModel.getProperty("/activeFilterKey");

          if (!oItemsBinding || !oFilter || !sFilterKey) {
            return;
          }

          // Clicking the same KPI twice clears the filter.
          if (sActiveFilterKey === sFilterKey) {
            oItemsBinding.filter([]);

            this.byId("selStatus")?.setSelectedKey("All");

            this.byId("selPriority")?.setSelectedKey("All");

            oKpiModel.setProperty("/activeFilterKey", "");
          } else {
            oItemsBinding.filter([oFilter]);
            oKpiModel.setProperty("/activeFilterKey", sFilterKey);
          }

          const iLength = oItemsBinding.getLength();
          oKpiModel.setProperty("/visibleOrderCount", iLength);

          const aFilteredContexts = oItemsBinding.getContexts(0, iLength);
          const aFilteredOrders = aFilteredContexts.map((oContext) =>
            oContext.getObject(),
          );

          oKpiModel.setProperty(
            "/estimatedCost",
            formatter.calculateEstimatedCost(aFilteredOrders),
          );
        },

        /**
         * Refreshes KPI counters after order data changes.
         *
         * @param {object[]} [aExplicitRows] Optional order collection to calculate.
         * @returns {void}
         */
        _refreshKpiCounts(aExplicitRows) {
          const aRows =
            aExplicitRows ||
            (this.getView().getModel("orders")
              ? this.getView().getModel("orders").getProperty("/rows")
              : []) ||
            [];

          const oKpiModel = this.getView().getModel("kpi");
          if (!oKpiModel) {
            return;
          }

          oKpiModel.setProperty(
            "/openCount",
            this._countOrdersByStatus(aRows, constants.STATUS.OPEN),
          );

          oKpiModel.setProperty(
            "/inProcessCount",
            this._countOrdersByStatus(
              aRows,
              constants.STATUS.IN_PROCESS_DISPLAY,
            ),
          );

          oKpiModel.setProperty(
            "/criticalCount",
            this._countOrdersByFlag(aRows, "isCritical"),
          );

          oKpiModel.setProperty(
            "/overdueCount",
            this._countOrdersByFlag(aRows, "isOverdue"),
          );

          oKpiModel.setProperty(
            "/estimatedCost",
            formatter.calculateEstimatedCost(aRows),
          );

          oKpiModel.setProperty("/visibleOrderCount", aRows.length);
        },

        // ==================================
        // Private: Model initialization data
        // ==================================

        /**
         * Builds FilterBar dropdown values from
         * maintenance order data.
         *
         * @param {object[]} aRows Maintenance order collection
         * @returns {void}
         */
        _initFilterData(aRows) {
          // Step 1: Create helper function for unique values
          const unique = (aValues) => [...new Set(aValues)];

          // Step 2: Build filter model data
          const oFilterModel = new JSONModel({
            equipments: [...unique(aRows.map((oRow) => oRow.equipment))],

            plants: ["All", ...unique(aRows.map((oRow) => oRow.plant))],

            statuses: ["All", ...unique(aRows.map((oRow) => oRow.statusLabel))],

            priorities: ["All", ...unique(aRows.map((oRow) => oRow.priority))],

            maintenanceTypes: [
              "All",
              ...unique(aRows.map((oRow) => oRow.type)),
            ],

            planners: ["All", ...unique(aRows.map((oRow) => oRow.planner))],

            selectedEquipments: [],
          });

          // Step 3: Register FilterBar model
          this.getView().setModel(oFilterModel, "filters");
        },

        /**
         * Initializes the Mass Change model.
         *
         * Stores selected maintenance orders and
         * target update values.
         *
         * @returns {void}
         */
        /**
         * Initializes the mass-change model with default values.
         *
         * @returns {void}
         */
        _initMassChangeModel() {
          // Step 1: Create Mass Change model
          this.getView().setModel(
            new JSONModel({
              selectedOrders: [],
              priority: "LOW",
            }),
            "massChange",
          );
        },

        /**
         * Initializes the Equipment Value Help model.
         *
         * Creates a unique equipment list from
         * maintenance order data.
         *
         * @returns {void}
         */
        _initEquipmentValueHelpModel() {
          // Step 1: Get maintenance orders
          const aRows =
            this.getView().getModel("orders").getProperty("/rows") || [];

          // Step 2: Collect unique equipment entries
          const mUniqueEquipment = {};

          aRows.forEach((oRow) => {
            if (!mUniqueEquipment[oRow.equipment]) {
              mUniqueEquipment[oRow.equipment] = {
                equipment: oRow.equipment,
                description: oRow.description,
                plant: oRow.plant,
              };
            }
          });

          // Step 3: Register Value Help model
          this.getView().setModel(
            new JSONModel({
              equipments: Object.values(mUniqueEquipment),
            }),
            "equipmentVH",
          );
        },

        /**
         * Initializes the Adapt Filters configuration model.
         *
         * Controls which filter fields are visible
         * in the FilterBar.
         *
         * @returns {void}
         */
        _initFilterConfigModel() {
          // Step 1: Create filter visibility configuration
          this.getView().setModel(
            new JSONModel({
              search: true,
              equipment: true,
              plant: true,
              status: true,
              priority: true,
              maintenanceType: true,
              planner: true,
              scheduledDateFrom: true,
              equipmentType: false,
              criticality: false,
              actualStart: false,
              location: false,
              createdBy: false,
              actualEnd: false,
            }),
            "filterConfig",
          );
        },

        // ================================
        // Private: Data normalization utils
        // ================================

        /**
         * Counts maintenance orders matching
         * the specified status value.
         *
         * @param {object[]} aRows Maintenance order collection
         * @param {string} sStatus Target status
         * @returns {number} Number of matching orders
         */
        _countOrdersByStatus(aRows, sStatus) {
          return (aRows || []).filter(
            (oRow) => formatter.normalizeStatus(oRow.statusLabel) === sStatus,
          ).length;
        },

        /**
         * Counts rows where the specified
         * boolean flag is true.
         *
         * @param {object[]} aRows Maintenance order collection
         * @param {string} sFlagName Flag property name
         * @returns {number} Number of matching rows
         */
        _countOrdersByFlag(aRows, sFlagName) {
          return (aRows || []).filter((oRow) => Boolean(oRow[sFlagName]))
            .length;
        },

        /**
         * Refreshes KPI counts from the current orders model.
         *
         * @returns {void}
         */
        _refreshKpiCounts() {
          const aRows =
            this.getView().getModel("orders").getProperty("/rows") || [];
          const oKpiModel = this.getView().getModel("kpi");

          if (oKpiModel) {
            oKpiModel.setProperty(
              "/openCount",
              this._countOrdersByStatus(aRows, constants.STATUS.OPEN),
            );
            oKpiModel.setProperty(
              "/inProcessCount",
              this._countOrdersByStatus(
                aRows,
                constants.STATUS.IN_PROCESS_DISPLAY,
              ),
            );
            oKpiModel.setProperty(
              "/criticalCount",
              this._countOrdersByFlag(aRows, "isCritical"),
            );
            oKpiModel.setProperty(
              "/overdueCount",
              this._countOrdersByFlag(aRows, "isOverdue"),
            );
            oKpiModel.setProperty(
              "/estimatedCost",
              formatter.calculateEstimatedCost(aRows),
            );
          }
        },

        // ================================
        // Mass Change Implementation
        // ================================

        _initMassChangeModel() {
          this.getView().setModel(
            new JSONModel({
              selectedOrders: [],
              priority: "MEDIUM",
            }),
            "massChange",
          );
        },

        /**
         * Updates the mass-change selection after an order is selected.
         *
         * @param {sap.ui.base.Event} oEvent Order selection event.
         * @returns {void}
         */
        onOrderSelect(oEvent) {
          const oContext = oEvent.getSource().getBindingContext("orders");
          if (!oContext) return;

          const oRow = oContext.getObject();
          oRow.selected = oEvent.getParameter("selected");

          const aRows =
            this.getView().getModel("orders").getProperty("/rows") || [];
          const aSelected = aRows.filter((r) => r.selected);
          this.getView()
            .getModel("massChange")
            .setProperty("/selectedOrders", aSelected);

          const oHeaderCheck = this.byId("chkSelectHeader");
          if (oHeaderCheck) {
            oHeaderCheck.setSelected(
              aSelected.length === aRows.length && aRows.length > 0,
            );
          }
        },

        /**
         * Selects or deselects all orders for mass change.
         *
         * @param {sap.ui.base.Event} oEvent Select-all event.
         * @returns {void}
         */
        onSelectAllOrders(oEvent) {
          const bSelected = oEvent.getParameter("selected");
          const aRows =
            this.getView().getModel("orders").getProperty("/rows") || [];
          aRows.forEach((r) => {
            r.selected = bSelected;
          });
          this.getView().getModel("orders").setProperty("/rows", aRows);

          const aSelected = bSelected ? [...aRows] : [];
          this.getView()
            .getModel("massChange")
            .setProperty("/selectedOrders", aSelected);
        },

        /**
         * Opens the mass-change dialog for eligible selected orders.
         *
         * @returns {void}
         */
        onMassChangePress() {
          const aSelected =
            this.getView()
              .getModel("massChange")
              .getProperty("/selectedOrders") || [];
          const oResourceBundle = this.getView()
            .getModel("i18n")
            .getResourceBundle();

          if (aSelected.length === 0) {
            MessageBox.warning(
              oResourceBundle.getText("massChangeSelectAtLeastOne"),
            );
            return;
          }

          const aInvalid = aSelected.filter(
            (o) =>
              o.statusKey === constants.STATUS.CANCELLED ||
              o.statusLabel === constants.STATUS.CANCELLED,
          );
          if (aInvalid.length === aSelected.length) {
            MessageBox.error(
              oResourceBundle.getText("massChangeCancelledCannotChange", [
                aInvalid.map((o) => o.order).join(", "),
              ]),
            );
            return;
          }

          if (!this._pMassChangeDialog) {
            this._pMassChangeDialog = Fragment.load({
              id: this.getView().getId(),
              name: "com.fsoft.zpmmaintenancecockpit.view.fragment.MassChange",
              controller: this,
            }).then((oDialog) => {
              this.getView().addDependent(oDialog);
              return oDialog;
            });
          }

          this._pMassChangeDialog.then((oDialog) => {
            oDialog.open();
          });
        },

        /**
         * Closes the mass-change dialog without applying changes.
         *
         * @returns {void}
         */
        onMassChangeCancel() {
          if (this._pMassChangeDialog) {
            this._pMassChangeDialog.then((oDialog) => oDialog.close());
          }
        },

        /**
         * Applies the selected priority to eligible orders.
         *
         * @returns {Promise<void>} Resolves after the order updates complete.
         */
        async onMassChangeApply() {
          const oMassModel = this.getView().getModel("massChange");
          const aSelected = oMassModel.getProperty("/selectedOrders") || [];
          const sNewPriority = oMassModel.getProperty("/priority") || "MEDIUM";
          const oResourceBundle = this.getView()
            .getModel("i18n")
            .getResourceBundle();

          const aValidOrders = aSelected.filter(
            (o) =>
              o.statusKey !== constants.STATUS.CANCELLED &&
              o.statusLabel !== constants.STATUS.CANCELLED,
          );
          const aOrderKeys = aValidOrders.map((o) => o.order);

          if (aOrderKeys.length === 0) {
            this.onMassChangeCancel();
            return;
          }

          const sPriorityState =
            sNewPriority === "CRITICAL" || sNewPriority === "HIGH"
              ? "Error"
              : sNewPriority === "MEDIUM"
                ? "Warning"
                : "Success";

          try {
            // Send batch update request to CAP backend ($batch)
            await CAPService.massUpdateOrders(aOrderKeys, {
              priority: sNewPriority,
              priority_state: sPriorityState,
            });

            // Update local rows
            const aRows =
              this.getView().getModel("orders").getProperty("/rows") || [];
            aRows.forEach((r) => {
              if (aOrderKeys.includes(r.order)) {
                r.priority = sNewPriority;
                r.priorityState = sPriorityState;
                r.isCritical = sNewPriority === constants.PRIORITY.CRITICAL;

                // Log audit history to CAP
                AuditHistoryService.addEntry(
                  r.order,
                  "UPDATE",
                  `Mass Change: Priority updated to ${sNewPriority}`,
                  "Current User",
                );
              }
            });

            this.getView().getModel("orders").setProperty("/rows", aRows);
            this._refreshKpiCounts();

            MessageToast.show(
              oResourceBundle.getText("massChangeAppliedSuccess"),
            );
            this.onMassChangeCancel();
          } catch (err) {
            console.error("Mass change batch update failed:", err);
            MessageBox.error(
              "Failed to update orders on server: " + err.message,
            );
          }
        },

        /**
         * Reloads the order list from the CAP service.
         *
         * @returns {Promise<void>} Resolves after orders and KPIs are refreshed.
         */
        async _reloadOrdersFromBackend() {
          try {
            const aRawOrders = await CAPService.getMaintenanceOrders();
            const aOrderRows = (aRawOrders || []).map((oOrderItem) => ({
              order: oOrderItem.order_no,
              equipment: oOrderItem.equipment_no,
              description: oOrderItem.description,
              plant: oOrderItem.plant,
              type: oOrderItem.maintenance_type,
              priority: oOrderItem.priority,
              priorityState: oOrderItem.priority_state,
              statusLabel: oOrderItem.status,
              statusKey: formatter.normalizeStatus(oOrderItem.status),
              statusState: formatter.formatStatusState(oOrderItem.status),
              planner: oOrderItem.planner,
              scheduledFrom: oOrderItem.scheduled_from,
              scheduledTo: oOrderItem.scheduled_to,
              scheduled: `${oOrderItem.scheduled_from} -> ${oOrderItem.scheduled_to}`,
              isCritical:
                formatter.normalizePriority(oOrderItem.priority) ===
                constants.PRIORITY.CRITICAL,
              isOverdue: formatter.isOverdue(
                oOrderItem.scheduled_to,
                oOrderItem.status,
              ),
              etag: oOrderItem.etag,
            }));

            OrderRepository.setOrders(aOrderRows);
            const oOrdersModel = this.getView().getModel("orders");
            if (oOrdersModel) {
              oOrdersModel.setProperty("/rows", aOrderRows);
              oOrdersModel.refresh(true);
            }
            this._refreshKpiCounts(aOrderRows);
            this._initFilterData(aOrderRows);

            const oTable = this.byId("ordersTable");
            if (oTable && oTable.getBinding("items")) {
              oTable.getBinding("items").refresh(true);
            }
          } catch (err) {
            console.error("Failed to reload orders from backend:", err);
          }
        },

        /**
         * Opens the import-orders dialog.
         *
         * @returns {Promise<void>} Resolves after the dialog opens.
         */
        async onImportOrdersPress() {
          this._oSelectedImportFile = null;
          if (!this._pImportOrdersDialog) {
            this._pImportOrdersDialog = Fragment.load({
              id: this.getView().getId(),
              name: "com.fsoft.zpmmaintenancecockpit.view.fragment.ImportOrdersDialog",
              controller: this,
            }).then((oDialog) => {
              this.getView().addDependent(oDialog);
              return oDialog;
            });
          }

          const oImportModel = new JSONModel({
            fileName: "",
            fileSize: "",
            statusText: "Waiting for file",
            statusState: "None",
            canImport: false,
            statusMessage:
              "Please choose a .xlsx or .csv file to import to Backend.",
            statusType: "Information",
          });
          this.getView().setModel(oImportModel, "importModel");

          const oDialog = await this._pImportOrdersDialog;
          const oUploader = this.byId("orderFileUploader");
          if (oUploader) {
            oUploader.clear();
          }
          oDialog.open();
        },

        /**
         * Downloads the Excel import template from the backend.
         *
         * @returns {Promise<void>} Resolves after the download is triggered.
         */
        async onDownloadImportTemplate() {
          try {
            const sUrl = CAPService.getDirectUrl(
              CAPService.getApiUrl() + "/download-template",
            );
            const res = await fetch(sUrl);
            if (!res.ok) {
              throw new Error(`Failed to download template [${res.status}]`);
            }
            const blob = await res.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const oLink = document.createElement("a");
            oLink.href = blobUrl;
            oLink.download = "MaintenanceOrders_Template.xlsx";
            document.body.appendChild(oLink);
            oLink.click();
            document.body.removeChild(oLink);
            setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
          } catch (err) {
            console.error("Error downloading template:", err);
            window.open(
              "https://3b342f32trial-dev-zpm-maintenance-cockpit-srv.cfapps.us10-001.hana.ondemand.com/api/maintenance/download-template",
              "_blank",
            );
          }
        },

        /**
         * Validates and stores the selected import file.
         *
         * @param {sap.ui.base.Event} oEvent File selection change event.
         * @returns {void}
         */
        onImportFileChange(oEvent) {
          const oFile =
            oEvent.getParameter("files") && oEvent.getParameter("files")[0];
          const oImportModel = this.getView().getModel("importModel");

          if (!oFile) {
            this._oSelectedImportFile = null;
            return;
          }

          const sFileName = oFile.name.toLowerCase();
          const bIsExcel =
            sFileName.endsWith(".xlsx") ||
            sFileName.endsWith(".xls") ||
            sFileName.endsWith(".csv");

          if (!bIsExcel) {
            this._oSelectedImportFile = null;
            oImportModel.setProperty("/fileName", oFile.name);
            oImportModel.setProperty(
              "/fileSize",
              (oFile.size / 1024).toFixed(1) + " KB",
            );
            oImportModel.setProperty("/statusText", "Unsupported format");
            oImportModel.setProperty("/statusState", "Error");
            oImportModel.setProperty(
              "/statusMessage",
              "Please select a valid .xlsx or .csv Excel file.",
            );
            oImportModel.setProperty("/statusType", "Error");
            oImportModel.setProperty("/canImport", false);
            return;
          }

          this._oSelectedImportFile = oFile;
          const sSize = (oFile.size / 1024).toFixed(1) + " KB";
          oImportModel.setProperty("/fileName", oFile.name);
          oImportModel.setProperty("/fileSize", sSize);
          oImportModel.setProperty("/statusText", "Ready to process");
          oImportModel.setProperty("/statusState", "Success");
          oImportModel.setProperty(
            "/statusMessage",
            `File selected (${sSize}). Click "Upload & Process on Backend" to stream data.`,
          );
          oImportModel.setProperty("/statusType", "Information");
          oImportModel.setProperty("/canImport", true);
        },

        /**
         * Uploads the selected workbook and refreshes imported orders.
         *
         * @returns {Promise<void>} Resolves after import processing completes.
         */
        async onConfirmImportOrders() {
          if (!this._oSelectedImportFile) {
            MessageToast.show("Please select an Excel file to import.");
            return;
          }

          const oImportModel = this.getView().getModel("importModel");
          oImportModel.setProperty("/canImport", false);
          oImportModel.setProperty(
            "/statusMessage",
            "Uploading file and streaming data to Backend via ExcelJS...",
          );
          oImportModel.setProperty("/statusType", "Information");

          sap.ui.core.BusyIndicator.show(0);

          try {
            const result = await CAPService.importOrdersExcel(
              this._oSelectedImportFile,
            );

            // Automatically close the import dialog immediately after upload
            this.onCancelImportOrders();

            // Automatically reload the orders list & refresh KPIs
            await this._reloadOrdersFromBackend();

            // Clear any active search filters to show the fresh imported list
            this.onFilterClear();

            let sMsg =
              `Import completed in ${result.durationSec || "1s"}!\n\n` +
              `• Total Orders Processed: ${result.totalRows}\n` +
              `• Successfully Imported: ${result.importedCount} maintenance order(s)\n` +
              `• Operations Created: ${result.operationsCount || result.importedCount} operation(s)\n` +
              `• Materials Linked: ${result.materialsCount || 0} item(s)\n`;

            if (result.failedCount > 0) {
              sMsg += `• Failed / Invalid Rows: ${result.failedCount}\n\nRow-by-Row Error Details:\n`;
              const maxDisplayErrors = Math.min(
                (result.errors || []).length,
                20,
              );
              for (let i = 0; i < maxDisplayErrors; i++) {
                const errItem = result.errors[i];
                sMsg += `  - Line ${errItem.row} (${errItem.order}): ${errItem.details || errItem.error}\n`;
              }
              if ((result.errors || []).length > 20) {
                sMsg += `  ... and ${result.errors.length - 20} more invalid rows.\n`;
              }

              if (result.importedCount > 0) {
                MessageBox.warning(sMsg, {
                  title: "Import Summary (Partial Success with Warnings)",
                });
              } else {
                MessageBox.error(sMsg, {
                  title: "Import Failed (Validation Errors)",
                });
              }
            } else {
              MessageBox.success(sMsg, {
                title: "Backend Excel Import Summary",
              });
            }
          } catch (err) {
            console.error("Backend Excel import error:", err);
            oImportModel.setProperty(
              "/statusMessage",
              "Import failed: " + err.message,
            );
            oImportModel.setProperty("/statusType", "Error");
            oImportModel.setProperty("/canImport", true);
            MessageBox.error("Backend Excel import failed: " + err.message);
          } finally {
            sap.ui.core.BusyIndicator.hide();
          }
        },

        /**
         * Clears the selected file and closes the import dialog.
         *
         * @returns {void}
         */
        onCancelImportOrders() {
          this._oSelectedImportFile = null;
          const oUploader = this.byId("orderFileUploader");
          if (oUploader) {
            oUploader.clear();
          }
          if (this._pImportOrdersDialog) {
            this._pImportOrdersDialog.then((oDialog) => oDialog.close());
          }
        },
      },
    );
  },
);
