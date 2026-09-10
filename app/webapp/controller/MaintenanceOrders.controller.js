sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/UIComponent",
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
    UIComponent,
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
                .getText("maintenanceOrdersExportNoData"),
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
         * @param {sap.ui.base.Event|string} oEvent Press event or direct order ID string.
         * @returns {void}
         */
        onOrderPress(oEvent) {
          let sOrder = "";
          if (typeof oEvent === "string") {
            sOrder = oEvent;
          } else if (oEvent && typeof oEvent.getParameter === "function" && oEvent.getParameter("orderId")) {
            sOrder = oEvent.getParameter("orderId");
          } else if (oEvent && typeof oEvent.getSource === "function") {
            const oSource = oEvent.getSource();
            const oContext = oSource.getBindingContext("orders") || oSource.getBindingContext();
            if (oContext) {
              sOrder = oContext.getProperty("order") || oContext.getProperty("order_no");
            }
            if (!sOrder && typeof oSource.getTitle === "function") {
              sOrder = oSource.getTitle();
            }
            if (!sOrder && typeof oSource.getText === "function") {
              const sText = oSource.getText();
              if (sText && sText.startsWith("MO-")) {
                sOrder = sText;
              }
            }
          }

          if (!sOrder) {
            console.warn("[MaintenanceOrders] Could not resolve order ID for navigation:", oEvent);
            return;
          }

          sap.ui.core.BusyIndicator.show(0);

          try {
            const oRouter =
              UIComponent.getRouterFor(this) ||
              (typeof this.getOwnerComponent === "function" && this.getOwnerComponent()?.getRouter());

            if (oRouter) {
              oRouter.navTo("RouteOrderDetail", {
                orderId: sOrder,
              });
            } else {
              console.error("[MaintenanceOrders] Router not found for detail navigation");
            }
          } catch (err) {
            console.error("[MaintenanceOrders] Failed to navigate to order detail:", err);
          } finally {
            setTimeout(() => {
              sap.ui.core.BusyIndicator.hide();
            }, 100);
          }
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
          const oI18n = this.getView().getModel("i18n").getResourceBundle();
          const oUser = AuthService.getCurrentUser();
          if (oUser && !oUser.permissions?.createOrder) {
            MessageBox.warning(oI18n.getText("roleAdminRequired"));
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
              statusText: oI18n.getText("importOrdersStatusWaitingForFile"),
              statusState: "None",
              canImport: false,
              isProcessing: false,
              progressPercent: 0,
              progressState: "Information",
              statusMessage: oI18n.getText("importOrdersChooseFilePrompt"),
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
            const downloadUrl = CAPService.getDirectUrl("/api/maintenance/download-template");
            window.open(downloadUrl, "_blank");
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

          const oI18n = this.getView().getModel("i18n").getResourceBundle();
          if (!bIsExcel) {
            this._oSelectedImportFile = null;
            oImportModel.setProperty("/fileName", oFile.name);
            oImportModel.setProperty(
              "/fileSize",
              (oFile.size / 1024).toFixed(1) + " KB",
            );
            oImportModel.setProperty("/statusText", oI18n.getText("importOrdersUnsupportedFormat"));
            oImportModel.setProperty("/statusState", "Error");
            oImportModel.setProperty(
              "/statusMessage",
              oI18n.getText("importOrdersFileFormatError"),
            );
            oImportModel.setProperty("/statusType", "Error");
            oImportModel.setProperty("/canImport", false);
            return;
          }

          this._oSelectedImportFile = oFile;
          const sSize = (oFile.size / 1024).toFixed(1) + " KB";
          oImportModel.setProperty("/fileName", oFile.name);
          oImportModel.setProperty("/fileSize", sSize);
          oImportModel.setProperty("/statusText", oI18n.getText("importOrdersReadyToProcess"));
          oImportModel.setProperty("/statusState", "Success");
          oImportModel.setProperty(
            "/statusMessage",
            oI18n.getText("importOrdersFileSelectedMsg", [sSize, oI18n.getText("importOrdersBtnUpload")]),
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
          const oI18n = this.getView().getModel("i18n").getResourceBundle();
          if (!this._oSelectedImportFile) {
            MessageToast.show(oI18n.getText("importOrdersSelectFilePrompt"));
            return;
          }

          const oImportModel = this.getView().getModel("importModel");
          oImportModel.setProperty("/canImport", false);
          oImportModel.setProperty("/isProcessing", true);
          oImportModel.setProperty("/progressPercent", 5);
          oImportModel.setProperty("/progressState", "Information");
          oImportModel.setProperty(
            "/statusMessage",
            oI18n.getText("importOrdersUploadingMsg"),
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

            // Automatically reload the orders list & refresh KPIs if any rows were successfully imported
            if (result.importedCount > 0) {
              await this._reloadOrdersFromBackend();
              this.onFilterClear();
            }

            if (result.failedCount > 0) {
              this._lastImportErrorData = {
                base64: result.errorFileBase64,
                fileName: result.errorFileName || "MaintenanceOrders_Errors.xlsx",
                url: result.errorDownloadUrl,
                errors: result.errors
              };

              const oModel = this.getView().getModel("importModel");
              if (oModel) {
                oModel.setProperty("/hasErrors", true);
                oModel.setProperty("/failedCount", result.failedCount);
              }

              let sMsg = "";
              if (result.importedCount > 0) {
                sMsg +=
                  oI18n.getText("importOrdersPartialSuccessHeader") + "\n\n" +
                  oI18n.getText("importOrdersSuccessSavedCount", [result.importedCount]) + "\n" +
                  oI18n.getText("importOrdersCreatedCount", [result.createdCount || 0]) + "\n" +
                  oI18n.getText("importOrdersUpdatedCount", [result.updatedCount || 0]) + "\n" +
                  oI18n.getText("importOrdersOperationsCount", [result.operationsCount || 0]) + "\n" +
                  oI18n.getText("importOrdersMaterialsCount", [result.materialsCount || 0]) + "\n\n" +
                  oI18n.getText("importOrdersErrorRowsCount", [result.failedCount]) + "\n\n" +
                  oI18n.getText("importOrdersErrorListSample") + "\n";
              } else {
                sMsg +=
                  oI18n.getText("importOrdersAllRowsFailed", [result.failedCount]) + "\n\n" +
                  oI18n.getText("importOrdersErrorListSample") + "\n";
              }

              const maxDisplay = Math.min((result.errors || []).length, 6);
              for (let i = 0; i < maxDisplay; i++) {
                const errItem = result.errors[i];
                const sOrderRef = errItem.order && !String(errItem.order).startsWith("Line") && !String(errItem.order).startsWith("Dòng")
                  ? ` [${errItem.order}]`
                  : "";
                sMsg += oI18n.getText("importOrdersErrorRowItem", [errItem.row, sOrderRef, errItem.error]) + "\n";
              }
              if ((result.errors || []).length > 6) {
                sMsg += oI18n.getText("importOrdersMoreErrorsCount", [result.errors.length - 6]) + "\n";
              }

              sMsg += "\n" + oI18n.getText("importOrdersDownloadErrorFilePrompt", [result.failedCount]);

              const sBtnDownload = oI18n.getText("importOrdersActionDownloadErrors");
              const sTitle = result.importedCount > 0
                ? oI18n.getText("importOrdersPartialSuccessTitle")
                : oI18n.getText("importOrdersFailedTitle");

              MessageBox.show(sMsg, {
                icon: result.importedCount > 0 ? MessageBox.Icon.WARNING : MessageBox.Icon.ERROR,
                title: sTitle,
                actions: [sBtnDownload, MessageBox.Action.CLOSE],
                emphasizedAction: sBtnDownload,
                onClose: (sAction) => {
                  if (sAction === sBtnDownload) {
                    this.onDownloadErrorRowsFile();
                  }
                }
              });
            } else {
              // 100% success without errors
              let sMsg =
                oI18n.getText("importOrdersSuccessFullMsg", [result.importedCount, result.durationSec || "1s"]) + "\n\n" +
                oI18n.getText("importOrdersTotalProcessed", [result.totalRows]) + "\n" +
                oI18n.getText("importOrdersCreatedCount", [result.createdCount || 0]) + "\n" +
                oI18n.getText("importOrdersUpdatedCount", [result.updatedCount || 0]) + "\n" +
                oI18n.getText("importOrdersOperationsCount", [result.operationsCount || 0]) + "\n" +
                oI18n.getText("importOrdersMaterialsCount", [result.materialsCount || 0]) + "\n\n" +
                oI18n.getText("importOrdersAllDataSavedMsg");

              MessageBox.success(sMsg, {
                title: oI18n.getText("importOrdersSuccessTitle"),
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
                oI18n.getText("importOrdersParsingError", [err.message || err]),
              );
              currentModel.setProperty("/statusType", "Error");
              currentModel.setProperty("/canImport", true);
            }
            MessageBox.error(oI18n.getText("importOrdersParsingError", [err.message || err]));
          }
        },

        /**
         * Downloads an Excel spreadsheet containing only the error rows from the latest import.
         */
        onDownloadErrorRowsFile() {
          const oI18n = this.getView().getModel("i18n").getResourceBundle();
          if (!this._lastImportErrorData) {
            MessageToast.show(oI18n.getText("importOrdersNoErrorsData"));
            return;
          }
          const { base64, fileName, url } = this._lastImportErrorData;
          const sTargetFileName = fileName || "MaintenanceOrders_Errors.xlsx";
          if (base64) {
            try {
              const byteCharacters = atob(base64);
              const byteNumbers = new Array(byteCharacters.length);
              for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
              }
              const byteArray = new Uint8Array(byteNumbers);
              const blob = new Blob([byteArray], {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              });
              const downloadUrl = window.URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.style.display = "none";
              a.href = downloadUrl;
              a.download = sTargetFileName;
              document.body.appendChild(a);
              a.click();
              window.URL.revokeObjectURL(downloadUrl);
              document.body.removeChild(a);
              MessageToast.show(oI18n.getText("importOrdersErrorDownloadSuccess", [sTargetFileName]));
              return;
            } catch (err) {
              console.warn("Base64 error download failed, fallback to url:", err);
            }
          }

          if (url) {
            const a = document.createElement("a");
            a.style.display = "none";
            a.href = url;
            a.download = sTargetFileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            MessageToast.show(oI18n.getText("importOrdersDownloadingFromServer"));
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
            this._oKpiDbData = oKpiDbData;

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

          const oKpiModel = this.getView().getModel("kpi");
          const bHasCustomFilter = this._hasActiveCustomFilters();
          const sActiveKpiKey = oKpiModel ? oKpiModel.getProperty("/activeFilterKey") : "";
          const bIsDefaultState = !bHasCustomFilter && (!sActiveKpiKey || sActiveKpiKey === "");

          const iDisplayTotal =
            bIsDefaultState &&
            this._oKpiDbData &&
            typeof this._oKpiDbData.totalOrders === "number"
              ? this._oKpiDbData.totalOrders
              : iTotalItems;

          oPaginationModel.setProperty("/currentPage", iCurrentPage);
          oPaginationModel.setProperty("/totalPages", iTotalPages);
          oPaginationModel.setProperty("/totalItems", iDisplayTotal);
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

          if (oKpiModel) {
            if (bIsDefaultState) {
              const iDbTotal =
                this._oKpiDbData &&
                typeof this._oKpiDbData.totalOrders === "number"
                  ? this._oKpiDbData.totalOrders
                  : iTotalItems;
              oKpiModel.setProperty("/visibleOrderCount", iDbTotal);
              if (this._oKpiDbData && this._oKpiDbData.estimatedCost) {
                oKpiModel.setProperty(
                  "/estimatedCost",
                  this._oKpiDbData.estimatedCost,
                );
              }
            } else if (!bHasCustomFilter && sActiveKpiKey) {
              let iCount = iTotalItems;
              let sCost = formatter.calculateEstimatedCost(aFiltered);
              if (this._oKpiDbData) {
                if (sActiveKpiKey === "STATUS_OPEN") {
                  iCount = this._oKpiDbData.openCount ?? iTotalItems;
                } else if (sActiveKpiKey === "STATUS_IN_PROCESS") {
                  iCount = this._oKpiDbData.inProcessCount ?? iTotalItems;
                } else if (sActiveKpiKey === "PRIORITY_CRITICAL") {
                  iCount = this._oKpiDbData.criticalCount ?? iTotalItems;
                  if (typeof this._oKpiDbData.criticalCount === "number") {
                    const iCritTotal = this._oKpiDbData.criticalCount * 15000;
                    if (iCritTotal >= 1000000000) {
                      sCost = `$${(iCritTotal / 1000000000).toFixed(1)}B`;
                    } else if (iCritTotal >= 1000000) {
                      sCost = `$${(iCritTotal / 1000000).toFixed(1)}M`;
                    } else {
                      sCost = `$${(iCritTotal / 1000).toFixed(1)}K`;
                    }
                  }
                } else if (sActiveKpiKey === "OVERDUE") {
                  iCount = this._oKpiDbData.overdueCount ?? iTotalItems;
                }
              }
              oKpiModel.setProperty("/visibleOrderCount", iCount);
              oKpiModel.setProperty("/estimatedCost", sCost);
            } else {
              oKpiModel.setProperty("/visibleOrderCount", iTotalItems);
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
         * Checks whether any FilterBar filter or custom search query is actively applied.
         *
         * @returns {boolean} True if a custom filter condition is active.
         */
        _hasActiveCustomFilters() {
          const sSearch = (this.byId("inpSearch")?.getValue() || "").trim();
          const sPlant = this.byId("selPlant")?.getSelectedKey() || "All";
          const sStatus = this.byId("selStatus")?.getSelectedKey() || "All";
          const sPriority = this.byId("selPriority")?.getSelectedKey() || "All";
          const sType =
            this.byId("selMaintenanceType")?.getSelectedKey() || "All";
          const sPlanner = this.byId("selPlanner")?.getSelectedKey() || "All";
          const oDate = this.byId("dpScheduledDateFrom")?.getDateValue();
          const sEqType = (
            this.byId("inpEquipmentType")?.getValue() || ""
          ).trim();
          const sCrit = this.byId("selCriticality")?.getSelectedKey() || "All";
          const sLoc = (this.byId("inpLocation")?.getValue() || "").trim();
          const sCreated = (this.byId("inpCreatedBy")?.getValue() || "").trim();
          const oActualStart = this.byId("dpActualStart")?.getDateValue();
          const oActualEnd = this.byId("dpActualEnd")?.getDateValue();
          const aSelectedEquipments =
            this.getView()
              .getModel("filters")
              ?.getProperty("/selectedEquipments") || [];

          return Boolean(
            sSearch ||
              sPlant !== "All" ||
              sStatus !== "All" ||
              sPriority !== "All" ||
              sType !== "All" ||
              sPlanner !== "All" ||
              oDate ||
              sEqType ||
              sCrit !== "All" ||
              sLoc ||
              sCreated ||
              oActualStart ||
              oActualEnd ||
              aSelectedEquipments.length > 0,
          );
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
              this._oKpiDbData = oKpiDbData;
              oKpiModel.setProperty("/openCount", oKpiDbData.openCount);
              oKpiModel.setProperty(
                "/inProcessCount",
                oKpiDbData.inProcessCount,
              );
              oKpiModel.setProperty("/criticalCount", oKpiDbData.criticalCount);
              oKpiModel.setProperty("/overdueCount", oKpiDbData.overdueCount);
              oKpiModel.setProperty("/estimatedCost", oKpiDbData.estimatedCost);
              oKpiModel.setProperty(
                "/visibleOrderCount",
                oKpiDbData.totalOrders,
              );
              const oPagination = this.getView().getModel("pagination");
              if (oPagination && !this._hasActiveCustomFilters()) {
                oPagination.setProperty("/totalItems", oKpiDbData.totalOrders);
              }
              return;
            }
          } catch (e) {
            console.warn(
              "[MaintenanceOrders] Could not refresh KPI from DB, falling back to local calculation:",
              e,
            );
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
