sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "com/fsoft/zpmmaintenancecockpit/model/AuditHistoryService",
    "com/fsoft/zpmmaintenancecockpit/model/OrderRepository",
    "com/fsoft/zpmmaintenancecockpit/model/constants",
    "com/fsoft/zpmmaintenancecockpit/model/CAPService",
  ],
  (
    Controller,
    JSONModel,
    MessageBox,
    MessageToast,
    AuditHistoryService,
    OrderRepository,
    constants,
    CAPService,
  ) => {
    "use strict";

    return Controller.extend(
      "com.fsoft.zpmmaintenancecockpit.controller.CreateMaintenanceOrderDialog",
      {
        /**
         * Sets the parent controller reference.
         *
         * @param {sap.ui.core.mvc.Controller} oParentController Parent controller
         * @returns {object} Current dialog controller instance
         */
        setParentController(oParentController) {
          // Step 1: Store parent controller reference
          this._parentController = oParentController;

          // Step 2: Support method chaining
          return this;
        },

        /**
         * Initializes the create order dialog model
         * and loads required master data.
         *
         * @returns {void}
         */
        initDialogState() {
          // Step 1: Get view and resource bundle
          const oView = this._getView();
          const oResourceBundle = oView.getModel("i18n").getResourceBundle();

          // Step 2: Initialize create order model
          const oCreateOrderModel = new JSONModel({
            equipment: [
              {
                key: "",
                text: oResourceBundle.getText(
                  "maintenanceOrderCreateEquipmentPlaceholder",
                ),
              },
            ],
            plants: [],
            maintenanceTypes: [],
            priorities: [],
            planners: [],
            materialsMaster: [],
            selectedEquipment: "",
            selectedPlant: "1000",
            description: "",
            selectedMaintenanceType: "PREVENTIVE",
            selectedPriority: "LOW",
            selectedPlanner: "JOHN",
            scheduledStart: new Date().toISOString().split("T")[0],
            scheduledEnd: new Date().toISOString().split("T")[0],
            operationNo: "",
            operationDescription: "",
            plannedHours: "",
            operations: [],
            selectedMaterial: "",
            materialQuantity: 1,
            materials: [],
            step1Validated: false,
            step2Validated: false,
            step3Validated: false,
            step4Validated: false,
            currentStep: 1,
            currentStepValid: false,
            showBackButton: false,
            nextButtonText: "",
            reviewSchedule: "",
            reviewOperationCount: "0",
            reviewMaterialCount: "0",
          });

          oView.setModel(oCreateOrderModel, "createOrder");

          // Step 3: Load supporting master data
          this._loadCreateOrderEquipment();
          this._loadCreateOrderMasterData();
        },

        /**
         * Handles equipment selection changes.
         *
         * @param {sap.ui.base.Event} oEvent Change event
         * @returns {void}
         */
        onCreateOrderEquipmentChange(oEvent) {
          // Step 1: Read selected equipment
          const oView = this._getView();
          const oCreateOrderModel = oView.getModel("createOrder");

          const sSelectedEquipment = oEvent.getSource().getSelectedKey();

          // Step 2: Update model
          oCreateOrderModel.setProperty(
            "/selectedEquipment",
            sSelectedEquipment,
          );

          // Step 3: Validate wizard step
          this._validateCreateOrderStep1();
        },

        /**
         * Handles plant selection changes.
         *
         * Updates the selected plant and
         * revalidates wizard step 1.
         *
         * @param {sap.ui.base.Event} oEvent Change event
         * @returns {void}
         */

        onCreateOrderPlantChange(oEvent) {
          const oView = this._getView();
          const sSelectedPlant = oEvent.getSource().getSelectedKey();
          const oCreateOrderModel = oView.getModel("createOrder");

          oCreateOrderModel.setProperty("/selectedPlant", sSelectedPlant);
          this._validateCreateOrderStep1();
        },

        /**
         * Navigates to the next wizard step
         * or creates the maintenance order.
         *
         * @returns {void}
         */
        onCreateOrderNext() {
          // Step 1: Read wizard state
          const oView = this._getView();
          const oWizard = oView.byId("createOrderWizard");
          const oCreateOrderModel = oView.getModel("createOrder");

          const iCurrentStep = oCreateOrderModel.getProperty("/currentStep");

          // Step 2: Create order on final step
          if (iCurrentStep === 5) {
            this._createMaintenanceOrder();
            return;
          }

          // Step 3: Validate current step
          if (!this._isCreateOrderStepValid(iCurrentStep)) {
            return;
          }

          // Step 4: Move to next step
          oWizard.nextStep();
        },

        /**
         * Cancels create order process.
         *
         * @returns {void}
         */
        onCreateOrderCancel() {
          // Step 1: Close dialog
          this._closeCreateOrderDialog();
        },

        /**
         * Resets the wizard state after
         * the create order dialog is closed.
         *
         * @returns {void}
         */
        onCreateOrderDialogAfterClose() {
          const oView = this._getView();
          const oWizard = oView.byId("createOrderWizard");
          const oCreateOrderModel = oView.getModel("createOrder");

          // Step 1: Reset wizard progress
          if (oWizard) {
            oWizard.discardProgress(oWizard.getSteps()[0]);
          }

          // Step 2: Reset wizard state
          oCreateOrderModel.setProperty("/currentStep", 1);

          oCreateOrderModel.setProperty("/showBackButton", false);

          oCreateOrderModel.setProperty("/step1Validated", false);

          oCreateOrderModel.setProperty("/currentStepValid", false);

          // Step 3: Reset button text
          const oResourceBundle = oView.getModel("i18n").getResourceBundle();

          oCreateOrderModel.setProperty(
            "/nextButtonText",
            oResourceBundle.getText("maintenanceOrderCreateNext"),
          );

          // Step 4: Reset form values
          oCreateOrderModel.setProperty("/selectedEquipment", "");

          oCreateOrderModel.setProperty("/selectedPlant", "1000");
        },

        /**
         * Navigates to the previous wizard step.
         *
         * @returns {void}
         */
        onCreateOrderBack() {
          const oView = this._getView();
          const oWizard = oView.byId("createOrderWizard");

          // Step 1: Go to previous step
          oWizard.previousStep();

          // Step 2: Update wizard state
          const iPreviousStep =
            oView.getModel("createOrder").getProperty("/currentStep") - 1;

          this._updateCreateOrderWizardState(iPreviousStep);
        },

        /**
         * Updates wizard state when a step
         * becomes active.
         *
         * @param {sap.ui.base.Event} oEvent Step activation event
         * @returns {void}
         */
        onCreateOrderStepActivate(oEvent) {
          // Step 1: Read active step index
          const iCurrentStep = oEvent.getParameter("index");

          // Step 2: Update wizard state
          this._updateCreateOrderWizardState(iCurrentStep);
        },

        /**
         * Validates step 2 data including
         * description and schedule dates.
         *
         * @returns {void}
         */
        onCreateOrderStep2Change() {
          const oView = this._getView();
          const oCreateOrderModel = oView.getModel("createOrder");

          const sDescription = oCreateOrderModel.getProperty("/description");

          const sScheduledStart =
            oCreateOrderModel.getProperty("/scheduledStart");

          const sScheduledEnd = oCreateOrderModel.getProperty("/scheduledEnd");

          // Step 1: Validate mandatory fields
          let bStep2Validated =
            Boolean(sDescription?.trim()) &&
            Boolean(sScheduledStart) &&
            Boolean(sScheduledEnd);

          // Step 2: Validate schedule range
          if (bStep2Validated) {
            bStep2Validated =
              new Date(sScheduledStart) <= new Date(sScheduledEnd);
          }

          // Step 3: Update validation state
          oCreateOrderModel.setProperty("/step2Validated", bStep2Validated);

          // Step 4: Update current step state
          if (oCreateOrderModel.getProperty("/currentStep") === 2) {
            oCreateOrderModel.setProperty("/currentStepValid", bStep2Validated);
          }
        },
        /**
         * Restricts Operation Number input
         * to numeric values only.
         *
         * @param {sap.ui.base.Event} oEvent Live change event
         * @returns {void}
         */
        onOperationNoLiveChange(oEvent) {
          // Step 1: Read input value
          const sRaw = oEvent.getParameter("newValue");

          // Step 2: Remove non-numeric characters
          const sClean = (sRaw || "").toString().replace(/\D+/g, "");

          // Step 3: Update model
          const oView = this._getView();

          oView.getModel("createOrder").setProperty("/operationNo", sClean);

          // Step 4: Update input field
          oEvent.getSource().setValue(sClean);
        },

        /**
         * Restricts Planned Hours input
         * to numeric values only.
         *
         * @param {sap.ui.base.Event} oEvent Live change event
         * @returns {void}
         */
        onPlannedHoursLiveChange(oEvent) {
          // Step 1: Read input value
          const sRaw = oEvent.getParameter("newValue");

          // Step 2: Remove non-numeric characters
          const sClean = (sRaw || "").toString().replace(/[^0-9]/g, "");

          // Step 3: Update model
          const oView = this._getView();

          oView.getModel("createOrder").setProperty("/plannedHours", sClean);

          // Step 4: Update input field
          oEvent.getSource().setValue(sClean);
        },

        /**
         * Adds an operation to the
         * maintenance order.
         *
         * @returns {void}
         */
        onAddOperation() {
          const oView = this._getView();
          const oResourceBundle = oView.getModel("i18n").getResourceBundle();
          const oCreateOrderModel = oView.getModel("createOrder");

          // Step 1: Read operation data
          const sOperationNo = oCreateOrderModel.getProperty("/operationNo");
          const sDescription = oCreateOrderModel.getProperty(
            "/operationDescription",
          );
          const sPlannedHours = oCreateOrderModel.getProperty("/plannedHours");

          // Step 2: Validate required fields
          if (!sOperationNo || !sDescription || !sPlannedHours) {
            MessageBox.warning(
              oResourceBundle.getText(
                "maintenanceOrderCreateOperationValidationMessage",
              ),
            );
            return;
          }

          // Step 3: Add operation
          const aOperations =
            oCreateOrderModel.getProperty("/operations") || [];

          aOperations.push({
            operationNo: sOperationNo,
            description: sDescription,
            plannedHours: sPlannedHours,
          });

          // Step 4: Update model
          oCreateOrderModel.setProperty("/operations", aOperations);

          // Step 5: Clear input fields
          oCreateOrderModel.setProperty("/operationNo", "");
          oCreateOrderModel.setProperty("/operationDescription", "");
          oCreateOrderModel.setProperty("/plannedHours", "");

          // Step 6: Update validation state
          oCreateOrderModel.setProperty(
            "/step3Validated",
            aOperations.length > 0,
          );

          oCreateOrderModel.setProperty("/currentStepValid", true);
        },

        /**
         * Removes an operation from the
         * maintenance order.
         *
         * @param {sap.ui.base.Event} oEvent Delete event
         * @returns {void}
         */
        onDeleteOperation(oEvent) {
          const oView = this._getView();
          const oCreateOrderModel = oView.getModel("createOrder");

          // Step 1: Get operation index
          const oContext = oEvent.getSource().getBindingContext("createOrder");

          const sPath = oContext.getPath();

          const iIndex = parseInt(sPath.split("/").pop(), 10);

          // Step 2: Remove operation
          const aOperations =
            oCreateOrderModel.getProperty("/operations") || [];

          aOperations.splice(iIndex, 1);

          oCreateOrderModel.setProperty("/operations", aOperations);

          // Step 3: Update validation state
          const bValid = aOperations.length > 0;

          oCreateOrderModel.setProperty("/step3Validated", bValid);

          if (oCreateOrderModel.getProperty("/currentStep") === 3) {
            oCreateOrderModel.setProperty("/currentStepValid", bValid);
          }
        },

        /**
         * Adds a material to the
         * maintenance order.
         *
         * @returns {void}
         */
        onAddMaterial() {
          const oView = this._getView();
          const oResourceBundle = oView.getModel("i18n").getResourceBundle();
          const oCreateOrderModel = oView.getModel("createOrder");

          // Step 1: Read material data
          const sMaterial = oCreateOrderModel.getProperty("/selectedMaterial");

          const iQuantity = oCreateOrderModel.getProperty("/materialQuantity");

          const aMaterials = oCreateOrderModel.getProperty("/materials") || [];

          // Step 2: Validate material input
          if (!sMaterial || !iQuantity || Number(iQuantity) <= 0) {
            MessageBox.warning(
              oResourceBundle.getText(
                "maintenanceOrderCreateMaterialValidationMessage",
              ),
            );

            return;
          }

          // Step 3: Check duplicate material
          const bMaterialExists = aMaterials.some(
            (oMaterial) => oMaterial.materialId === sMaterial,
          );

          if (bMaterialExists) {
            MessageBox.warning(
              oResourceBundle.getText(
                "maintenanceOrderCreateMaterialExistsMessage",
              ),
            );

            return;
          }

          // Step 4: Add material
          aMaterials.push({
            materialId: sMaterial,
            quantity: Number(iQuantity),
          });

          // Step 5: Update model
          oCreateOrderModel.setProperty("/materials", [...aMaterials]);

          oCreateOrderModel.setProperty("/selectedMaterial", "");

          oCreateOrderModel.setProperty("/materialQuantity", 1);

          // Step 6: Update validation state
          const bStep4Validated = aMaterials.length > 0;

          oCreateOrderModel.setProperty("/step4Validated", bStep4Validated);

          if (oCreateOrderModel.getProperty("/currentStep") === 4) {
            oCreateOrderModel.setProperty("/currentStepValid", bStep4Validated);
          }

          // Step 7: Refresh model
          oCreateOrderModel.refresh(true);
        },

        /**
         * Removes a material from the
         * maintenance order.
         *
         * @param {sap.ui.base.Event} oEvent Delete event
         * @returns {void}
         */
        onDeleteMaterial(oEvent) {
          const oView = this._getView();
          const oCreateOrderModel = oView.getModel("createOrder");

          // Step 1: Determine selected material
          const oContext = oEvent.getSource().getBindingContext("createOrder");

          const sPath = oContext.getPath();

          const iIndex = parseInt(sPath.split("/").pop(), 10);

          // Step 2: Remove material
          const aMaterials = oCreateOrderModel.getProperty("/materials") || [];

          aMaterials.splice(iIndex, 1);

          oCreateOrderModel.setProperty("/materials", aMaterials);

          // Step 3: Update validation state
          const bStep4Validated = aMaterials.length > 0;

          oCreateOrderModel.setProperty("/step4Validated", bStep4Validated);

          if (oCreateOrderModel.getProperty("/currentStep") === 4) {
            oCreateOrderModel.setProperty("/currentStepValid", bStep4Validated);
          }
        },
        /**
         * Returns the current view instance.
         *
         * Uses the parent controller view when
         * available, otherwise falls back to
         * the local controller view.
         *
         * @returns {sap.ui.core.mvc.View|null}
         */
        _getView() {
          // Step 1: Use parent controller view
          if (this._parentController && this._parentController.getView) {
            return this._parentController.getView();
          }

          // Step 2: Fallback to local view
          return this.getView ? this.getView() : null;
        },

        /**
         * Loads equipment master data for
         * the Create Maintenance Order dialog.
         *
         * @returns {void}
         */
        async _loadCreateOrderEquipment() {
          const oView = this._getView();
          const oCreateOrderModel = oView.getModel("createOrder");
          const oResourceBundle = oView.getModel("i18n").getResourceBundle();

          try {
            const aEquipment = await CAPService.getEquipments();

            oCreateOrderModel.setProperty(
              "/nextButtonText",
              oResourceBundle.getText("maintenanceOrderCreateNext"),
            );

            const aActiveEquipment = (aEquipment || []).filter(
              (oEquipment) =>
                oEquipment.status === constants.EQUIPMENT_STATUS.ACTIVE,
            );

            const aEquipmentItems = aActiveEquipment.map((oEquipment) => ({
              key: oEquipment.equipment,
              text: `${oEquipment.equipment} - ${oEquipment.description}`,
              status: oEquipment.status,
              plant: oEquipment.plant,
              type: oEquipment.type,
              location: oEquipment.location,
              criticality: oEquipment.criticality,
              manufacturer: oEquipment.manufacturer,
            }));

            oCreateOrderModel.setProperty("/equipment", [
              {
                key: "",
                text: oResourceBundle.getText(
                  "maintenanceOrderCreateEquipmentPlaceholder",
                ),
              },
              ...aEquipmentItems,
            ]);
          } catch (err) {
            console.error("Failed to load equipment for create dialog:", err);
            MessageBox.error(
              oResourceBundle.getText("maintenanceOrderCreateEquipmentLoadError"),
            );
          }
        },

        /**
         * Loads master data for the
         * Create Maintenance Order dialog.
         *
         * @returns {void}
         */
        async _loadCreateOrderMasterData() {
          const oView = this._getView();
          const oCreateOrderModel = oView.getModel("createOrder");
          const oResourceBundle = oView.getModel("i18n").getResourceBundle();

          try {
            const [oMasterData, oMatsData] = await Promise.all([
              CAPService.getMasterData(),
              CAPService.getMaterials()
            ]);

            oCreateOrderModel.setProperty("/plants", oMasterData.plants || []);
            oCreateOrderModel.setProperty(
              "/maintenanceTypes",
              oMasterData.maintenance_types || [],
            );
            oCreateOrderModel.setProperty(
              "/priorities",
              oMasterData.priorities || [],
            );
            oCreateOrderModel.setProperty(
              "/planners",
              oMasterData.planners || [],
            );

            const aMaterials = (oMatsData.materials || []).map(m => ({
              key: m.material,
              text: `${m.material} — ${m.description}`
            }));
            oCreateOrderModel.setProperty("/materialsMaster", aMaterials);
          } catch (err) {
            console.error("Failed to load master data for create dialog:", err);
            MessageBox.error(
              oResourceBundle.getText("maintenanceOrderCreateMasterDataLoadError"),
            );
          }
        },

        /**
         * Validates wizard step 1.
         *
         * Equipment and Plant must both
         * be selected before continuing.
         *
         * @returns {void}
         */
        _validateCreateOrderStep1() {
          // Step 1: Read form values
          const oView = this._getView();

          const oCreateOrderModel = oView.getModel("createOrder");

          const sSelectedEquipment =
            oCreateOrderModel.getProperty("/selectedEquipment");

          const sSelectedPlant =
            oCreateOrderModel.getProperty("/selectedPlant");

          // Step 2: Evaluate validation state
          const bStep1Validated =
            Boolean(sSelectedEquipment) && Boolean(sSelectedPlant);

          // Step 3: Update validation flags
          oCreateOrderModel.setProperty("/step1Validated", bStep1Validated);

          oCreateOrderModel.setProperty("/currentStepValid", bStep1Validated);
        },

        /**
         * Closes the Create Maintenance Order dialog.
         *
         * @returns {void}
         */
        _closeCreateOrderDialog() {
          if (
            this._parentController &&
            this._parentController._pCreateOrderDialog
          ) {
            // Step 1: Close dialog
            this._parentController._pCreateOrderDialog.then((oDialog) => {
              oDialog.close();
            });
          }
        },

        /**
         * Checks whether the specified
         * wizard step is valid.
         *
         * @param {int} iStep Wizard step number
         * @returns {boolean}
         */
        _isCreateOrderStepValid(iStep) {
          const oView = this._getView();
          const oCreateOrderModel = oView.getModel("createOrder");

          // Step 1: Return validation result for current step
          switch (iStep) {
            case 1:
              return Boolean(oCreateOrderModel.getProperty("/step1Validated"));

            case 2:
              return Boolean(oCreateOrderModel.getProperty("/step2Validated"));

            case 3:
              return Boolean(oCreateOrderModel.getProperty("/step3Validated"));

            case 4:
              return Boolean(oCreateOrderModel.getProperty("/step4Validated"));

            case 5:
              return true;

            default:
              return false;
          }
        },

        /**
         * Updates the wizard state,
         * navigation buttons, and validation.
         *
         * @param {int} iCurrentStep Current wizard step
         * @returns {void}
         */
        _updateCreateOrderWizardState(iCurrentStep) {
          const oView = this._getView();
          const oCreateOrderModel = oView.getModel("createOrder");
          const oResourceBundle = oView.getModel("i18n").getResourceBundle();

          // Step 1: Update current step
          oCreateOrderModel.setProperty("/currentStep", iCurrentStep);

          // Step 2: Show or hide Back button
          oCreateOrderModel.setProperty("/showBackButton", iCurrentStep > 1);

          // Step 3: Update action button text
          oCreateOrderModel.setProperty(
            "/nextButtonText",
            iCurrentStep === 5
              ? oResourceBundle.getText("maintenanceOrderCreateCreate")
              : oResourceBundle.getText("maintenanceOrderCreateNext"),
          );

          // Step 4: Update validation status
          oCreateOrderModel.setProperty(
            "/currentStepValid",
            this._isCreateOrderStepValid(iCurrentStep),
          );
        },

        /**
         * Creates a new maintenance order
         * and adds it to the order collection.
         *
         * @returns {void}
         */
        _createMaintenanceOrder() {
          const oView = this._getView();
          const oOrdersModel = this._parentController
            .getView()
            .getModel("orders");

          const oCreateOrderModel = oView.getModel("createOrder");

          const oResourceBundle = oView.getModel("i18n").getResourceBundle();

          const aOrders = oOrdersModel.getProperty("/rows") || [];

          // Step 1: Generate next maintenance order number
          const iNextOrderNumber =
            aOrders.reduce((iHighestOrderNumber, oOrder) => {
              const iOrderNumber = Number(
                String(oOrder.order || "").replace(/^MO-/, ""),
              );

              return Number.isInteger(iOrderNumber)
                ? Math.max(iHighestOrderNumber, iOrderNumber)
                : iHighestOrderNumber;
            }, 1000) + 1;

          const sOrderNumber = `MO-${iNextOrderNumber}`;

          // Step 2: Build maintenance order payload
          const oNewOrder = {
            order: sOrderNumber,
            equipment: oCreateOrderModel.getProperty("/selectedEquipment"),
            description: oCreateOrderModel.getProperty("/description"),
            plant: oCreateOrderModel.getProperty("/selectedPlant"),
            type: oCreateOrderModel.getProperty("/selectedMaintenanceType"),
            priority: oCreateOrderModel.getProperty("/selectedPriority"),
            priorityState: "Information",
            statusLabel: constants.STATUS.OPEN,
            statusKey: constants.STATUS.OPEN,
            statusState: "Indication15",
            planner: oCreateOrderModel.getProperty("/selectedPlanner"),
            scheduledFrom: oCreateOrderModel.getProperty("/scheduledStart"),
            scheduledTo: oCreateOrderModel.getProperty("/scheduledEnd"),
            scheduled: `${oCreateOrderModel.getProperty("/scheduledStart")} -> ${oCreateOrderModel.getProperty("/scheduledEnd")}`,
            operations: oCreateOrderModel.getProperty("/operations"),
            etag: 'W/"' + Date.now() + iNextOrderNumber + '"',
            materials: oCreateOrderModel.getProperty("/materials"),
            assignedTechnicians: [],
            isCritical:
              oCreateOrderModel.getProperty("/selectedPriority") ===
              constants.PRIORITY.CRITICAL,
            isOverdue: false,
          };

          // Step 3: Add order to model
          aOrders.unshift(oNewOrder);

          oOrdersModel.setProperty("/rows", aOrders);
          // Sync repository

          OrderRepository.addOrder(oNewOrder);

          // Step 4: Persist to CAP backend
          const aOperationsPayload = (oCreateOrderModel.getProperty("/operations") || []).map(op => ({
            order_no: sOrderNumber,
            no: String(op.operationNo || "10"),
            description: op.description || "",
            workCenter: "WC-001",
            technician: "T-001",
            plannedHours: Number(op.plannedHours || 0),
            actualHours: 0,
            status: "OPEN"
          }));

          CAPService.createOrder({
            order_no: sOrderNumber,
            equipment_no: oCreateOrderModel.getProperty("/selectedEquipment"),
            description: oCreateOrderModel.getProperty("/description"),
            plant: oCreateOrderModel.getProperty("/selectedPlant"),
            maintenance_type: oCreateOrderModel.getProperty("/selectedMaintenanceType"),
            priority: oCreateOrderModel.getProperty("/selectedPriority"),
            priority_state: "Information",
            status: constants.STATUS.OPEN,
            status_state: "Success",
            planner: oCreateOrderModel.getProperty("/selectedPlanner"),
            scheduled_from: oCreateOrderModel.getProperty("/scheduledStart"),
            scheduled_to: oCreateOrderModel.getProperty("/scheduledEnd"),
            operation_count: aOperationsPayload.length,
            completed_operation_count: 0,
            planned_hours: aOperationsPayload.reduce((sum, op) => sum + op.plannedHours, 0),
            actual_hours: 0,
            currency: "USD",
            etag: oNewOrder.etag,
            operations: aOperationsPayload
          }).catch(err => {
            console.error("Failed to persist order to CAP backend:", err);
          });

          // Step 5: Write audit history record
          AuditHistoryService.addEntry(
            sOrderNumber,
            "CREATE",
            "Maintenance order created",
            "Current User",
          );

          // Step 6: Refresh KPI counters
          this._parentController._refreshKpiCounts();

          // Step 7: Close dialog
          this._closeCreateOrderDialog();

          // Step 8: Show success notification
          MessageToast.show(
            oResourceBundle.getText("maintenanceOrderCreateSuccessMessage", [
              sOrderNumber,
            ]),
          );
        },
      },
    );
  },
);
