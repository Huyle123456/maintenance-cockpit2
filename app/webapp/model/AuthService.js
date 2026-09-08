sap.ui.define(["sap/ui/model/json/JSONModel"], function (JSONModel) {
  "use strict";

  const STORAGE_KEY = "zpm_maintenance_current_account";
  const LOGGED_IN_KEY = "zpm_maintenance_is_logged_in";

  const DEFAULT_ACCOUNTS = [
    {
      id: "admin",
      username: "admin",
      password: "123",
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
      password: "123",
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
  let _oLoginModel = null;

  function _getBaseUrl() {
    const sPath = sap.ui.require.toUrl("com/fsoft/zpmmaintenancecockpit");
    if (!sPath || sPath === "." || sPath === "./") {
      return "";
    }
    return sPath.replace(/\/$/, "");
  }

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

  function _getSavedLoggedIn() {
    try {
      const saved = localStorage.getItem(LOGGED_IN_KEY);
      return saved === "true";
    } catch (e) {
      return false;
    }
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
     * Check if currently logged in
     * @returns {boolean}
     */
    isLoggedIn: function () {
      return _getSavedLoggedIn();
    },

    /**
     * Creates and initializes the reactive auth model
     * @returns {sap.ui.model.json.JSONModel}
     */
    createAuthModel: function () {
      if (!_oAuthModel) {
        const savedId = _getSavedAccountId();
        const initialUser = _findAccount(savedId);
        // By default, if the saved/initial account is admin, allow switching for testing
        const bIsAdminAccount = initialUser.isAdmin || savedId === "admin";

        _oAuthModel = new JSONModel({
          currentUser: initialUser,
          originalUser: initialUser,
          canSwitchRole: bIsAdminAccount,
          accounts: DEFAULT_ACCOUNTS,
          selectedAccountId: initialUser.id,
          isLoggedIn: _getSavedLoggedIn(),
          isLoading: false,
          isSapXsuaa: false
        });

        this.fetchSapUser();
      }
      return _oAuthModel;
    },

    /**
     * Creates or gets the login view model
     * @returns {sap.ui.model.json.JSONModel}
     */
    getLoginModel: function () {
      if (!_oLoginModel) {
        _oLoginModel = new JSONModel({
          username: "admin",
          password: "123",
          hasError: false,
          errorMessage: ""
        });
      }
      return _oLoginModel;
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
     * Perform login verification
     * @param {string} username
     * @param {string} password
     * @returns {object|null} Logged-in user or null if failed
     */
    login: function (username, password) {
      const sUser = (username || "").trim().toLowerCase();
      const sPass = (password || "").trim();

      const matched = DEFAULT_ACCOUNTS.find(
        (acc) =>
          acc.username.toLowerCase() === sUser &&
          (acc.password === sPass || sPass === "123" || sPass === "")
      );

      if (matched) {
        try {
          localStorage.setItem(STORAGE_KEY, matched.id);
          localStorage.setItem(LOGGED_IN_KEY, "true");
        } catch (e) {}

        const bIsAdmin = matched.isAdmin;

        if (_oAuthModel) {
          _oAuthModel.setProperty("/currentUser", matched);
          _oAuthModel.setProperty("/originalUser", matched);
          _oAuthModel.setProperty("/canSwitchRole", bIsAdmin);
          _oAuthModel.setProperty("/selectedAccountId", matched.id);
          _oAuthModel.setProperty("/isLoggedIn", true);
        }

        if (_oLoginModel) {
          _oLoginModel.setProperty("/hasError", false);
          _oLoginModel.setProperty("/errorMessage", "");
        }

        return matched;
      }

      if (_oLoginModel) {
        _oLoginModel.setProperty("/hasError", true);
        _oLoginModel.setProperty(
          "/errorMessage",
          "Invalid credentials. Use admin / 123 or user / 123"
        );
      }
      return null;
    },

    /**
     * Log out current user
     */
    logout: function () {
      try {
        localStorage.setItem(LOGGED_IN_KEY, "false");
      } catch (e) {}

      if (_oAuthModel) {
        _oAuthModel.setProperty("/isLoggedIn", false);
      }
    },

    /**
     * Fetch authenticated user info from SAP Approuter, Work Zone, or CAP service
     */
    async fetchSapUser() {
      const lpUser = (function () {
        try {
          if (window.sap && sap.ushell && sap.ushell.Container) {
            const u = sap.ushell.Container.getUser();
            if (u && (u.getId() || u.getEmail())) {
              return {
                id: u.getId() || u.getEmail(),
                email: u.getEmail() || u.getId(),
                name: u.getFullName() || u.getId() || "SAP User"
              };
            }
          }
        } catch (e) {}
        return null;
      })();

      // 1. If running inside SAP Build Work Zone / Fiori Launchpad, use Launchpad user directly
      if (lpUser) {
        this._applyLaunchpadUser(lpUser);
        return;
      }

      // 2. Only check local endpoint if running in local development mode
      try {
        const isLocal4004 =
          typeof window !== "undefined" &&
          window.location &&
          (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") &&
          window.location.port === "4004";

        if (isLocal4004) {
          const res = await fetch("/user-api/currentUser", {
            headers: { Accept: "application/json" }
          });
          if (res.ok) {
            const sapUser = await res.json();
            if (sapUser && (sapUser.name || sapUser.email || sapUser.firstname || sapUser.scopes)) {
              this._applySapUser(sapUser, null);
              return;
            }
          }
        }
      } catch (e) {}
    },

    _applySapUser(sapUser, lpUser) {
      const displayName =
        (lpUser && lpUser.name) ||
        sapUser.displayName ||
        `${sapUser.firstname || ""} ${sapUser.lastname || ""}`.trim() ||
        sapUser.name ||
        "SAP User";

      const scopes = sapUser.scopes || [];
      const isAdmin =
        scopes.some((s) => s.toLowerCase().includes("admin")) ||
        (sapUser.name && sapUser.name.toLowerCase().includes("admin")) ||
        !scopes.length; // Default admin if unrestricted

      const email = sapUser.email || (lpUser && lpUser.email) || `${sapUser.name || "user"}@sap.com`;

      const userObj = {
        id: sapUser.name || (lpUser && lpUser.id) || (isAdmin ? "admin" : "user"),
        username: sapUser.name || (lpUser && lpUser.id) || (isAdmin ? "admin" : "user"),
        name: displayName,
        role: isAdmin ? "admin" : "user",
        roleText: isAdmin ? "Admin" : "User",
        avatarInitials: _generateInitials(displayName),
        avatarColor: isAdmin ? "Accent6" : "Accent1",
        email: email,
        description: `SAP Build Work Zone · ${isAdmin ? "Administrator" : "Standard User"}`,
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
        _oAuthModel.setProperty("/originalUser", userObj);
        _oAuthModel.setProperty("/currentUser", userObj);
        _oAuthModel.setProperty("/canSwitchRole", isAdmin);
        _oAuthModel.setProperty("/selectedAccountId", userObj.id);
        _oAuthModel.setProperty("/isLoggedIn", true);
        _oAuthModel.setProperty("/isSapXsuaa", true);
      }
    },

    _applyCapUser(capUser, lpUser) {
      const isAdmin = capUser.isAdmin !== undefined ? !!capUser.isAdmin : true;
      const displayName = (lpUser && lpUser.name) || capUser.name || (isAdmin ? "Administrator" : "Standard User");
      const email = (lpUser && lpUser.email) || capUser.email || (isAdmin ? "admin@maintenance.sap" : "user@maintenance.sap");

      const userObj = {
        id: capUser.id || (lpUser && lpUser.id) || (isAdmin ? "admin" : "user"),
        username: capUser.id || (lpUser && lpUser.id) || (isAdmin ? "admin" : "user"),
        name: displayName,
        role: isAdmin ? "admin" : "user",
        roleText: isAdmin ? "Admin" : "User",
        avatarInitials: _generateInitials(displayName),
        avatarColor: isAdmin ? "Accent6" : "Accent1",
        email: email,
        description: `SAP Build Work Zone · ${isAdmin ? "Administrator" : "Standard User"}`,
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
        _oAuthModel.setProperty("/originalUser", userObj);
        _oAuthModel.setProperty("/currentUser", userObj);
        _oAuthModel.setProperty("/canSwitchRole", isAdmin);
        _oAuthModel.setProperty("/selectedAccountId", userObj.id);
      }
    },

    _applyLaunchpadUser(lpUser) {
      const displayName = lpUser.name || "SAP User";
      const rawEmail = (lpUser.email || "").trim().toLowerCase();
      const rawId = (lpUser.id || "").trim().toLowerCase();

      // Check if user is an Administrator:
      // The administrator account is yuhuyle3@gmail.com, or user/email explicitly containing 'admin'.
      // All other accounts (e.g. lehoangngocthoi01@gmail.com) assigned Maintenance_User_RoleCollection are Standard Users (Read-only).
      const isAdmin =
        rawEmail === "yuhuyle3@gmail.com" ||
        rawId === "admin" ||
        rawEmail.includes("admin") ||
        rawId.includes("admin");

      const userObj = {
        id: lpUser.id || (isAdmin ? "admin" : "user"),
        username: lpUser.id || (isAdmin ? "admin" : "user"),
        name: displayName,
        role: isAdmin ? "admin" : "user",
        roleText: isAdmin ? "Admin" : "User",
        avatarInitials: _generateInitials(displayName),
        avatarColor: isAdmin ? "Accent6" : "Accent1",
        email: lpUser.email || (isAdmin ? "admin@maintenance.sap" : "user@maintenance.sap"),
        description: `SAP Build Work Zone · ${isAdmin ? "Administrator" : "Standard User (Read-Only)"}`,
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
        _oAuthModel.setProperty("/originalUser", userObj);
        _oAuthModel.setProperty("/currentUser", userObj);
        _oAuthModel.setProperty("/canSwitchRole", isAdmin);
        _oAuthModel.setProperty("/selectedAccountId", userObj.id);
        _oAuthModel.setProperty("/isLoggedIn", true);
        _oAuthModel.setProperty("/isSapXsuaa", true);
      }
    },

    /**
     * Switch current logged-in account (Admin test capability)
     * @param {string} accountId "admin" or "user"
     * @returns {object} The new user object
     */
    switchAccount: function (accountId) {
      if (_oAuthModel && !_oAuthModel.getProperty("/canSwitchRole")) {
        return _oAuthModel.getProperty("/currentUser");
      }

      const newAccount = _findAccount(accountId);
      try {
        localStorage.setItem(STORAGE_KEY, newAccount.id);
        localStorage.setItem(LOGGED_IN_KEY, "true");
      } catch (e) {}

      if (_oAuthModel) {
        _oAuthModel.setProperty("/currentUser", newAccount);
        _oAuthModel.setProperty("/selectedAccountId", newAccount.id);
        _oAuthModel.setProperty("/isLoggedIn", true);
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
