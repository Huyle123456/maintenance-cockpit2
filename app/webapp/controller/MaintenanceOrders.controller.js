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

        /* =========================================================== */
        /* Lifecycle Methods                                           */
        /* =========================================================== */

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

        /* =========================================================== */
        /* Public: KPI Card Actions                                    */
        /* =========================================================== */

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
          const oUser = AuthService.getCurrentUser();
          if (oUser && !oUser.permissions?.createOrder) {
            MessageBox.warning(
              this.getView().getModel("i18n").getResourceBundle().getText("roleAdminRequired") ||
              "Action requires Administrator privileges."
            );
            return;
          }
          this._openCreateOrderDialog();
        },

        /* =========================================================== */
        /* Public: Filter Bar Actions                                  */
        /* =========================================================== */

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
         * @returns {void}
         */
        onFilterGo() {
          // Step 1: Read filter values from the FilterBar
          const sSearch = (this.byId("inpSearch")?.getValue() || "").trim().toLowerCase();

          const aSelectedEquipments =
            this.getView()
              .getModel("filters")
              ?.getProperty("/selectedEquipments") || [];

          const sPlant = this.byId("selPlant")?.getSelectedKey() || "All";
          const sStatus = this.byId("selStatus")?.getSelectedKey() || "All";
          const sPriority = this.byId("selPriority")?.getSelectedKey() || "All";
          const sType = this.byId("selMaintenanceType")?.getSelectedKey() || "All";
          const sPlanner = this.byId("selPlanner")?.getSelectedKey() || "All";
          const oDate = this.byId("dpScheduledDateFrom")?.getDateValue();
          const sDate = oDate ? oDate.toISOString().split("T")[0] : null;

          const sEquipmentType = (this.byId("inpEquipmentType")?.getValue() || "").trim().toLowerCase();
          const sCriticality = this.byId("selCriticality")?.getSelectedKey() || "All";
          const sLocation = (this.byId("inpLocation")?.getValue() || "").trim().toLowerCase();
          const sCreatedBy = (this.byId("inpCreatedBy")?.getValue() || "").trim().toLowerCase();
          const oActualStart = this.byId("dpActualStart")?.getDateValue();
          const sActualStart = oActualStart ? oActualStart.toISOString().split("T")[0] : null;
          const oActualEnd = this.byId("dpActualEnd")?.getDateValue();
          const sActualEnd = oActualEnd ? oActualEnd.toISOString().split("T")[0] : null;

          // Step 2: Filter the full dataset
          const aAll = this._aAllOrders || [];
          this._aFilteredOrders = aAll.filter((o) => {
            if (sSearch) {
              const matchOrder = (o.order || "").toLowerCase().includes(sSearch);
              const matchEq = (o.equipment || "").toLowerCase().includes(sSearch);
              const matchDesc = (o.description || "").toLowerCase().includes(sSearch);
              if (!matchOrder && !matchEq && !matchDesc) return false;
            }

            if (aSelectedEquipments.length > 0 && !aSelectedEquipments.includes(o.equipment)) {
              return false;
            }

            if (sPlant !== "All" && o.plant !== sPlant) return false;
            if (sStatus !== "All" && o.statusLabel !== sStatus && o.statusKey !== sStatus) return false;
            if (sPriority !== "All" && o.priority !== sPriority) return false;
            if (sType !== "All" && o.type !== sType) return false;
            if (sPlanner !== "All" && o.planner !== sPlanner) return false;
            if (sDate && o.scheduledFrom < sDate) return false;

            if (sCriticality !== "All" && o.priority !== sCriticality) return false;
            if (sLocation && !(o.location || "").toLowerCase().includes(sLocation)) return false;
            if (sCreatedBy && !(o.createdBy || "").toLowerCase().includes(sCreatedBy)) return false;
            if (sActualStart && (o.actualStart || o.scheduledFrom) < sActualStart) return false;
            if (sActualEnd && (o.actualEnd || o.scheduledTo) > sActualEnd) return false;

            return true;
          });

          // Step 3: Reset to page 1 and recalculate pagination
          const oPagination = this.getView().getModel("pagination");
          if (oPagination) {
            oPagination.setProperty("/currentPage", 1);
          }

          this._applyPagination();
        },

        /**
         * Clears all active filter conditions and restores
         * the full maintenance order dataset.
         *
         * @returns {void}
         */
        onFilterClear() {
          // Step 1: Reset search field
          this.byId("inpSearch")?.setValue("");

          // Step 2: Reset dropdown filters and value help selections
          this.getView()
            .getModel("filters")
            ?.setProperty("/selectedEquipments", []);
          this.byId("tblEqValueHelp")?.removeSelections(true);

          this.byId("selPlant")?.setSelectedKey("All");
          this.byId("selStatus")?.setSelectedKey("All");
          this.byId("selPriority")?.setSelectedKey("All");
          this.byId("selMaintenanceType")?.setSelectedKey("All");
          this.byId("selPlanner")?.setSelectedKey("All");

          // Step 3: Reset date and extra filter fields
          this.byId("dpScheduledDateFrom")?.setValue("");
          if (this.byId("inpEquipmentType")) this.byId("inpEquipmentType").setValue("");
          if (this.byId("selCriticality")) this.byId("selCriticality").setSelectedKey("All");
          if (this.byId("dpActualStart")) this.byId("dpActualStart").setValue("");
          if (this.byId("inpLocation")) this.byId("inpLocation").setValue("");
          if (this.byId("inpCreatedBy")) this.byId("inpCreatedBy").setValue("");
          if (this.byId("dpActualEnd")) this.byId("dpActualEnd").setValue("");

          // Step 4: Restore full dataset
          this._aFilteredOrders = (this._aAllOrders || []).slice();

          const oPagination = this.getView().getModel("pagination");
          if (oPagination) {
            oPagination.setProperty("/currentPage", 1);
          }

          const oKpiModel = this.getView().getModel("kpi");
          if (oKpiModel) {
            oKpiModel.setProperty("/activeFilterKey", "");
          }

          // Step 5: Recalculate pagination
          this._applyPagination();
        },

        /* =========================================================== */
        /* Public: Equipment Detail Panel                              */
        /* =========================================================== */

        /**
         * Opens the Equipment Detail panel for the
         * selected maintenance order.
         *
         * @param {sap.ui.base.Event} oEvent Press event
         * @returns {void}
         */
        onEquipmentPress(oEvent) {
          const oSource = oEvent.getSource();
          const oContext = oSource.getBindingContext("orders");

          if (!oContext) {
            return;
          }

          const oOrder = oContext.getObject();
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

        /* =========================================================== */
        /* Public: Mass Change Actions                                 */
        /* =========================================================== */

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
         * Opens the mass-change dialog for eligible selected orders with loading indicator.
         *
         * @returns {Promise<void>}
         */
        async onMassChangePress() {
          const oUser = AuthService.getCurrentUser();
          if (oUser && !oUser.permissions?.massChange) {
            MessageBox.warning(
              this.getView().getModel("i18n").getResourceBundle().getText("roleAdminRequired") ||
              "Action requires Administrator privileges."
            );
            return;
          }

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

          sap.ui.core.BusyIndicator.show(0);
          try {
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

            const oDialog = await this._pMassChangeDialog;
            oDialog.open();
          } finally {
            sap.ui.core.BusyIndicator.hide();
          }
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

          sap.ui.core.BusyIndicator.show(0);
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
          } finally {
            sap.ui.core.BusyIndicator.hide();
          }
        },

        /* =========================================================== */
        /* Public: Export Action                                       */
        /* =========================================================== */

        /**
         * Exports all currently filtered maintenance orders (across all pages)
         * to a CSV file with loading indicator.
         *
         * @returns {void}
         */
        onExportPress() {
          const aRows =
            this._aFilteredOrders && this._aFilteredOrders.length
              ? this._aFilteredOrders
              : [];

          if (!aRows.length) {
            MessageBox.information(
              this.getView()
                .getModel("i18n")
                .getResourceBundle()
                .getText("maintenanceOrdersExportNoData") || "No orders available to export.",
            );
            return;
          }

          sap.ui.core.BusyIndicator.show(0);

          setTimeout(() => {
            try {
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

              aRows.forEach((oRow) => {
                const cleanDesc = (oRow.description || "").replace(/"/g, '""');
                aCsvRows.push(
                  [
                    oRow.order || "",
                    oRow.equipment || "",
                    `"${cleanDesc}"`,
                    oRow.plant || "",
                    oRow.type || "",
                    oRow.priority || "",
                    oRow.statusLabel || oRow.status || "",
                    oRow.planner || "",
                    oRow.scheduledFrom || "",
                    oRow.scheduledTo || "",
                  ].join(","),
                );
              });

              const sCsvContent = "\uFEFF" + aCsvRows.join("\r\n");
              const oBlob = new Blob([sCsvContent], {
                type: "text/csv;charset=utf-8;",
              });

              const sFileName = `MaintenanceOrders_${new Date()
                .toISOString()
                .slice(0, 10)}.csv`;

              const oLink = document.createElement("a");
              oLink.href = URL.createObjectURL(oBlob);
              oLink.download = sFileName;
              document.body.appendChild(oLink);
              oLink.click();

              document.body.removeChild(oLink);
              setTimeout(() => URL.revokeObjectURL(oLink.href), 1000);

              MessageToast.show(`Exported ${aRows.length} order(s) successfully.`);
            } finally {
              sap.ui.core.BusyIndicator.hide();
            }
          }, 30);
        },

        /* =========================================================== */
        /* Public: Value Help Dialog                                   */
        /* =========================================================== */

        /**
         * Opens the Equipment Value Help dialog with loading indicator.
         *
         * @returns {Promise<void>}
         */
        async onEquipmentValueHelpPress() {
          sap.ui.core.BusyIndicator.show(0);
          try {
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

            this._initEquipmentValueHelpModel();
            const oDialog = await this._pEquipmentValueHelp;
            oDialog.open();

            const oTable = this.byId("tblEqValueHelp");
            const aSelectedEquipments =
              this.getView()
                .getModel("filters")
                ?.getProperty("/selectedEquipments") || [];

            if (oTable) {
              oTable.removeSelections(true);
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
            }
          } finally {
            sap.ui.core.BusyIndicator.hide();
          }
        },

        /**
         * Filters equipment records in the Equipment Value Help dialog.
         *
         * @param {sap.ui.base.Event} oEvent Search event
         * @returns {void}
         */
        onSearchEquipmentValueHelp(oEvent) {
          const sValue = oEvent.getParameter("newValue");
          const oTable = this.byId("tblEqValueHelp");
          const oBinding = oTable.getBinding("items");

          const oFilter = new Filter({
            filters: [
              new Filter("equipment", FilterOperator.Contains, sValue),
              new Filter("description", FilterOperator.Contains, sValue),
            ],
            and: false,
          });

          oBinding.filter(sValue ? [oFilter] : []);
        },

        /**
         * Applies the selected equipment from the Value Help dialog to the FilterBar.
         *
         * @returns {void}
         */
        onConfirmEquipmentValueHelp() {
          const oTable = this.byId("tblEqValueHelp");
          const aSelectedItems = oTable.getSelectedItems();

          if (!aSelectedItems.length) {
            return;
          }

          const aSelectedEquipments = aSelectedItems.map(
            (oItem) =>
              oItem.getBindingContext("equipmentVH").getObject().equipment,
          );

          this.getView()
            .getModel("filters")
            .setProperty("/selectedEquipments", aSelectedEquipments);

          this.onFilterGo();
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

        /* =========================================================== */
        /* Public: Adapt Filters Visibility                            */
        /* =========================================================== */

        /**
         * Opens the Adapt Filters dialog with loading indicator.
         *
         * @returns {Promise<void>}
         */
        async onAdaptFiltersPress() {
          sap.ui.core.BusyIndicator.show(0);
          try {
            const oCurrentConfig = this.getView()
              .getModel("filterConfig")
              .getData();

            this.getView().setModel(
              new JSONModel(JSON.parse(JSON.stringify(oCurrentConfig))),
              "filterConfigDraft",
            );

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

            const oDialog = await this._pAdaptFiltersDialog;
            oDialog.open();
          } finally {
            sap.ui.core.BusyIndicator.hide();
          }
        },

        /**
         * Applies the current Adapt Filters configuration and closes dialog.
         *
         * @returns {void}
         */
        onAdaptFiltersApply() {
          const oDraftData = this.getView()
            .getModel("filterConfigDraft")
            .getData();

          this.getView()
            .getModel("filterConfig")
            .setData(JSON.parse(JSON.stringify(oDraftData)));

          this.byId("adaptFiltersDialog").close();
        },

        /**
         * Closes the Adapt Filters dialog without applying any changes.
         *
         * @returns {void}
         */
        onAdaptFiltersCancel() {
          this.byId("adaptFiltersDialog").close();
        },

        /* =========================================================== */
        /* Public: Navigation to Order Detail                          */
        /* =========================================================== */

        /**
         * Navigates to the Maintenance Order Detail page with loading indicator.
         *
         * @param {sap.ui.base.Event} oEvent Press event
         * @returns {void}
         */
        onOrderPress(oEvent) {
          const oObjectIdentifier = oEvent.getSource();
          const oContext = oObjectIdentifier.getBindingContext("orders");

          if (!oContext) {
            return;
          }

          const sOrder = oContext.getProperty("order");
          if (!sOrder) {
            return;
          }

          sap.ui.core.BusyIndicator.show(0);

          setTimeout(() => {
            this.getOwnerComponent().getRouter().navTo("RouteOrderDetail", {
              orderId: sOrder,
            });
            sap.ui.core.BusyIndicator.hide();
          }, 60);
        },

        /* =========================================================== */
        /* Public: Pagination Actions                                  */
        /* =========================================================== */

        /**
         * Navigates to the first page.
         *
         * @returns {void}
         */
        onFirstPage() {
          const oPagination = this.getView().getModel("pagination");
          if (oPagination && oPagination.getProperty("/hasPrevious")) {
            oPagination.setProperty("/currentPage", 1);
            this._applyPagination();
          }
        },

        /**
         * Navigates to the previous page.
         *
         * @returns {void}
         */
        onPreviousPage() {
          const oPagination = this.getView().getModel("pagination");
          if (oPagination && oPagination.getProperty("/hasPrevious")) {
            const cur = oPagination.getProperty("/currentPage");
            oPagination.setProperty("/currentPage", cur - 1);
            this._applyPagination();
          }
        },

        /**
         * Navigates to the next page.
         *
         * @returns {void}
         */
        onNextPage() {
          const oPagination = this.getView().getModel("pagination");
          if (oPagination && oPagination.getProperty("/hasNext")) {
            const cur = oPagination.getProperty("/currentPage");
            oPagination.setProperty("/currentPage", cur + 1);
            this._applyPagination();
          }
        },

        /**
         * Navigates to the last page.
         *
         * @returns {void}
         */
        onLastPage() {
          const oPagination = this.getView().getModel("pagination");
          if (oPagination && oPagination.getProperty("/hasNext")) {
            const total = oPagination.getProperty("/totalPages");
            oPagination.setProperty("/currentPage", total);
            this._applyPagination();
          }
        },

        /**
         * Navigates to a specific clicked page number.
         *
         * @param {sap.ui.base.Event} oEvent Button press event
         * @returns {void}
         */
        onPagePress(oEvent) {
          const oContext = oEvent.getSource().getBindingContext("pagination");
          if (oContext) {
            const iPage = oContext.getProperty("page");
            this.getView()
              .getModel("pagination")
              .setProperty("/currentPage", iPage);
            this._applyPagination();
          }
        },

        /**
         * Updates the page size and resets to page 1.
         *
         * @param {sap.ui.base.Event} oEvent Select change event
         * @returns {void}
         */
        onPageSizeChange(oEvent) {
          const sKey = oEvent.getParameter("selectedItem")
            ? oEvent.getParameter("selectedItem").getKey()
            : oEvent.getSource().getSelectedKey();
          const oPagination = this.getView().getModel("pagination");
          oPagination.setProperty("/pageSize", parseInt(sKey, 10) || 10);
          oPagination.setProperty("/currentPage", 1);
          this._applyPagination();
        },

        /* =========================================================== */
        /* Public: Import Excel Actions                                */
        /* =========================================================== */

        /**
         * Opens the import-orders dialog with loading indicator.
         *
         * @returns {Promise<void>} Resolves after the dialog opens.
         */
        async onImportOrdersPress() {
          const oUser = AuthService.getCurrentUser();
          if (oUser && !oUser.permissions?.createOrder) {
            MessageBox.warning(
              this.getView().getModel("i18n").getResourceBundle().getText("roleAdminRequired") ||
              "Action requires Administrator privileges."
            );
            return;
          }

          sap.ui.core.BusyIndicator.show(0);
          try {
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
              isProcessing: false,
              progressPercent: 0,
              progressState: "Information",
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
          } finally {
            sap.ui.core.BusyIndicator.hide();
          }
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
          oImportModel.setProperty("/isProcessing", true);
          oImportModel.setProperty("/progressPercent", 5);
          oImportModel.setProperty("/progressState", "Information");
          oImportModel.setProperty(
            "/statusMessage",
            "Uploading file and initiating background processing...",
          );
          oImportModel.setProperty("/statusType", "Information");

          try {
            const result = await CAPService.importOrdersExcel(
              this._oSelectedImportFile,
              (progressInfo) => {
                const currentModel = this.getView().getModel("importModel");
                if (currentModel) {
                  currentModel.setProperty("/progressPercent", progressInfo.progress || 0);
                  if (progressInfo.message) {
                    currentModel.setProperty("/statusMessage", progressInfo.message);
                  }
                  if (progressInfo.progress >= 100) {
                    currentModel.setProperty("/progressState", "Success");
                  }
                }
              }
            );

            // Automatically close the import dialog immediately after completion
            this.onCancelImportOrders();

            // Automatically reload the orders list & refresh KPIs
            await this._reloadOrdersFromBackend();

            // Clear any active search filters to show the fresh imported list
            this.onFilterClear();

            let sMsg =
              `Import completed in ${result.durationSec || "1s"}!\n\n` +
              `• Total Orders Processed: ${result.totalRows}\n` +
              `• Total Imported / Synced: ${result.importedCount} maintenance order(s)\n`;

            if (result.createdCount !== undefined || result.updatedCount !== undefined) {
              sMsg += `  - Newly Created Orders: ${result.createdCount || 0}\n` +
                      `  - Updated (Upserted) Existing Orders: ${result.updatedCount || 0}\n`;
            }

            sMsg +=
              `• Operations Synced: ${result.operationsCount || result.importedCount} operation(s)\n` +
              `• Materials Linked: ${result.materialsCount || 0} item(s)\n`;

            if (result.warnings && result.warnings.length > 0) {
              sMsg += `\nAuto-Correction Notices (${result.warnings.length}):\n`;
              const maxDispWarn = Math.min(result.warnings.length, 5);
              for (let i = 0; i < maxDispWarn; i++) {
                const w = result.warnings[i];
                sMsg += `  • Line ${w.row} (${w.order}): ${w.message}\n`;
              }
              if (result.warnings.length > 5) {
                sMsg += `  ... and ${result.warnings.length - 5} more notice(s).\n`;
              }
            }

            if (result.failedCount > 0) {
              sMsg += `\n• Failed / Invalid Rows: ${result.failedCount}\n\nRow-by-Row Error Details:\n`;
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
                title: "Excel Import Successful",
              });
            }
          } catch (err) {
            console.error("Backend Excel import error:", err);
            const currentModel = this.getView().getModel("importModel");
            if (currentModel) {
              currentModel.setProperty("/isProcessing", false);
              currentModel.setProperty("/progressState", "Error");
              currentModel.setProperty(
                "/statusMessage",
                "Import failed: " + (err.message || err),
              );
              currentModel.setProperty("/statusType", "Error");
              currentModel.setProperty("/canImport", true);
            }
            MessageBox.error("Backend Excel import failed: " + (err.message || err));
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

        /* =========================================================== */
        /* Private / Internal Helper Methods                           */
        /* =========================================================== */

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

            this._aAllOrders = aOrderRows;
            this._aFilteredOrders = aOrderRows.slice();

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

            // Register Pagination model
            this.getView().setModel(
              new JSONModel({
                currentPage: 1,
                pageSize: 10,
                pageSizeOptions: [
                  { key: "5", text: "5 / page" },
                  { key: "10", text: "10 / page" },
                  { key: "20", text: "20 / page" },
                  { key: "50", text: "50 / page" },
                ],
                totalItems: aOrderRows.length,
                totalPages: Math.ceil(aOrderRows.length / 10) || 1,
                startIndex: aOrderRows.length > 0 ? 1 : 0,
                endIndex: Math.min(10, aOrderRows.length),
                hasPrevious: false,
                hasNext: aOrderRows.length > 10,
                pageButtons: [],
              }),
              "pagination",
            );

            // Load KPI metrics directly from database
            const oKpiDbData = await CAPService.getKpiMetrics();

            // Create KPI dashboard model
            this.getView().setModel(
              new JSONModel({
                openCount:
                  oKpiDbData && typeof oKpiDbData.openCount === "number"
                    ? oKpiDbData.openCount
                    : this._countOrdersByStatus(
                        aOrderRows,
                        constants.STATUS.OPEN,
                      ),
                inProcessCount:
                  oKpiDbData && typeof oKpiDbData.inProcessCount === "number"
                    ? oKpiDbData.inProcessCount
                    : this._countOrdersByStatus(
                        aOrderRows,
                        constants.STATUS.IN_PROCESS_DISPLAY,
                      ),
                criticalCount:
                  oKpiDbData && typeof oKpiDbData.criticalCount === "number"
                    ? oKpiDbData.criticalCount
                    : this._countOrdersByFlag(aOrderRows, "isCritical"),
                overdueCount:
                  oKpiDbData && typeof oKpiDbData.overdueCount === "number"
                    ? oKpiDbData.overdueCount
                    : this._countOrdersByFlag(aOrderRows, "isOverdue"),
                estimatedCost:
                  oKpiDbData && oKpiDbData.estimatedCost
                    ? oKpiDbData.estimatedCost
                    : formatter.calculateEstimatedCost(aOrderRows),
                activeFilterKey: "",
                visibleOrderCount:
                  oKpiDbData && typeof oKpiDbData.totalOrders === "number"
                    ? oKpiDbData.totalOrders
                    : aOrderRows.length,
              }),
              "kpi",
            );

            // Apply initial pagination
            this._applyPagination();

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

        /**
         * Loads and opens the Create Maintenance Order dialog with loading indicator.
         *
         * @returns {Promise<void>}
         */
        async _openCreateOrderDialog() {
          sap.ui.core.BusyIndicator.show(0);
          try {
            this._ensureDialogController();

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

            const oDialog = await this._pCreateOrderDialog;
            this._dialogController.initDialogState();
            oDialog.open();
          } finally {
            sap.ui.core.BusyIndicator.hide();
          }
        },

        /**
         * Creates the Create Maintenance Order dialog controller
         * if it does not already exist.
         *
         * @returns {void}
         */
        _ensureDialogController() {
          if (!this._dialogController) {
            this._dialogController = new CreateMaintenanceOrderDialog();
            this._dialogController.setParentController(this);
          }
        },

        /**
         * Builds the Equipment Detail model and displays the Equipment Detail panel.
         *
         * @param {object} oOrder Selected maintenance order
         * @returns {void}
         */
        _openEquipmentDetail(oOrder) {
          if (!oOrder) {
            return;
          }

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

          this.getView().setModel(oEquipmentDetailModel, "equipmentDetail");
          this.getView()
            .getModel("ui")
            .setProperty("/layout", "TwoColumnsMidExpanded");
        },

        /**
         * Applies or clears a KPI filter on the orders table.
         *
         * @param {string} sFilterKey Identifier for the active KPI filter.
         * @param {sap.ui.model.Filter} [oFilter] Deprecated filter param.
         * @returns {void}
         */
        _applyKpiFilter(sFilterKey, oFilter) {
          const oKpiModel = this.getView().getModel("kpi");
          const sActiveFilterKey = oKpiModel.getProperty("/activeFilterKey");
          const aAll = this._aAllOrders || [];

          if (sActiveFilterKey === sFilterKey) {
            this._aFilteredOrders = aAll.slice();
            this.byId("selStatus")?.setSelectedKey("All");
            this.byId("selPriority")?.setSelectedKey("All");
            oKpiModel.setProperty("/activeFilterKey", "");
          } else {
            oKpiModel.setProperty("/activeFilterKey", sFilterKey);

            if (sFilterKey === "STATUS_OPEN") {
              this._aFilteredOrders = aAll.filter(
                (r) =>
                  r.statusKey === constants.STATUS.OPEN ||
                  r.statusLabel === "OPEN",
              );
            } else if (sFilterKey === "STATUS_IN_PROCESS") {
              this._aFilteredOrders = aAll.filter(
                (r) =>
                  r.statusKey === constants.STATUS.IN_PROCESS_DISPLAY ||
                  r.statusLabel === "IN PROCESS",
              );
            } else if (sFilterKey === "PRIORITY_CRITICAL") {
              this._aFilteredOrders = aAll.filter(
                (r) => r.isCritical === true || r.priority === "CRITICAL",
              );
            } else if (sFilterKey === "OVERDUE") {
              this._aFilteredOrders = aAll.filter((r) => r.isOverdue === true);
            } else {
              this._aFilteredOrders = aAll.slice();
            }
          }

          const oPagination = this.getView().getModel("pagination");
          if (oPagination) {
            oPagination.setProperty("/currentPage", 1);
          }

          this._applyPagination();
        },

        /**
         * Applies client-side pagination to the filtered orders list.
         *
         * @returns {void}
         */
        _applyPagination() {
          const oPaginationModel = this.getView().getModel("pagination");
          if (!oPaginationModel) {
            return;
          }

          const oTable = this.byId("ordersTable");
          if (oTable) {
            oTable.setBusyIndicatorDelay(0);
            oTable.setBusy(true);
          }

          const iPageSize =
            parseInt(oPaginationModel.getProperty("/pageSize"), 10) || 10;
          const aFiltered = this._aFilteredOrders || [];
          const iTotalItems = aFiltered.length;
          const iTotalPages = Math.max(1, Math.ceil(iTotalItems / iPageSize));
          let iCurrentPage =
            parseInt(oPaginationModel.getProperty("/currentPage"), 10) || 1;

          if (iCurrentPage > iTotalPages) {
            iCurrentPage = iTotalPages;
          }
          if (iCurrentPage < 1) {
            iCurrentPage = 1;
          }

          const iStartIndex =
            iTotalItems === 0 ? 0 : (iCurrentPage - 1) * iPageSize + 1;
          const iEndIndex = Math.min(iTotalItems, iCurrentPage * iPageSize);

          const aPagedRows = aFiltered.slice(
            (iCurrentPage - 1) * iPageSize,
            iCurrentPage * iPageSize,
          );

          // Build dynamic page buttons (up to 5 page window)
          const aPageButtons = [];
          let iStartP = Math.max(1, iCurrentPage - 2);
          let iEndP = Math.min(iTotalPages, iStartP + 4);
          if (iEndP - iStartP < 4) {
            iStartP = Math.max(1, iEndP - 4);
          }
          for (let p = iStartP; p <= iEndP; p++) {
            aPageButtons.push({
              page: p,
              text: String(p),
              current: p === iCurrentPage,
            });
          }

          oPaginationModel.setProperty("/currentPage", iCurrentPage);
          oPaginationModel.setProperty("/totalPages", iTotalPages);
          oPaginationModel.setProperty("/totalItems", iTotalItems);
          oPaginationModel.setProperty("/startIndex", iStartIndex);
          oPaginationModel.setProperty("/endIndex", iEndIndex);
          oPaginationModel.setProperty("/hasPrevious", iCurrentPage > 1);
          oPaginationModel.setProperty("/hasNext", iCurrentPage < iTotalPages);
          oPaginationModel.setProperty("/pageButtons", aPageButtons);

          const oOrdersModel = this.getView().getModel("orders");
          if (oOrdersModel) {
            oOrdersModel.setProperty("/rows", aPagedRows);
            oOrdersModel.refresh(true);
          }

          const oKpiModel = this.getView().getModel("kpi");
          if (oKpiModel) {
            oKpiModel.setProperty("/visibleOrderCount", iTotalItems);
            // Only override estimatedCost if a specific filter is currently active
            if (this._sActiveKpiKey || (this._aAllOrders && aFiltered && aFiltered.length < this._aAllOrders.length)) {
              oKpiModel.setProperty(
                "/estimatedCost",
                formatter.calculateEstimatedCost(aFiltered),
              );
            }
          }

          setTimeout(() => {
            if (oTable) {
              oTable.setBusy(false);
            }
          }, 80);
        },

        /**
         * Refreshes KPI counters after order data changes by querying backend DB.
         *
         * @param {object[]} [aExplicitRows] Optional order collection for local fallback.
         * @returns {Promise<void>}
         */
        async _refreshKpiCounts(aExplicitRows) {
          const oKpiModel = this.getView().getModel("kpi");
          if (!oKpiModel) {
            return;
          }

          try {
            const oKpiDbData = await CAPService.getKpiMetrics();
            if (oKpiDbData && typeof oKpiDbData.openCount === "number") {
              oKpiModel.setProperty("/openCount", oKpiDbData.openCount);
              oKpiModel.setProperty("/inProcessCount", oKpiDbData.inProcessCount);
              oKpiModel.setProperty("/criticalCount", oKpiDbData.criticalCount);
              oKpiModel.setProperty("/overdueCount", oKpiDbData.overdueCount);
              oKpiModel.setProperty("/estimatedCost", oKpiDbData.estimatedCost);
              oKpiModel.setProperty("/visibleOrderCount", oKpiDbData.totalOrders);
              return;
            }
          } catch (e) {
            console.warn("[MaintenanceOrders] Could not refresh KPI from DB, falling back to local calculation:", e);
          }

          const aRows =
            aExplicitRows ||
            (this.getView().getModel("orders")
              ? this.getView().getModel("orders").getProperty("/rows")
              : []) ||
            [];

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

        /**
         * Builds FilterBar dropdown values from
         * maintenance order data.
         *
         * @param {object[]} aRows Maintenance order collection
         * @returns {void}
         */
        _initFilterData(aRows) {
          const unique = (aValues) => [...new Set(aValues)];

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

          this.getView().setModel(oFilterModel, "filters");
        },

        /**
         * Initializes the mass-change model with default values.
         *
         * @returns {void}
         */
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
         * Initializes the Equipment Value Help model.
         *
         * Creates a unique equipment list from
         * maintenance order data.
         *
         * @returns {void}
         */
        _initEquipmentValueHelpModel() {
          const aRows =
            this.getView().getModel("orders").getProperty("/rows") || [];

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
         * @returns {void}
         */
        _initFilterConfigModel() {
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

        /**
         * Counts maintenance orders matching the specified status value.
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
         * Counts rows where the specified boolean flag is true.
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
            this._aAllOrders = aOrderRows;
            this._aFilteredOrders = aOrderRows.slice();

            this._refreshKpiCounts(aOrderRows);
            this._initFilterData(aOrderRows);
            this._applyPagination();
          } catch (err) {
            console.error("Failed to reload orders from backend:", err);
          }
        },
      },
    );
  },
);
