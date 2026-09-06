sap.ui.define([
    "sap/ui/core/UIComponent",
    "com/fsoft/zpmmaintenancecockpit/model/models",
    "sap/ui/core/Theming"
], (UIComponent, models, Theming) => {
    "use strict";

    return UIComponent.extend("com.fsoft.zpmmaintenancecockpit.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init() {
            // Apply SAP Fiori 3 (Quartz Light) theme
            try {
                if (Theming && Theming.setTheme) {
                    Theming.setTheme("sap_fiori_3");
                } else if (sap.ui.getCore && sap.ui.getCore().applyTheme) {
                    sap.ui.getCore().applyTheme("sap_fiori_3");
                }
            } catch (e) {}

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