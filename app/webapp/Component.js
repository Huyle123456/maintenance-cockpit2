sap.ui.define([
    "sap/ui/core/UIComponent",
    "com/fsoft/zpmmaintenancecockpit/model/models"
], (UIComponent, models) => {
    "use strict";

    return UIComponent.extend("com.fsoft.zpmmaintenancecockpit.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init() {
            // call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // set the device model
            this.setModel(models.createDeviceModel(), "device");

            // set the global auth model
            this.setModel(models.createAuthModel(), "auth");

            // enable routing
            this.getRouter().initialize();
        }
    });
});