sap.ui.define([
    "sap/ui/model/json/JSONModel",
    "sap/ui/Device",
    "com/fsoft/zpmmaintenancecockpit/model/AuthService"
], 
function (JSONModel, Device, AuthService) {
    "use strict";

    return {
        /**
         * Provides runtime information for the device the UI5 app is running on as a JSONModel.
         * @returns {sap.ui.model.json.JSONModel} The device model.
         */
        createDeviceModel: function () {
            var oModel = new JSONModel(Device);
            oModel.setDefaultBindingMode("OneWay");
            return oModel;
        },

        /**
         * Creates and returns the auth model.
         * @returns {sap.ui.model.json.JSONModel} The auth model.
         */
        createAuthModel: function () {
            return AuthService.createAuthModel();
        }
    };
});