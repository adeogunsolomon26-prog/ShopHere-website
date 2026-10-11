/**
 * auth-system.js — ShopHere Authentication & Session Management
 * ──────────────────────────────────────────────────────────────
 * Manages password-based login sessions, token storage,
 * role switching, and API headers across all pages.
 */

window.ShopHereAuth = (function () {
  const STORAGE_KEY = "shophere_session";
  const DEFAULT_STATE = {
    authenticated: false,
    token: null,
    role: "superadmin",
    userName: "Iyiola",
    user: {
      username: "iyiola",
      displayName: "Iyiola",
      role: "superadmin",
      dbRole: "dbOwner"
    }
  };

  let state = loadSession();

  function loadSession() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn("Could not load session from localStorage", e);
    }
    return { ...DEFAULT_STATE };
  }

  function saveSession() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function getState() {
    return { ...state };
  }

  function setRole(role, userName) {
    state.role = role;
    state.userName = userName;
    state.authenticated = false;
    state.token = null;
    const dbRoleMap = { superadmin: "dbOwner", staff: "readWrite", consumer: "read" };
    state.user = {
      username: userName.toLowerCase(),
      displayName: userName,
      role: role,
      dbRole: dbRoleMap[role] || "read"
    };
    saveSession();
    notifyChange();
  }

  async function login(username, password) {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Login failed");

    state.authenticated = true;
    state.token = data.token;
    state.user = data.user;
    state.role = data.user.role;
    state.userName = data.user.displayName;
    saveSession();
    notifyChange();
    return data;
  }

  function logout() {
    if (state.token) {
      fetch("/api/auth/logout", {
        method: "POST",
        headers: { "x-auth-token": state.token }
      }).catch(() => {});
    }
    state = { ...DEFAULT_STATE, role: "consumer", userName: "Guest", user: { username: "consumer", displayName: "Guest Shopper", role: "consumer", dbRole: "read" } };
    saveSession();
    notifyChange();
  }

  function getHeaders() {
    const headers = {
      "Content-Type": "application/json",
      "x-user-role": state.role,
      "x-user-name": state.userName
    };
    if (state.token) {
      headers["x-auth-token"] = state.token;
    }
    return headers;
  }

  const listeners = [];
  function onAuthChange(fn) {
    listeners.push(fn);
  }
  function notifyChange() {
    listeners.forEach((fn) => {
      try { fn(state); } catch (e) { console.error(e); }
    });
  }

  // Create Universal Role & Navigation Toolbar DOM
  function renderGlobalNavbar(activePage = "store") {
    const container = document.getElementById("global-navbar");
    if (!container) return;

    const roleBadgeClasses = {
      superadmin: "bg-purple-50 text-purple-700 border-purple-200",
      staff: "bg-emerald-50 text-emerald-700 border-emerald-200",
      consumer: "bg-blue-50 text-blue-700 border-blue-200"
    };

    const roleLabels = {
      superadmin: "Super Admin (dbOwner)",
      staff: "Staff (readWrite)",
      consumer: "Consumer (readOnly)"
    };

    container.innerHTML = `
      <nav class="sticky top-0 z-40 w-full bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 transition-all shadow-sm">
        <div class="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          
          <!-- Brand + Live DB Status -->
          <div class="flex items-center space-x-3">
            <a href="/index.html" class="flex items-center space-x-2.5 text-slate-900 font-bold text-lg tracking-tight group">
              <span class="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center text-white text-sm shadow-sm group-hover:bg-blue-700 transition">🛒</span>
              <span class="text-slate-900 font-bold">ShopHere</span>
            </a>
            <div class="hidden sm:flex items-center space-x-1.5 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[11px] font-medium text-emerald-700">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <span>Atlas Live</span>
            </div>
          </div>

          <!-- Role Quick Switcher Segmented Control -->
          <div class="flex items-center space-x-0.5 bg-slate-100 p-0.5 rounded-md border border-slate-200 text-xs overflow-x-auto max-w-full">
            <button class="nav-role-btn px-2.5 py-1 rounded font-medium transition ${state.role === 'consumer' ? 'bg-white text-slate-900 shadow-sm border border-slate-200 font-semibold' : 'text-slate-600 hover:text-slate-900'}" data-role="consumer" data-name="Guest">
              🛒 Consumer
            </button>
            <button class="nav-role-btn px-2.5 py-1 rounded font-medium transition ${state.role === 'staff' && state.userName === 'Tomiwa' ? 'bg-white text-slate-900 shadow-sm border border-slate-200 font-semibold' : 'text-slate-600 hover:text-slate-900'}" data-role="staff" data-name="Tomiwa">
              👤 Tomiwa
            </button>
            <button class="nav-role-btn px-2.5 py-1 rounded font-medium transition ${state.role === 'staff' && state.userName === 'Solomon' ? 'bg-white text-slate-900 shadow-sm border border-slate-200 font-semibold' : 'text-slate-600 hover:text-slate-900'}" data-role="staff" data-name="Solomon">
              👤 Solomon
            </button>
            <button class="nav-role-btn px-2.5 py-1 rounded font-medium transition ${state.role === 'staff' && state.userName === 'Samuel' ? 'bg-white text-slate-900 shadow-sm border border-slate-200 font-semibold' : 'text-slate-600 hover:text-slate-900'}" data-role="staff" data-name="Samuel">
              👤 Samuel
            </button>
            <button class="nav-role-btn px-2.5 py-1 rounded font-medium transition ${state.role === 'superadmin' ? 'bg-white text-slate-900 shadow-sm border border-slate-200 font-semibold' : 'text-slate-600 hover:text-slate-900'}" data-role="superadmin" data-name="Iyiola">
              👑 Iyiola
            </button>
          </div>

          <!-- Actions: Onboarding Tour, Password Login Modal, Nav Links -->
          <div class="flex items-center space-x-2">
            <!-- Tour Button -->
            <button onclick="ShopHereTour.showTourSelector()" class="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-medium shadow-sm transition">
              <span>🎓</span>
              <span class="hidden md:inline">Role Tours</span>
            </button>

            <!-- Password Login Button -->
            <button onclick="ShopHereAuth.showLoginModal()" class="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md ${state.authenticated ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300' : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200'} text-xs font-medium transition">
              <span>🔐</span>
              <span class="hidden sm:inline">${state.authenticated ? 'Session Active' : 'Sign In'}</span>
            </button>

            <!-- Primary Nav Links -->
            <div class="flex items-center space-x-1 pl-2 border-l border-slate-200">
              <a href="/store.html" class="px-2.5 py-1.5 rounded-md text-xs font-medium transition ${activePage === 'store' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}">
                Store
              </a>
              <a href="/admin.html" class="px-2.5 py-1.5 rounded-md text-xs font-medium transition ${activePage === 'admin' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}">
                Admin
              </a>
              <a href="/admin.html#queries" onclick="if(window.location.pathname.includes('admin.html') && typeof switchTab === 'function') { switchTab('queries'); }" class="px-2.5 py-1.5 rounded-md text-xs font-medium transition ${activePage === 'queries' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'} flex items-center space-x-1">
                <span>💻</span>
                <span>Queries</span>
              </a>
              <a href="/admin-security.html" class="px-2.5 py-1.5 rounded-md text-xs font-medium transition ${activePage === 'security' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}">
                Security
              </a>
              <a href="/proof-of-work.html" class="px-2.5 py-1.5 rounded-md text-xs font-medium transition ${activePage === 'proof' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}">
                Proof
              </a>
            </div>
          </div>

        </div>
      </nav>
    `;

    // Role switcher events
    container.querySelectorAll(".nav-role-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        setRole(btn.dataset.role, btn.dataset.name);
      });
    });
  }

  // Quick Password Login Modal
  function showLoginModal() {
    const modalId = "shophere-login-modal";
    let modal = document.getElementById(modalId);
    if (modal) modal.remove();

    modal = document.createElement("div");
    modal.id = modalId;
    modal.className = "fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm";
    modal.innerHTML = `
      <div class="relative w-full max-w-md bg-white border border-slate-300 rounded-lg shadow-xl p-6 text-slate-800">
        <div class="flex items-center justify-between pb-3 border-b border-slate-200">
          <div class="flex items-center space-x-2">
            <span class="text-lg">🔐</span>
            <h3 class="text-base font-bold text-slate-900">Database Password Authentication</h3>
          </div>
          <button onclick="document.getElementById('${modalId}').remove()" class="text-slate-400 hover:text-slate-700 p-1 rounded-md text-sm">✕</button>
        </div>

        <p class="text-xs text-slate-500 mt-2.5">
          Sign in to generate a secure SHA-256 session token stored in MongoDB Atlas.
        </p>

        <!-- Quick Fill Helper Buttons -->
        <div class="mt-3.5 p-3 rounded-md bg-slate-50 border border-slate-200">
          <div class="text-[11px] font-semibold text-slate-600 uppercase tracking-wider mb-2">⚡ Quick Autofill Test Credentials:</div>
          <div class="flex flex-wrap gap-1.5">
            <button type="button" onclick="ShopHereAuth.fillCredentials('iyiola', 'Admin@2026')" class="px-2 py-1 text-xs rounded-md bg-white text-slate-800 hover:bg-slate-100 border border-slate-300 font-medium transition shadow-xs">
              👑 Iyiola (Admin@2026)
            </button>
            <button type="button" onclick="ShopHereAuth.fillCredentials('tomiwa', 'Staff@2026')" class="px-2 py-1 text-xs rounded-md bg-white text-slate-800 hover:bg-slate-100 border border-slate-300 font-medium transition shadow-xs">
              👤 Tomiwa
            </button>
            <button type="button" onclick="ShopHereAuth.fillCredentials('solomon', 'Staff@2026')" class="px-2 py-1 text-xs rounded-md bg-white text-slate-800 hover:bg-slate-100 border border-slate-300 font-medium transition shadow-xs">
              👤 Solomon
            </button>
            <button type="button" onclick="ShopHereAuth.fillCredentials('samuel', 'Staff@2026')" class="px-2 py-1 text-xs rounded-md bg-white text-slate-800 hover:bg-slate-100 border border-slate-300 font-medium transition shadow-xs">
              👤 Samuel
            </button>
            <button type="button" onclick="ShopHereAuth.fillCredentials('consumer', 'Shop@2026')" class="px-2 py-1 text-xs rounded-md bg-white text-slate-800 hover:bg-slate-100 border border-slate-300 font-medium transition shadow-xs">
              🛒 Consumer
            </button>
          </div>
        </div>

        <form id="auth-login-form" class="mt-4 space-y-3.5">
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Username</label>
            <input type="text" id="auth-input-username" required class="w-full px-3 py-2 rounded-md bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition placeholder:text-slate-400" placeholder="e.g. iyiola">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">Password</label>
            <input type="password" id="auth-input-password" required class="w-full px-3 py-2 rounded-md bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition placeholder:text-slate-400" placeholder="••••••••">
          </div>

          <div id="auth-error-msg" class="text-xs text-rose-700 font-medium bg-rose-50 border border-rose-200 p-2.5 rounded-md hidden"></div>

          <div class="flex items-center justify-end space-x-2 pt-2 border-t border-slate-200">
            <button type="button" onclick="document.getElementById('${modalId}').remove()" class="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-800 rounded-md border border-slate-300 hover:bg-slate-50 transition">
              Cancel
            </button>
            <button type="submit" id="auth-submit-btn" class="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition shadow-sm">
              Sign In →
            </button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(modal);

    const form = document.getElementById("auth-login-form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const u = document.getElementById("auth-input-username").value.trim();
      const p = document.getElementById("auth-input-password").value;
      const errBox = document.getElementById("auth-error-msg");
      const submitBtn = document.getElementById("auth-submit-btn");

      submitBtn.disabled = true;
      submitBtn.textContent = "Authenticating...";
      errBox.classList.add("hidden");

      try {
        await login(u, p);
        modal.remove();
        alert(`✅ Logged in successfully as ${state.userName} (${state.role.toUpperCase()})`);
      } catch (err) {
        errBox.textContent = `❌ ${err.message}`;
        errBox.classList.remove("hidden");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Sign In →";
      }
    });
  }

  function fillCredentials(u, p) {
    const un = document.getElementById("auth-input-username");
    const pw = document.getElementById("auth-input-password");
    if (un && pw) {
      un.value = u;
      pw.value = p;
    }
  }

  return {
    getState,
    setRole,
    login,
    logout,
    getHeaders,
    onAuthChange,
    renderGlobalNavbar,
    showLoginModal,
    fillCredentials
  };
})();
