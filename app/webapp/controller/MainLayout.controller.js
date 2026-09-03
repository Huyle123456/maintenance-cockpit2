sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Fragment",
    "sap/ui/Device",
    "sap/m/MessageToast",
    "com/fsoft/zpmmaintenancecockpit/model/AuthService"
  ],
  (Controller, JSONModel, Fragment, Device, MessageToast, AuthService) => {
    "use strict";

    return Controller.extend(
      "com.fsoft.zpmmaintenancecockpit.controller.MainLayout",
      {
        /**
         * Registers route synchronization and exposes the device model to the layout view.
         *
         * @returns {void}
         */
        onInit() {
          const oRouter = this.getOwnerComponent().getRouter();

          oRouter.attachRouteMatched(this.onRouteMatched, this);

          // Register device model to bind responsive visibility in view
          const oDeviceModel = new JSONModel(Device);
          oDeviceModel.setDefaultBindingMode("OneWay");
          this.getView().setModel(oDeviceModel, "device");
        },

        /**
         * Synchronizes the selected navigation item with the active route.
         *
         * @param {sap.ui.base.Event} oEvent Router matched event.
         * @returns {void}
         */
        onRouteMatched(oEvent) {
          const sRouteName = oEvent.getParameter("name");

          const oSideNavigation = this.getView().byId("sideNavigation");

          if (!oSideNavigation) {
            return;
          }

          if (
            sRouteName === "RouteMaintenanceOrders" ||
            sRouteName === "RouteOrderDetail"
          ) {
            oSideNavigation.setSelectedKey("orders");
            return;
          }

          if (sRouteName === "RouteEquipment") {
            oSideNavigation.setSelectedKey("equipment");
            return;
          }

          if (sRouteName === "RouteOperationsDashboard") {
            oSideNavigation.setSelectedKey("operations");
            return;
          }

          if (sRouteName === "RouteTechnicians") {
            oSideNavigation.setSelectedKey("technicians");
            return;
          }

          if (sRouteName === "RouteAuditHistory") {
            oSideNavigation.setSelectedKey("auditHistory");
            return;
          }
        },

        /**
         * Selects a side-navigation item and navigates to its corresponding route.
         *
         * @param {sap.ui.base.Event} oEvent Side-navigation item press event.
         * @returns {void}
         */
        onItemPress(oEvent) {
          const item = oEvent.getParameter("item");

          if (!item) {
            return;
          }

          const sKey = item.getKey();

          this.getView().byId("sideNavigation").setSelectedKey(sKey);

          const oRouter = this.getOwnerComponent().getRouter();

          if (sKey === "orders") {
            oRouter.navTo("RouteMaintenanceOrders");
            return;
          }

          if (sKey === "equipment") {
            oRouter.navTo("RouteEquipment");
            return;
          }

          if (sKey === "operations") {
            oRouter.navTo("RouteOperationsDashboard");
            return;
          }

          if (sKey === "technicians") {
            oRouter.navTo("RouteTechnicians");
            return;
          }

          if (sKey === "auditHistory") {
            oRouter.navTo("RouteAuditHistory");
            return;
          }

          if (sKey === "processRules") {
            this.onOpenProcessBusinessRules();
            return;
          }
        },

        /**
         * Loads and opens the process business rules dialog on demand.
         *
         * @returns {void}
         */
        onOpenProcessBusinessRules() {
          const oView = this.getView();
          if (!this._oProcessRulesDialog) {
            this._oProcessRulesDialog = Fragment.load({
              id: oView.getId(),
              name: "com.fsoft.zpmmaintenancecockpit.view.fragment.ProcessBusinessRulesDialog",
              controller: this,
            }).then((oDialog) => {
              oView.addDependent(oDialog);
              return oDialog;
            });
          }
          this._oProcessRulesDialog.then((oDialog) => oDialog.open());
        },

        /**
         * Closes the process business rules dialog when it has been created.
         *
         * @returns {void}
         */
        onCloseProcessBusinessRules() {
          if (this._oProcessRulesDialog) {
            this._oProcessRulesDialog.then((oDialog) => oDialog.close());
          }
        },

        /**
         * Toggles the expanded state of the side navigation on supported devices.
         *
         * @returns {void}
         */
        onToggleSidebar() {
          const oToolPage = this.getView().byId("toolPage");
          if (oToolPage) {
            oToolPage.setSideExpanded(!oToolPage.getSideExpanded());
          }
        },

        /**
         * Opens the user profile & account switcher popover.
         *
         * @param {sap.ui.base.Event} oEvent Avatar press event.
         * @returns {void}
         */
        onUserAvatarPress(oEvent) {
          const oView = this.getView();
          const oSource = oEvent.getSource();

          if (!this._oUserPopoverPromise) {
            this._oUserPopoverPromise = Fragment.load({
              id: oView.getId(),
              name: "com.fsoft.zpmmaintenancecockpit.view.fragment.UserProfilePopover",
              controller: this,
            }).then((oPopover) => {
              oView.addDependent(oPopover);
              return oPopover;
            });
          }

          this._oUserPopoverPromise.then((oPopover) => {
            oPopover.openBy(oSource);
          });
        },

        /**
         * Switches the active user account and updates role permissions.
         *
         * @param {sap.ui.base.Event} oEvent SegmentedButton select event.
         * @returns {void}
         */
        onSwitchAccount(oEvent) {
          const sKey = oEvent.getParameter("key") || oEvent.getSource().getSelectedKey();
          const oUser = AuthService.switchAccount(sKey);

          const oI18n = this.getView().getModel("i18n").getResourceBundle();
          const sMsg = oI18n.getText("userSwitchedSuccess", [oUser.name, oUser.roleText]) ||
            `Switched to ${oUser.name} (${oUser.roleText})`;
          MessageToast.show(sMsg);
        },

        /**
         * Closes the user profile popover.
         *
         * @returns {void}
         */
        onCloseUserPopover() {
          if (this._oUserPopoverPromise) {
            this._oUserPopoverPromise.then((oPopover) => oPopover.close());
          }
        },
      },
    );
  },
);