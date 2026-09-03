sap.ui.define(["sap/ui/model/json/JSONModel"], function (JSONModel) {
  "use strict";

  const STORAGE_KEY = "zpm_maintenance_current_account";

  const DEFAULT_ACCOUNTS = [
    {
      id: "admin",
      username: "admin",
      name: "Administrator",
      role: "admin",
      roleText: "Admin",
      avatarInitials: "AD",
      avatarColor: "Accent6",
      email: "admin@maintenance.sap",
      description: "SAP XSUAA Administrator · Full control",
      isAdmin: true,
      isUser: false,
      permissions: {
        createOrder: true,
        massChange: true,
        editOrder: true,
        deleteOrder: true,
        cancelOrder: true,
        completeOrder: true,
        addOperation: true,
        deleteOperation: true,
        batchEditOperations: true,
        addMaterial: true,
        assignTechnician: true,
        export: true
      }
    },
    {
      id: "user",
      username: "user",
      name: "Standard User",
      role: "user",
      roleText: "User",
      avatarInitials: "US",
      avatarColor: "Accent1",
      email: "user@maintenance.sap",
      description: "SAP XSUAA Standard User · Read-only access",
      isAdmin: false,
      isUser: true,
      permissions: {
        createOrder: false,
        massChange: false,
        editOrder: false,
        deleteOrder: false,
        cancelOrder: false,
        completeOrder: false,
        addOperation: false,
        deleteOperation: false,
        batchEditOperations: false,
        addMaterial: false,
        assignTechnician: false,
        export: true
      }
    }
  ];

  let _oAuthModel = null;

  function _generateInitials(name) {
    if (!name) return "US";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0].substring(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function _getSavedAccountId() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && DEFAULT_ACCOUNTS.some((acc) => acc.id === saved)) {
        return saved;
      }
    } catch (e) {
      // Storage fallback
    }
    return "admin";
  }

  function _findAccount(accountId) {
    return (
      DEFAULT_ACCOUNTS.find((acc) => acc.id === accountId) || DEFAULT_ACCOUNTS[0]
    );
  }

  return {
    /**
     * Get list of preset accounts
     * @returns {Array}
     */
    getAccounts: function () {
      return DEFAULT_ACCOUNTS;
    },

    /**
     * Creates and initializes the reactive auth model
     * @returns {sap.ui.model.json.JSONModel}
     */
    createAuthModel: function () {
      if (!_oAuthModel) {
        const savedId = _getSavedAccountId();
        const initialUser = _findAccount(savedId);

        _oAuthModel = new JSONModel({
          currentUser: initialUser,
          accounts: DEFAULT_ACCOUNTS,
          selectedAccountId: initialUser.id,
          isLoading: false,
          isSapXsuaa: false
        });

        // Asynchronously check SAP Approuter or CAP User Info API
        this.fetchSapUser();
      }
      return _oAuthModel;
    },

    /**
     * Get the singleton auth model instance
     * @returns {sap.ui.model.json.JSONModel}
     */
    getAuthModel: function () {
      if (!_oAuthModel) {
        return this.createAuthModel();
      }
      return _oAuthModel;
    },

    /**
     * Fetch authenticated user info from SAP Approuter (/user-api/currentUser)
     * or CAP service (/odata/v4/maintenance/getUserInfo())
     */
    async fetchSapUser() {
      // Try SAP Approuter /user-api/currentUser first
      try {
        const res = await fetch("/user-api/currentUser", {
          headers: { Accept: "application/json" }
        });
        if (res.ok) {
          const sapUser = await res.json();
          if (sapUser && (sapUser.name || sapUser.email || sapUser.firstname)) {
            this._applySapUser(sapUser);
            return;
          }
        }
      } catch (e) {
        // Approuter user-api not available in local mock
      }

      // Try CAP getUserInfo()
      try {
        const resCap = await fetch("/odata/v4/maintenance/getUserInfo()", {
          headers: { Accept: "application/json" }
        });
        if (resCap.ok) {
          const capUser = await resCap.json();
          if (capUser && capUser.name && capUser.name !== "anonymous") {
            this._applyCapUser(capUser);
            return;
          }
        }
      } catch (e) {
        // Fall back to preset account
      }
    },

    _applySapUser(sapUser) {
      const displayName =
        sapUser.displayName ||
        `${sapUser.firstname || ""} ${sapUser.lastname || ""}`.trim() ||
        sapUser.name ||
        "SAP User";

      const scopes = sapUser.scopes || [];
      const isAdmin =
        scopes.some((s) => s.toLowerCase().includes("admin")) ||
        (sapUser.name && sapUser.name.toLowerCase().includes("admin"));

      const userObj = {
        id: sapUser.name || (isAdmin ? "admin" : "user"),
        username: sapUser.name || (isAdmin ? "admin" : "user"),
        name: displayName,
        role: isAdmin ? "admin" : "user",
        roleText: isAdmin ? "Admin" : "User",
        avatarInitials: _generateInitials(displayName),
        avatarColor: isAdmin ? "Accent6" : "Accent1",
        email: sapUser.email || `${sapUser.name || "user"}@sap.com`,
        description: `SAP XSUAA Login · ${isAdmin ? "Administrator" : "Standard User"}`,
        isAdmin: isAdmin,
        isUser: !isAdmin,
        permissions: {
          createOrder: isAdmin,
          massChange: isAdmin,
          editOrder: isAdmin,
          deleteOrder: isAdmin,
          cancelOrder: isAdmin,
          completeOrder: isAdmin,
          addOperation: isAdmin,
          deleteOperation: isAdmin,
          batchEditOperations: isAdmin,
          addMaterial: isAdmin,
          assignTechnician: isAdmin,
          export: true
        }
      };

      if (_oAuthModel) {
        _oAuthModel.setProperty("/currentUser", userObj);
        _oAuthModel.setProperty("/selectedAccountId", userObj.id);
        _oAuthModel.setProperty("/isSapXsuaa", true);
      }
    },

    _applyCapUser(capUser) {
      const isAdmin = !!capUser.isAdmin;
      const displayName = capUser.name || (isAdmin ? "Administrator" : "Standard User");

      const userObj = {
        id: capUser.id || (isAdmin ? "admin" : "user"),
        username: capUser.id || (isAdmin ? "admin" : "user"),
        name: displayName,
        role: isAdmin ? "admin" : "user",
        roleText: isAdmin ? "Admin" : "User",
        avatarInitials: _generateInitials(displayName),
        avatarColor: isAdmin ? "Accent6" : "Accent1",
        email: capUser.email || (isAdmin ? "admin@maintenance.sap" : "user@maintenance.sap"),
        description: `SAP CAP Auth · ${isAdmin ? "Administrator" : "Standard User"}`,
        isAdmin: isAdmin,
        isUser: !isAdmin,
        permissions: {
          createOrder: isAdmin,
          massChange: isAdmin,
          editOrder: isAdmin,
          deleteOrder: isAdmin,
          cancelOrder: isAdmin,
          completeOrder: isAdmin,
          addOperation: isAdmin,
          deleteOperation: isAdmin,
          batchEditOperations: isAdmin,
          addMaterial: isAdmin,
          assignTechnician: isAdmin,
          export: true
        }
      };

      if (_oAuthModel) {
        _oAuthModel.setProperty("/currentUser", userObj);
        _oAuthModel.setProperty("/selectedAccountId", userObj.id);
      }
    },

    /**
     * Switch current logged-in account
     * @param {string} accountId "admin" or "user"
     * @returns {object} The new user object
     */
    switchAccount: function (accountId) {
      const newAccount = _findAccount(accountId);
      try {
        localStorage.setItem(STORAGE_KEY, newAccount.id);
      } catch (e) {
        // Storage fallback
      }

      if (_oAuthModel) {
        _oAuthModel.setProperty("/currentUser", newAccount);
        _oAuthModel.setProperty("/selectedAccountId", newAccount.id);
      }

      return newAccount;
    },

    /**
     * Get current user
     * @returns {object} Current user object
     */
    getCurrentUser: function () {
      if (_oAuthModel) {
        return _oAuthModel.getProperty("/currentUser");
      }
      return _findAccount(_getSavedAccountId());
    }
  };
});
