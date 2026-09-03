sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/ui/core/Fragment",
    "sap/m/MessageToast",
    "com/fsoft/zpmmaintenancecockpit/model/AuditHistoryService",
    "com/fsoft/zpmmaintenancecockpit/model/formatter",
    "com/fsoft/zpmmaintenancecockpit/model/OrderRepository",
    "com/fsoft/zpmmaintenancecockpit/model/constants",
    "com/fsoft/zpmmaintenancecockpit/model/CAPService",
  ],
  (
    Controller,
    JSONModel,
    Filter,
    FilterOperator,
    Fragment,
    MessageToast,
    AuditHistoryService,
    formatter,
    OrderRepository,
    constants,
    CAPService,
  ) => {
    "use strict";

    return Controller.extend(
      "com.fsoft.zpmmaintenancecockpit.controller.MaintenanceOrderDetail",
      {
        formatter: formatter,
        /**
         * Initializes the controller, models,
         * router events, and master data.
         *
         * @returns {void}
         */
        onInit() {
          // Step 1: Create order detail model
          const oDetailModel = new JSONModel({
            order: "",
            description: "",
            equipment: "",
            plant: "",
            type: "",
            priority: "",
            status: "",
            planner: "",
            scheduledFrom: "",
            scheduledTo: "",
            scheduled: "",
            location: "",
            workCenter: "",
            createdBy: "",
            createdAt: "",
            etag: "",
            dirtyState: "NO",
            operationCount: 0,
            completedOperationCount: 0,
            plannedHours: 0,
            actualHours: 0,
            estimatedCost: 0,
            currency: "",
            canSubmit: false,
            canComplete: false,
          });

          this.getView().setModel(oDetailModel, "orderDetail");

          // Step 2: Load master data from CAP
          CAPService.getMasterData().then(oMasterData => {
            this.getView().setModel(new JSONModel(oMasterData), "masterData");
          }).catch(err => {
            console.error("Failed to load master data from CAP:", err);
          });

          // Step 3: Load technician data from CAP
          CAPService.getTechnicians().then(oTechData => {
            this.getView().setModel(new JSONModel(oTechData), "technicianData");
            this.getView().setModel(new JSONModel(oTechData.technicianCatalog || []), "techCatalog");
          }).catch(err => {
            console.error("Failed to load technician data from CAP:", err);
          });

          // Step 4: Register route pattern matched event
          const oRouter = this.getOwnerComponent().getRouter();

          const oRoute = oRouter.getRoute("RouteOrderDetail");

          if (oRoute) {
            oRoute.attachPatternMatched(this._onOrderMatched, this);
          }
        },

        // =========================================================
        // Navigation
        // =========================================================

        /**
         * Navigates back to the Maintenance Orders page.
         *
         * @returns {void}
         */
        onBack() {
          this.getOwnerComponent().getRouter().navTo("RouteMaintenanceOrders");
        },

        // =========================================================
        // Actions
        // =========================================================

        /**
         * Opens the Edit Order dialog.
         *
         * Loads the dialog lazily and initializes
         * the edit model with current order data.
         *
         * @returns {void}
         */
        onEdit() {
          // Step 1: Load dialog if required
          const oView = this.getView();

          if (!this._pEditOrderDialog) {
            this._pEditOrderDialog = Fragment.load({
              id: oView.getId(),
              name: "com.fsoft.zpmmaintenancecockpit.view.fragment.EditOrderDialog",
              controller: this,
            }).then((oDialog) => {
              oView.addDependent(oDialog);

              return oDialog;
            });
          }

          // Step 2: Initialize edit model
          this._pEditOrderDialog.then((oDialog) => {
            const oDetailData = this.getView()
              .getModel("orderDetail")
              .getData();

            const oModel = new JSONModel({
              planner: oDetailData.planner,
              priority: oDetailData.priority,
              scheduledFrom: oDetailData.scheduledFrom || "",
              scheduledTo: oDetailData.scheduledTo || "",
            });

            this.getView().setModel(oModel, "editOrder");

            // Step 3: Open dialog
            oDialog.open();
          });
        },

        /**
         * Closes the Edit Order dialog.
         *
         * @returns {void}
         */
        onCancelEditOrder() {
          this._pEditOrderDialog.then((oDialog) => {
            oDialog.close();
          });
        },

        /**
         * Saves order changes and creates
         * history and audit log entries on CAP backend.
         *
         * @returns {void}
         */
        async onConfirmEditOrder() {
          this._pEditOrderDialog.then(async (oDialog) => {
            const oEditData = this.getView().getModel("editOrder").getData();
            const oDetailModel = this.getView().getModel("orderDetail");
            const sOrderNo = oDetailModel.getProperty("/order");

            // Validation: CRITICAL orders must have the same start and end date
            if (oEditData.priority === "CRITICAL" && oEditData.scheduledFrom !== oEditData.scheduledTo) {
              MessageToast.show(
                this.getView()
                  .getModel("i18n")
                  .getResourceBundle()
                  .getText("ruleCriticalOrderSchedule")
              );
              return;
            }

            try {
              // Update on CAP backend
              await CAPService.updateOrder(sOrderNo, {
                planner: oEditData.planner,
                priority: oEditData.priority,
                scheduled_from: oEditData.scheduledFrom,
                scheduled_to: oEditData.scheduledTo,
              });

              // Update local model
              oDetailModel.setProperty("/planner", oEditData.planner);
              oDetailModel.setProperty("/priority", oEditData.priority);
              oDetailModel.setProperty("/scheduledFrom", oEditData.scheduledFrom);
              oDetailModel.setProperty("/scheduledTo", oEditData.scheduledTo);

              if (oEditData.scheduledFrom && oEditData.scheduledTo) {
                oDetailModel.setProperty(
                  "/scheduled",
                  `${oEditData.scheduledFrom} - ${oEditData.scheduledTo}`,
                );
              }

              const sDetails = `Priority: ${oEditData.priority}, Planner: ${oEditData.planner}`;

              this._addHistoryLog(
                "Order updated",
                sDetails,
                "Current User",
                "sap-icon://edit",
              );

              AuditHistoryService.addEntry(
                sOrderNo,
                "UPDATE",
                sDetails,
                "Current User",
              );

              MessageToast.show(
                this.getView()
                  .getModel("i18n")
                  .getResourceBundle()
                  .getText("orderDetailUpdateSuccess"),
              );

              oDialog.close();
            } catch (err) {
              console.error("Failed to update order on CAP:", err);
              MessageToast.show("Update failed: " + err.message);
            }
          });
        },


        /**
         * Submits the maintenance order via CAP backend.
         *
         * Changes status from OPEN to IN_PROCESS.
         *
         * @returns {void}
         */
        async onSubmit() {
          const oDetailModel = this.getView().getModel("orderDetail");
          const sOrderNo = oDetailModel.getProperty("/order");

          if (oDetailModel.getProperty("/status") !== constants.STATUS.OPEN) {
            MessageToast.show(
              this.getView()
                .getModel("i18n")
                .getResourceBundle()
                .getText("orderDetailSubmitOnlyOpen"),
            );
            return;
          }

          try {
            // Update order on CAP backend
            await CAPService.updateOrder(sOrderNo, {
              status: constants.STATUS.IN_PROCESS,
              status_state: "Warning",
            });

            // Update order status in local model
            oDetailModel.setProperty("/status", constants.STATUS.IN_PROCESS);
            oDetailModel.setProperty("/canSubmit", false);
            oDetailModel.setProperty("/canComplete", true);

            const oRepositoryOrder = OrderRepository.getOrderById(sOrderNo);
            if (oRepositoryOrder) {
              oRepositoryOrder.status = constants.STATUS.IN_PROCESS;
              oRepositoryOrder.statusLabel = constants.STATUS.IN_PROCESS;
            }

            this._addHistoryLog(
              `Status changed to ${constants.STATUS.IN_PROCESS}`,
              "Maintenance order submitted for execution",
              "Current User",
              "sap-icon://activate",
            );

            AuditHistoryService.addEntry(
              sOrderNo,
              "UPDATE",
              `Status changed from ${constants.STATUS.OPEN} to ${constants.STATUS.IN_PROCESS}`,
              "Current User",
            );

            MessageToast.show(
              this.getView()
                .getModel("i18n")
                .getResourceBundle()
                .getText("orderDetailSubmitSuccess"),
            );
          } catch (err) {
            console.error("Failed to submit order to CAP:", err);
            MessageToast.show("Submit failed: " + err.message);
          }
        },

        /**
         * Completes the maintenance order via CAP backend action completeOrder.
         *
         * Completion is only allowed when all
         * operations are COMPLETED.
         *
         * @returns {void}
         */
        async onComplete() {
          const oDetailModel = this.getView().getModel("orderDetail");
          const aOperations = oDetailModel.getProperty("/operations") || [];

          // Rule 1: All operations must be COMPLETED
          const bAllCompleted = aOperations.length > 0 && aOperations.every(
            (op) => op.status === constants.STATUS.COMPLETED
          );

          // Rule 2: Actual hours <= Planned hours * 2
          const iActual = Number(oDetailModel.getProperty("/actualHours")) || 0;
          const iPlanned = Number(oDetailModel.getProperty("/plannedHours")) || 0;
          const bHoursValid = iActual <= (iPlanned * 2);

          // Rule 3: Critical orders scheduled within 24 hours
          let bScheduleValid = true;
          if (oDetailModel.getProperty("/priority") === constants.PRIORITY.CRITICAL) {
             const sStart = oDetailModel.getProperty("/scheduledFrom");
             const sEnd = oDetailModel.getProperty("/scheduledTo");
             if (sStart && sEnd) {
                 const dStart = new Date(sStart);
                 const dEnd = new Date(sEnd);
                 if ((dEnd - dStart) > 24 * 60 * 60 * 1000) {
                     bScheduleValid = false;
                 }
             } else {
                 bScheduleValid = false;
             }
          }

          if (!bAllCompleted || !bHoursValid || !bScheduleValid) {
            const aErrors = [];
            const oResourceBundle = this.getView().getModel("i18n").getResourceBundle();

            if (!bAllCompleted) {
              aErrors.push(oResourceBundle.getText("ruleAllCompleted"));
            }
            if (!bHoursValid) {
              aErrors.push(oResourceBundle.getText("ruleHoursValid"));
            }
            if (!bScheduleValid) {
              aErrors.push(oResourceBundle.getText("ruleScheduleValid"));
            }

            sap.ui.require(["sap/m/MessageBox"], (MessageBox) => {
              MessageBox.error(aErrors.join("\n"), {
                title: oResourceBundle.getText("warning") || "Warning"
              });
            });
            return;
          }

          const sOrderNo = oDetailModel.getProperty("/order");

          try {
            // Call CAP completeOrder Custom Action
            await CAPService.completeOrder(sOrderNo);

            oDetailModel.setProperty("/status", constants.STATUS.COMPLETED);
            oDetailModel.setProperty("/canComplete", false);

            const oRepositoryOrder = OrderRepository.getOrderById(sOrderNo);
            if (oRepositoryOrder) {
              oRepositoryOrder.status = constants.STATUS.COMPLETED;
              oRepositoryOrder.statusLabel = constants.STATUS.COMPLETED;
            }

            this._addHistoryLog(
              `Status changed to ${constants.STATUS.COMPLETED}`,
              "All maintenance tasks completed",
              "Current User",
              "sap-icon://complete",
            );

            AuditHistoryService.addEntry(
              sOrderNo,
              "COMPLETE",
              `Order marked as COMPLETED`,
              "Current User",
            );

            MessageToast.show(
              this.getView()
                .getModel("i18n")
                .getResourceBundle()
                .getText("orderDetailCompleteSuccess"),
            );
          } catch (err) {
            console.error("Failed to complete order on CAP:", err);
            MessageToast.show("Complete order failed: " + err.message);
          }
        },

        /**
         * Closes the completion validation dialog.
         *
         * @returns {void}
         */
        onCloseCannotComplete() {
          this._pCannotCompleteDialog.then((oDialog) => {
            oDialog.close();
          });
        },

        /**
         * Opens the Cancel Order dialog.
         *
         * @returns {void}
         */
        onCancel() {
          const oView = this.getView();

          if (!this._pCancelOrderDialog) {
            this._pCancelOrderDialog = Fragment.load({
              id: oView.getId(),
              name: "com.fsoft.zpmmaintenancecockpit.view.fragment.CancelOrderDialog",
              controller: this,
            }).then((oDialog) => {
              oView.addDependent(oDialog);
              return oDialog;
            });
          }

          this._pCancelOrderDialog.then((oDialog) => {
            const oModel = new JSONModel({
              reason: "",
            });
            this.getView().setModel(oModel, "cancelOrder");
            oDialog.open();
          });
        },

        /**
         * Closes the Cancel Order dialog.
         *
         * @returns {void}
         */
        onCancelCancelOrder() {
          this._pCancelOrderDialog.then((oDialog) => {
            oDialog.close();
          });
        },

        /**
         * Cancels the maintenance order via CAP cancelOrder action.
         *
         * @returns {void}
         */
        async onConfirmCancelOrder() {
          this._pCancelOrderDialog.then(async (oDialog) => {
            const oDetailModel = this.getView().getModel("orderDetail");
            const sOrderNo = oDetailModel.getProperty("/order");
            const sReason =
              this.getView().getModel("cancelOrder").getProperty("/reason") ||
              "Order cancelled by user";

            try {
              // Call CAP cancelOrder Custom Action
              await CAPService.cancelOrder(sOrderNo, sReason);

              oDetailModel.setProperty("/status", constants.STATUS.CANCELLED);
              oDetailModel.setProperty("/canSubmit", false);
              oDetailModel.setProperty("/canComplete", false);

              const oRepositoryOrder = OrderRepository.getOrderById(sOrderNo);
              if (oRepositoryOrder) {
                oRepositoryOrder.status = constants.STATUS.CANCELLED;
                oRepositoryOrder.statusLabel = constants.STATUS.CANCELLED;
              }

              this._addHistoryLog(
                `Status changed to ${constants.STATUS.CANCELLED}`,
                sReason,
                "Current User",
                "sap-icon://cancel",
              );

              AuditHistoryService.addEntry(
                sOrderNo,
                "CANCEL",
                `Status changed to ${constants.STATUS.CANCELLED}. Reason: ${sReason}`,
                "Current User",
              );

              MessageToast.show(
                this.getView()
                  .getModel("i18n")
                  .getResourceBundle()
                  .getText("orderDetailCancelSuccess"),
              );

              oDialog.close();
            } catch (err) {
              console.error("Failed to cancel order on CAP:", err);
              MessageToast.show("Cancel order failed: " + err.message);
            }
          });
        },
        // =========================================================
        // Dialog Handlers
        // =========================================================

        /**
         * Opens the Add Operation dialog.
         *
         * Loads the dialog lazily and initializes
         * a new operation model.
         *
         * @returns {void}
         */
        onAddOperation() {
          // Step 1: Load dialog if required
          const oView = this.getView();

          if (!this._pAddOperationDialog) {
            this._pAddOperationDialog = Fragment.load({
              id: oView.getId(),
              name: "com.fsoft.zpmmaintenancecockpit.view.fragment.AddOperationDialog",
              controller: this,
            }).then((oDialog) => {
              oView.addDependent(oDialog);
              return oDialog;
            });
          }

          // Step 2: Initialize operation model
          this._pAddOperationDialog.then((oDialog) => {
            const aWorkCenters = this.getView().getModel("masterData")?.getProperty("/work_centers") || [];
            const aTechnicians = this.getView().getModel("technicianData")?.getProperty("/technicians") || [];
            
            const sFirstWc = aWorkCenters.length > 0 ? aWorkCenters[0].key : "";
            const sFirstTech = aTechnicians.length > 0 ? aTechnicians[0].key : "";

            const oNewOperationModel = new JSONModel({
              no: "",
              description: "",
              workCenter: sFirstWc,
              technician: sFirstTech,
              plannedHours: 1,
              status: constants.STATUS.OPEN,
            });

            this.getView().setModel(oNewOperationModel, "newOperation");

            // Step 3: Open dialog
            oDialog.open();
          });
        },

        /**
         * Closes the Add Operation dialog.
         *
         * @returns {void}
         */
        onCancelAddOperation() {
          this._pAddOperationDialog.then((oDialog) => {
            oDialog.close();
          });
        },

        /**
         * Creates a new operation and adds it
         * to the order operation collection.
         *
         * @returns {void}
         */
        onConfirmAddOperation() {
          // Step 1: Read operation data
          this._pAddOperationDialog.then((oDialog) => {
            const oNewOp = this.getView().getModel("newOperation").getData();
            const oDetailModel = this.getView().getModel("orderDetail");
            const aOperations = oDetailModel.getProperty("/operations") || [];

            // Step 2: Add operation to collection
            aOperations.push({
              no: oNewOp.no,
              description: oNewOp.description,
              workCenter: oNewOp.workCenter,
              technician: oNewOp.technician,
              plannedHours: oNewOp.plannedHours.toString(),
              actualHours: "0",
              status: oNewOp.status,
            });

            oDetailModel.setProperty("/operations", aOperations);

            // Step 3: Refresh order status
            this._checkAndUpdateOrderStatus();

            // Step 4: Create history record
            this._addHistoryLog(
              "Operation added",
              `Operation: ${oNewOp.description}`,
              "Current User",
              "sap-icon://add",
            );

            // Step 5: Notify user
            MessageToast.show(
              this.getView()
                .getModel("i18n")
                .getResourceBundle()
                .getText("orderDetailOperationAddSuccess"),
            );

            oDialog.close();
          });
        },

        /**
         * Deletes an operation from the order.
         *
         * @param {sap.ui.base.Event} oEvent Delete button event
         * @returns {void}
         */
        onDeleteOperation(oEvent) {
          // Step 1: Determine selected operation
          const oContext = oEvent.getSource().getBindingContext("orderDetail");
          const sPath = oContext.getPath();
          const idx = parseInt(sPath.split("/").pop(), 10);

          // Step 2: Remove operation from collection
          const oDetailModel = this.getView().getModel("orderDetail");
          const aOperations = oDetailModel.getProperty("/operations") || [];
          const oDeletedOp = aOperations[idx];

          aOperations.splice(idx, 1);

          oDetailModel.setProperty("/operations", aOperations);

          // Step 3: Refresh order status
          this._checkAndUpdateOrderStatus();

          // Step 4: Create history record
          this._addHistoryLog(
            "Operation deleted",
            `Operation ${oDeletedOp.no} removed`,
            "Current User",
            "sap-icon://delete",
          );

          // Step 5: Notify user
          MessageToast.show(
            this.getView()
              .getModel("i18n")
              .getResourceBundle()
              .getText("orderDetailOperationDeleteSuccess"),
          );
        },

        /**
         * Opens the Edit Operation dialog.
         *
         * Loads the selected operation into
         * an editable model.
         *
         * @param {sap.ui.base.Event} oEvent Edit button event
         * @returns {void}
         */
        onEditOperation(oEvent) {
          // Step 1: Read selected operation
          const oContext = oEvent.getSource().getBindingContext("orderDetail");
          const sPath = oContext.getPath();
          const oData = Object.assign({}, oContext.getObject());

          // Step 2: Load dialog if required
          const oView = this.getView();

          if (!this._pEditOperationDialog) {
            this._pEditOperationDialog = Fragment.load({
              id: oView.getId(),
              name: "com.fsoft.zpmmaintenancecockpit.view.fragment.EditOperationDialog",
              controller: this,
            }).then((oDialog) => {
              oView.addDependent(oDialog);
              return oDialog;
            });
          }

          // Step 3: Initialize edit model
          this._pEditOperationDialog.then((oDialog) => {
            const oEditOperationModel = new JSONModel(oData);

            this.getView().setModel(oEditOperationModel, "editOperation");

            this._sEditOperationPath = sPath;

            // Step 4: Open dialog
            oDialog.open();
          });
        },

        /**
         * Closes the Edit Operation dialog.
         *
         * @returns {void}
         */
        onCancelEditOperation() {
          this._pEditOperationDialog.then((oDialog) => {
            oDialog.close();
          });
        },

        /**
         * Saves changes to the selected operation.
         *
         * Updates operation data, refreshes order
         * status, and creates a history record.
         *
         * @returns {void}
         */
        onConfirmEditOperation() {
          // Step 1: Read edited operation data
          this._pEditOperationDialog.then((oDialog) => {
            const oEditOp = this.getView().getModel("editOperation").getData();
            const oDetailModel = this.getView().getModel("orderDetail");

            // Step 1.5: Validate Actual vs Planned hours
            const iPlanned = Number(oEditOp.plannedHours) || 0;
            const iActual = Number(oEditOp.actualHours) || 0;
            
            if (iActual > iPlanned * 2) {
              MessageToast.show(
                this.getView()
                  .getModel("i18n")
                  .getResourceBundle()
                  .getText("ruleHoursValid")
              );
              return;
            }

            // Step 2: Update operation
            oDetailModel.setProperty(this._sEditOperationPath, oEditOp);

            // Step 3: Refresh order status
            this._checkAndUpdateOrderStatus();

            // Step 4: Create history record
            this._addHistoryLog(
              `Operation ${oEditOp.no} updated`,
              `Actual hours recorded: ${oEditOp.actualHours}h`,
              "Current User",
              "sap-icon://edit",
            );

            // Step 5: Notify user
            MessageToast.show(
              this.getView()
                .getModel("i18n")
                .getResourceBundle()
                .getText("orderDetailOperationUpdateSuccess"),
            );

            oDialog.close();
          });
        },

        /**
         * Opens the Batch Edit Operations dialog.
         *
         * Validates current selections before
         * allowing batch status updates.
         *
         * @returns {void}
         */
        onBatchEditOperations() {
          // Step 1: Read selected operations
          const oTable = this.byId("mod_operationsTable");
          const aSelectedItems = oTable.getSelectedItems();

          // Step 2: Validate selection
          if (aSelectedItems.length === 0) {
            MessageToast.show(
              this.getView()
                .getModel("i18n")
                .getResourceBundle()
                .getText("orderDetailBatchEditSelectAtLeast"),
            );
            return;
          }

          // Step 3: Prevent editing cancelled operations
          const bHasCancelled = aSelectedItems.some((oItem) => {
            return (
              oItem.getBindingContext("orderDetail").getProperty("status") ===
              constants.STATUS.CANCELLED
            );
          });

          if (bHasCancelled) {
            MessageToast.show(
              this.getView()
                .getModel("i18n")
                .getResourceBundle()
                .getText("orderDetailBatchEditCancelledError"),
            );
            return;
          }

          // Step 4: Load dialog if required
          const oView = this.getView();

          if (!this._pBatchEditDialog) {
            this._pBatchEditDialog = Fragment.load({
              id: oView.getId(),
              name: "com.fsoft.zpmmaintenancecockpit.view.fragment.BatchEditOperationsDialog",
              controller: this,
            }).then((oDialog) => {
              oView.addDependent(oDialog);
              return oDialog;
            });
          }

          // Step 5: Initialize dialog model
          this._pBatchEditDialog.then((oDialog) => {
            const oBatchEditModel = new JSONModel({
              status: constants.STATUS.OPEN,
            });

            this.getView().setModel(oBatchEditModel, "batchEdit");

            oDialog.open();
          });
        },

        /**
         * Closes the Batch Edit dialog.
         *
         * @returns {void}
         */
        onCancelBatchEdit() {
          this._pBatchEditDialog.then((oDialog) => {
            oDialog.close();
          });
        },

        /**
         * Applies a status update to all selected
         * operations.
         *
         * @returns {void}
         */
        onConfirmBatchEdit() {
          // Step 1: Read selected status
          this._pBatchEditDialog.then((oDialog) => {
            const sNewStatus = this.getView()
              .getModel("batchEdit")
              .getProperty("/status");

            const oTable = this.byId("mod_operationsTable");
            const aSelectedItems = oTable.getSelectedItems();

            const oDetailModel = this.getView().getModel("orderDetail");

            const aOperations = oDetailModel.getProperty("/operations") || [];

            // Step 2: Update selected operations
            aSelectedItems.forEach((oItem) => {
              const sPath = oItem.getBindingContext("orderDetail").getPath();

              const idx = parseInt(sPath.split("/").pop(), 10);

              aOperations[idx].status = sNewStatus;
            });

            oDetailModel.setProperty("/operations", aOperations);

            // Step 3: Clear selection
            oTable.removeSelections(true);

            // Step 4: Refresh order status
            this._checkAndUpdateOrderStatus();

            // Step 5: Create history record
            this._addHistoryLog(
              "Operations status updated",
              `Batch update to status: ${sNewStatus}`,
              "Current User",
              "sap-icon://multi-select",
            );

            // Step 6: Notify user
            MessageToast.show(
              this.getView()
                .getModel("i18n")
                .getResourceBundle()
                .getText("orderDetailOperationsUpdateSuccess"),
            );

            oDialog.close();
          });
        },

        // =========================================================
        // Materials Actions
        // =========================================================

        /**
         * Opens the Add Material dialog.
         *
         * Loads the dialog lazily and initializes
         * the material input model.
         *
         * @returns {void}
         */
        onAddMaterial() {
          // Step 1: Load dialog if required
          const oView = this.getView();

          if (!this._pAddMaterialDialog) {
            this._pAddMaterialDialog = Fragment.load({
              id: oView.getId(),
              name: "com.fsoft.zpmmaintenancecockpit.view.fragment.AddMaterialDialog",
              controller: this,
            }).then((oDialog) => {
              oView.addDependent(oDialog);
              return oDialog;
            });
          }

          // Step 2: Initialize material model
          this._pAddMaterialDialog.then((oDialog) => {
            const aCatalog =
              this.getView().getModel("materialCatalog").getData() || [];

            const sFirstKey = aCatalog.length > 0 ? aCatalog[0].key : "";

            const oModel = new JSONModel({
              material: sFirstKey,
              qty: 1,
            });

            this.getView().setModel(oModel, "newMaterial");

            // Step 3: Open dialog
            oDialog.open();
          });
        },

        /**
         * Handles material selection changes.
         *
         * Reserved for future enhancements.
         *
         * @returns {void}
         */
        onMaterialSelectChange() {
          // Placeholder for future logic
        },

        /**
         * Closes the Add Material dialog.
         *
         * @returns {void}
         */
        onCancelAddMaterial() {
          this._pAddMaterialDialog.then((oDialog) => {
            oDialog.close();
          });
        },

        /**
         * Adds a material to the order after
         * validating quantity and stock.
         *
         * @returns {void}
         */
        onConfirmAddMaterial() {
          // Step 1: Read material input
          this._pAddMaterialDialog.then((oDialog) => {
            const oNewMat = this.getView().getModel("newMaterial").getData();

            const aCatalog =
              this.getView().getModel("materialCatalog").getData() || [];

            const oCatalogItem = aCatalog.find(
              (item) => item.key === oNewMat.material,
            );

            // Step 2: Validate selected material
            if (!oCatalogItem) {
              MessageToast.show(
                this.getView()
                  .getModel("i18n")
                  .getResourceBundle()
                  .getText("orderDetailMaterialSelectValid"),
              );
              return;
            }

            const iQty = parseInt(oNewMat.qty, 10);

            // Step 3: Validate quantity
            if (!iQty || iQty <= 0) {
              MessageToast.show(
                this.getView()
                  .getModel("i18n")
                  .getResourceBundle()
                  .getText("orderDetailMaterialQtyGreaterThanZero"),
              );
              return;
            }

            // Step 3.5: Check for existing material
            const oDetailModel = this.getView().getModel("orderDetail");
            const aMaterials = oDetailModel.getProperty("/materials") || [];
            const oExistingMaterial = aMaterials.find((m) => m.material === oCatalogItem.key);
            const iExistingQty = oExistingMaterial ? oExistingMaterial.qty : 0;

            // Step 4: Validate available stock
            if (iQty + iExistingQty > oCatalogItem.availableStock) {
              MessageToast.show(
                this.getView()
                  .getModel("i18n")
                  .getResourceBundle()
                  .getText("orderDetailMaterialQtyExceedStock", [
                    oCatalogItem.availableStock,
                  ]),
              );
              return;
            }

            // Step 5: Add material to order or update existing
            if (oExistingMaterial) {
              oExistingMaterial.qty += iQty;
              oExistingMaterial.value = oExistingMaterial.qty * oCatalogItem.unitPrice;
            } else {
              aMaterials.push({
                material: oCatalogItem.key,
                description: oCatalogItem.description,
                qty: iQty,
                unit: oCatalogItem.unit,
                availableStock: oCatalogItem.availableStock,
                value: iQty * oCatalogItem.unitPrice,
              });
            }

            oDetailModel.setProperty("/materials", aMaterials);
            oDetailModel.refresh(true);

            // Step 6: Create history record
            this._addHistoryLog(
              "Material added",
              `Material: ${oCatalogItem.key} (Qty: ${iQty})`,
              "Current User",
              "sap-icon://product",
            );

            // Step 7: Notify user
            MessageToast.show(
              this.getView()
                .getModel("i18n")
                .getResourceBundle()
                .getText("orderDetailMaterialAddSuccess"),
            );

            oDialog.close();
          });
        },
        // =========================================================
        // Technicians Actions
        // =========================================================

        /**
         * Opens the Assign Technician dialog.
         *
         * Filters out already assigned technicians
         * and displays only available candidates.
         *
         * @returns {void}
         */
        onAssignTechnician() {
          // Step 1: Get assigned technicians
          const oView = this.getView();

          const aAssigned =
            oView.getModel("orderDetail").getProperty("/assignedTechnicians") ||
            [];

          const aAssignedKeys = aAssigned.map((t) => t.employee);

          // Step 2: Filter available technicians
          const aFullCatalog = oView.getModel("techCatalog").getData() || [];

          const aAvailable = aFullCatalog.filter(
            (t) => !aAssignedKeys.includes(t.key),
          );

          // Step 3: Validate available technicians
          if (aAvailable.length === 0) {
            MessageToast.show(
              this.getView()
                .getModel("i18n")
                .getResourceBundle()
                .getText("orderDetailTechnicianAllAssigned"),
            );
            return;
          }

          // Step 4: Create temporary technician model
          const oAvailModel = new JSONModel(aAvailable);

          oView.setModel(oAvailModel, "techCatalog");

          // Step 5: Load dialog if required
          if (!this._pAssignTechDialog) {
            this._pAssignTechDialog = Fragment.load({
              id: oView.getId(),
              name: "com.fsoft.zpmmaintenancecockpit.view.fragment.AssignTechnicianDialog",
              controller: this,
            }).then((oDialog) => {
              oView.addDependent(oDialog);
              return oDialog;
            });
          }

          // Step 6: Open dialog
          this._pAssignTechDialog.then((oDialog) => {
            oDialog.open();
          });
        },

        /**
         * Filters technician search results
         * inside the SelectDialog.
         *
         * @param {sap.ui.base.Event} oEvent Search event
         * @returns {void}
         */
        onSearchAssignTechnician(oEvent) {
          // Step 1: Read search value
          const sValue = oEvent.getParameter("value");

          // Step 2: Build search filter
          const oFilter = new Filter({
            filters: [
              new Filter("name", FilterOperator.Contains, sValue),
              new Filter("key", FilterOperator.Contains, sValue),
              new Filter("skill", FilterOperator.Contains, sValue),
            ],
            and: false,
          });

          // Step 3: Apply filter
          oEvent.getSource().getBinding("items").filter([oFilter]);
        },

        /**
         * Assigns the selected technician
         * to the maintenance order.
         *
         * @param {sap.ui.base.Event} oEvent Confirm event
         * @returns {void}
         */
        onConfirmAssignTechnician(oEvent) {
          // Step 1: Read selected technician
          const oSelectedItem = oEvent.getParameter("selectedItem");

          if (!oSelectedItem) {
            return;
          }

          const oContext = oSelectedItem.getBindingContext("techCatalog");

          const oTech = oContext.getObject();

          // Step 2: Show warning if unavailable
          if (oTech.available === "NO") {
            MessageToast.show(
              this.getView()
                .getModel("i18n")
                .getResourceBundle()
                .getText("orderDetailTechnicianUnavailableWarning", [oTech.name]),
            );
          }

          // Step 3: Add technician to assignment list
          const oDetailModel = this.getView().getModel("orderDetail");

          const aAssigned =
            oDetailModel.getProperty("/assignedTechnicians") || [];

          aAssigned.push({
            employee: oTech.key,
            name: oTech.name,
            skill: oTech.skill,
            workCenter: oTech.workCenter,
            available: oTech.available,
          });

          oDetailModel.setProperty("/assignedTechnicians", aAssigned);

          const sOrderNo = oDetailModel.getProperty("/order");
          const oRepositoryOrder = OrderRepository.getOrderById(sOrderNo);
          if (oRepositoryOrder) {
            oRepositoryOrder.assignedTechnicians = aAssigned;
          }

          // Step 4: Create history record
          this._addHistoryLog(
            "Technician assigned",
            "Technician: " + oTech.name,
            "Current User",
            "sap-icon://employee",
          );

          AuditHistoryService.addEntry(
            sOrderNo,
            "UPDATE",
            "Assigned technician: " + oTech.name,
            "Current User"
          );

          // Step 5: Notify user
          MessageToast.show(
            this.getView()
              .getModel("i18n")
              .getResourceBundle()
              .getText("orderDetailTechnicianAssignSuccess", [oTech.name]),
          );
        },

        /**
         * Handles Assign Technician dialog cancellation.
         *
         * SelectDialog automatically manages
         * its own closing behavior.
         *
         * @returns {void}
         */
        onCancelAssignTechnician() {
          // SelectDialog handles close automatically
        },

        // =========================================================
        // Route handling
        // =========================================================

        /**
         * Handles route matching and loads
         * the selected maintenance order.
         *
         * @param {sap.ui.base.Event} oEvent Route matched event
         * @returns {void}
         */
        _onOrderMatched(oEvent) {
          // Step 1: Read order id from route parameters
          const sOrder = oEvent.getParameter("arguments").orderId;

          // Step 2: Load order details
          this._loadOrder(sOrder);
        },

        // =========================================================
        // Load order detail
        // =========================================================
        /**
         * Loads maintenance order details,
         * operations, materials, and history data.
         *
         * @param {string} sOrder Order number
         * @returns {void}
         */
        async _loadOrder(sOrder) {
          const oRepositoryOrder = OrderRepository.getOrderById(sOrder);

          try {
            let oOrder = oRepositoryOrder;
            if (!oOrder) {
              try {
                oOrder = await CAPService.getOrderById(sOrder);
              } catch (e) {
                const aOrders = await CAPService.getMaintenanceOrders();
                oOrder = aOrders.find(o => o.order_no === sOrder) || aOrders[0];
              }
            }

            if (!oOrder) {
              this.getView().getModel("orderDetail").setData({
                order: sOrder,
              });
              return;
            }

            // Map order data
            const oDetail = {
              order: oOrder.order_no || oOrder.order || sOrder,
              description: oOrder.description || "",
              equipment: oOrder.equipment_no || oOrder.equipment || "",
              plant: oOrder.plant || "",
              type: oOrder.maintenance_type || oOrder.type || "",
              priority: oOrder.priority || "",
              status: oOrder.status || oOrder.statusLabel || constants.STATUS.OPEN,
              planner: oOrder.planner || "",
              scheduledFrom: oOrder.scheduled_from || oOrder.scheduledFrom || "",
              scheduledTo: oOrder.scheduled_to || oOrder.scheduledTo || "",
              scheduled: oOrder.scheduled || (oOrder.scheduled_from || oOrder.scheduledFrom
                ? `${oOrder.scheduled_from || oOrder.scheduledFrom} → ${oOrder.scheduled_to || oOrder.scheduledTo}`
                : ""),
              location: oOrder.location || "",
              workCenter: oOrder.work_center || oOrder.workCenter || "",
              createdBy: oOrder.created_by || oOrder.createdBy || "",
              createdAt: oOrder.created_at || oOrder.createdAt || "",
              etag: oOrder.etag || "",
              dirtyState: oOrder.dirty_state || oOrder.dirtyState || "NO",
              operationCount: oOrder.operation_count ?? oOrder.operationCount ?? 0,
              completedOperationCount: oOrder.completed_operation_count ?? oOrder.completedOperationCount ?? 0,
              plannedHours: oOrder.planned_hours ?? oOrder.plannedHours ?? 0,
              actualHours: oOrder.actual_hours ?? oOrder.actualHours ?? 0,
              estimatedCost: oOrder.estimated_cost ?? oOrder.estimatedCost ?? 0,
              currency: oOrder.currency || "USD",
              canSubmit: (oOrder.status || oOrder.statusLabel || constants.STATUS.OPEN) === constants.STATUS.OPEN,
              canComplete: (oOrder.status || oOrder.statusLabel || constants.STATUS.OPEN) === constants.STATUS.IN_PROCESS,
              assignedTechnicians: oOrder.assignedTechnicians !== undefined
                ? oOrder.assignedTechnicians
                : (this.getView().getModel("technicianData")?.getProperty("/assignedTechnicians") || []),
            };

            this.getView()
              .getModel("orderDetail")
              .setData({
                ...this.getView().getModel("orderDetail").getData(),
                ...oDetail,
              });

            // Load operations, materials and history in parallel from CAP
            const [aOperationsData, oMatsData, aHistoryData] = await Promise.all([
              CAPService.getOperations(sOrder),
              CAPService.getMaterials(),
              CAPService.getOrderHistory(sOrder)
            ]);

            let aOperations = (oOrder.operations && oOrder.operations.length > 0)
              ? oOrder.operations.map(op => ({
                  no: op.no || op.operationNo,
                  description: op.description,
                  workCenter: op.workCenter || "WC-001",
                  technician: op.technician || "T-001",
                  plannedHours: op.plannedHours,
                  actualHours: op.actualHours || "0",
                  status: op.status || constants.STATUS.OPEN,
                }))
              : (aOperationsData.length > 0 ? aOperationsData : [
                  { no: "10", description: "Cleaning", workCenter: "WC-001", technician: "T-001", plannedHours: "2", actualHours: "2", status: "COMPLETED" },
                  { no: "20", description: "Inspection", workCenter: "WC-002", technician: "T-002", plannedHours: "3", actualHours: "2", status: "IN_PROCESS" },
                  { no: "30", description: "Bearing replacement", workCenter: "WC-003", technician: "T-003", plannedHours: "4", actualHours: "0", status: "OPEN" }
                ]);

            let aMaterials = (oOrder.materials && oOrder.materials.length > 0)
              ? oOrder.materials.map(m => {
                  const sMatId = m.material || m.materialId;
                  const oCatalogMat = (oMatsData.materialCatalog || []).find(c => c.key === sMatId) || {};
                  return {
                    material: sMatId,
                    description: m.description || oCatalogMat.description || "",
                    qty: m.qty || m.quantity || 1,
                    unit: m.unit || oCatalogMat.unit || "EA",
                    availableStock: m.availableStock ?? oCatalogMat.availableStock ?? 0,
                    value: m.value || (m.qty || m.quantity || 1) * (oCatalogMat.unitPrice || 0),
                  };
                })
              : (oMatsData.materials || []);

            this.getView()
              .getModel("orderDetail")
              .setProperty("/operations", aOperations);

            this.getView()
              .getModel("orderDetail")
              .setProperty("/materials", aMaterials);

            this._updateOrderSummary();

            const oCatalogModel = new JSONModel(
              oMatsData.materialCatalog || [],
            );
            this.getView().setModel(oCatalogModel, "materialCatalog");

            // Order History
            let aOrderHistory = (aHistoryData || []).filter(h => h.order_no === sOrder);
            if (aOrderHistory.length === 0) {
              const oNow = new Date();
              const sCurrentDateTime =
                oNow.getFullYear() + "-" +
                String(oNow.getMonth() + 1).padStart(2, "0") + "-" +
                String(oNow.getDate()).padStart(2, "0") + " " +
                String(oNow.getHours()).padStart(2, "0") + ":" +
                String(oNow.getMinutes()).padStart(2, "0");

              aOrderHistory = [
                {
                  order_no: sOrder,
                  title: "Maintenance Order Created",
                  dateTime: sCurrentDateTime,
                  userName: "Current User",
                  text: `Maintenance Order ${sOrder} was created successfully.`,
                  icon: "sap-icon://add",
                },
              ];
            }

            aOrderHistory.sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
            this.getView()
              .getModel("orderDetail")
              .setProperty("/history", aOrderHistory);

          } catch (err) {
            console.error("Failed to load order from CAP:", err);
          }
        },

        // =========================================================
        // Helper Methods
        // =========================================================
        /**
         * Automatically updates the order status
         * based on operation completion status.
         *
         * @returns {void}
         */
        _checkAndUpdateOrderStatus() {
          // Step 1: Read operation data
          const oDetailModel = this.getView().getModel("orderDetail");

          const aOperations = oDetailModel.getProperty("/operations") || [];

          if (aOperations.length === 0) {
            return;
          }

          // Step 2: Skip cancelled orders
          const currentStatus = oDetailModel.getProperty("/status");

          if (currentStatus === constants.STATUS.CANCELLED) {
            return;
          }

          // Step 3: Check completion status
          const bAllCompleted = aOperations.every(
            (op) =>
              op.status === constants.STATUS.COMPLETED ||
              op.status === constants.STATUS.CANCELLED,
          );

          // Step 4: Revert order if operations become incomplete
          if (!bAllCompleted && currentStatus === constants.STATUS.COMPLETED) {
            oDetailModel.setProperty("/status", constants.STATUS.IN_PROCESS);

            oDetailModel.setProperty("/canComplete", true);

            this._addHistoryLog(
              `Status changed to ${constants.STATUS.IN_PROCESS}`,
              "Reverted automatically due to incomplete operations",
              "System workflow",
              "sap-icon://workflow-tasks",
            );
          }

          this._updateOrderSummary();
        },

        /**
         * Calculates and updates order summary metrics based on operations.
         *
         * @returns {void}
         */
        _updateOrderSummary() {
          const oDetailModel = this.getView().getModel("orderDetail");
          const aOperations = oDetailModel.getProperty("/operations") || [];
          
          let iPlannedHours = 0;
          let iActualHours = 0;
          let iCompletedCount = 0;

          aOperations.forEach((op) => {
            iPlannedHours += Number(op.plannedHours) || 0;
            iActualHours += Number(op.actualHours) || 0;
            
            if (op.status === constants.STATUS.COMPLETED || op.status === constants.STATUS.CANCELLED) {
              iCompletedCount++;
            }
          });

          oDetailModel.setProperty("/operationCount", aOperations.length);
          oDetailModel.setProperty("/completedOperationCount", iCompletedCount);
          oDetailModel.setProperty("/plannedHours", iPlannedHours);
          oDetailModel.setProperty("/actualHours", iActualHours);
        },

        /**
         * Adds a new history record to
         * the maintenance order.
         *
         * @param {string} sTitle History title
         * @param {string} sText History description
         * @param {string} sUserName User name
         * @param {string} sIcon SAP icon
         * @returns {void}
         */
        _addHistoryLog(sTitle, sText, sUserName, sIcon) {
          // Step 1: Read current history
          const oDetailModel = this.getView().getModel("orderDetail");

          const aHistory = oDetailModel.getProperty("/history") || [];

          const sOrderNo = oDetailModel.getProperty("/order");

          // Step 2: Build timestamp
          const oDate = new Date();

          const sDate =
            oDate.getFullYear() +
            "-" +
            String(oDate.getMonth() + 1).padStart(2, "0") +
            "-" +
            String(oDate.getDate()).padStart(2, "0") +
            " " +
            String(oDate.getHours()).padStart(2, "0") +
            ":" +
            String(oDate.getMinutes()).padStart(2, "0");

          // Step 3: Create history entry
          aHistory.unshift({
            order_no: sOrderNo,
            title: sTitle,
            dateTime: sDate,
            userName: sUserName || "System workflow",
            text: sText || "",
            icon: sIcon || "sap-icon://sys-enter",
          });

          // Step 4: Update model
          oDetailModel.setProperty("/history", aHistory);
        },
      },
    );
  },
);
