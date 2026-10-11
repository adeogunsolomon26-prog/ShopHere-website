/**
 * tour-system.js — ShopHere Interactive Onboarding & Presentation Tour
 * ──────────────────────────────────────────────────────────────────
 * Provides an interactive step-by-step guided presentation modal
 * for New Database Hires, Super Admin (Iyiola), Staff, and Consumers.
 */

window.ShopHereTour = (function () {
  let currentTourData = null;
  let currentStepIndex = 0;

  // Create modal container if not exists
  function ensureTourDOM() {
    if (document.getElementById("shophere-tour-overlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "shophere-tour-overlay";
    overlay.className = "fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm hidden transition-opacity duration-300 opacity-0";
    overlay.innerHTML = `
      <div id="shophere-tour-card" class="relative w-full max-w-xl bg-white border border-slate-300 rounded-lg shadow-xl p-6 sm:p-7 text-slate-800 transform transition-all duration-300 scale-95">
        <!-- Top Badge & Close -->
        <div class="flex items-center justify-between pb-3 border-b border-slate-200">
          <div class="flex items-center space-x-2.5">
            <span id="tour-role-badge" class="px-2.5 py-0.5 text-xs font-semibold rounded-md bg-blue-50 text-blue-700 border border-blue-200">
              ROLE ONBOARDING
            </span>
            <span id="tour-step-counter" class="text-xs font-medium text-slate-500">Step 1 of 5</span>
          </div>
          <button id="tour-close-btn" class="text-slate-400 hover:text-slate-700 p-1 rounded-md hover:bg-slate-100 transition">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>

        <!-- Progress Bar -->
        <div class="w-full bg-slate-100 h-1.5 rounded-full mt-3.5 overflow-hidden">
          <div id="tour-progress-bar" class="bg-blue-600 h-full transition-all duration-300" style="width: 20%"></div>
        </div>

        <!-- Tour Content -->
        <div class="my-5">
          <div class="flex items-start space-x-3.5">
            <div id="tour-step-icon" class="text-3xl p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex-shrink-0">
              👑
            </div>
            <div>
              <h3 id="tour-step-title" class="text-lg font-bold text-slate-900 tracking-tight">Step Title</h3>
              <p id="tour-step-desc" class="mt-1.5 text-sm text-slate-600 leading-relaxed">Step description text goes here.</p>
            </div>
          </div>

          <!-- Action Callout Box (if applicable) -->
          <div id="tour-action-box" class="mt-4 p-3 rounded-md bg-blue-50 border border-blue-200 text-xs text-blue-900 hidden">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-2 text-xs text-blue-800 font-medium">
                <svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                <span>Interactive Presentation Action</span>
              </div>
              <button id="tour-action-btn" class="px-3 py-1.5 text-xs font-semibold rounded-md bg-blue-600 hover:bg-blue-700 text-white transition shadow-sm">
                Explore Feature →
              </button>
            </div>
          </div>
        </div>

        <!-- Footer Navigation -->
        <div class="flex items-center justify-between pt-3.5 border-t border-slate-200">
          <button id="tour-prev-btn" class="px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 bg-white border border-slate-300 rounded-md transition disabled:opacity-40 disabled:cursor-not-allowed">
            ← Previous
          </button>
          
          <div class="flex items-center space-x-1.5" id="tour-dots-container">
            <!-- Dynamic step dots -->
          </div>

          <button id="tour-next-btn" class="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition shadow-sm">
            Next Step →
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Event listeners
    document.getElementById("tour-close-btn").addEventListener("click", closeTour);
    document.getElementById("tour-prev-btn").addEventListener("click", prevStep);
    document.getElementById("tour-next-btn").addEventListener("click", nextStep);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeTour();
    });
  }

  async function startTour(role = "superadmin") {
    ensureTourDOM();
    try {
      const res = await fetch(`/api/demo/tour/${role}`);
      if (!res.ok) throw new Error("Tour not found");
      currentTourData = await res.json();
      currentStepIndex = 0;
      renderCurrentStep();
      openModal();
    } catch (err) {
      console.warn("Tour fallback to local data", err);
      currentTourData = getLocalTourData(role);
      currentStepIndex = 0;
      renderCurrentStep();
      openModal();
    }
  }

  function renderCurrentStep() {
    if (!currentTourData || !currentTourData.steps) return;
    const step = currentTourData.steps[currentStepIndex];
    const total = currentTourData.steps.length;

    // Badges & Counters
    const badge = document.getElementById("tour-role-badge");
    badge.textContent = currentTourData.title;
    document.getElementById("tour-step-counter").textContent = `Step ${currentStepIndex + 1} of ${total}`;

    // Progress Bar
    const pct = ((currentStepIndex + 1) / total) * 100;
    document.getElementById("tour-progress-bar").style.width = `${pct}%`;

    // Content
    document.getElementById("tour-step-icon").textContent = step.icon || "💡";
    document.getElementById("tour-step-title").textContent = step.title;
    document.getElementById("tour-step-desc").textContent = step.description;

    // Action button
    const actionBox = document.getElementById("tour-action-box");
    const actionBtn = document.getElementById("tour-action-btn");
    if (step.action && step.action.target) {
      actionBox.classList.remove("hidden");
      actionBtn.onclick = () => {
        closeTour();
        if (window.location.pathname !== step.action.target) {
          window.location.href = step.action.target;
        } else if (step.action.section) {
          const el = document.getElementById(step.action.section) || document.querySelector(`[data-section="${step.action.section}"]`);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      };
    } else {
      actionBox.classList.add("hidden");
    }

    // Previous / Next buttons
    const prevBtn = document.getElementById("tour-prev-btn");
    const nextBtn = document.getElementById("tour-next-btn");
    prevBtn.disabled = currentStepIndex === 0;

    if (currentStepIndex === total - 1) {
      nextBtn.textContent = "Finish Tour 🎉";
      nextBtn.className = "px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-xl transition shadow-lg shadow-emerald-600/30";
    } else {
      nextBtn.textContent = "Next Step →";
      nextBtn.className = "px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 rounded-xl transition shadow-lg shadow-indigo-600/30";
    }

    // Dots
    const dotsContainer = document.getElementById("tour-dots-container");
    dotsContainer.innerHTML = "";
    for (let i = 0; i < total; i++) {
      const dot = document.createElement("button");
      dot.className = `w-2 h-2 rounded-full transition-all ${i === currentStepIndex ? "w-6 bg-indigo-400" : "bg-slate-700 hover:bg-slate-600"}`;
      dot.addEventListener("click", () => {
        currentStepIndex = i;
        renderCurrentStep();
      });
      dotsContainer.appendChild(dot);
    }
  }

  function nextStep() {
    if (!currentTourData) return;
    if (currentStepIndex < currentTourData.steps.length - 1) {
      currentStepIndex++;
      renderCurrentStep();
    } else {
      closeTour();
    }
  }

  function prevStep() {
    if (!currentTourData) return;
    if (currentStepIndex > 0) {
      currentStepIndex--;
      renderCurrentStep();
    }
  }

  function openModal() {
    const overlay = document.getElementById("shophere-tour-overlay");
    const card = document.getElementById("shophere-tour-card");
    overlay.classList.remove("hidden");
    setTimeout(() => {
      overlay.classList.remove("opacity-0");
      card.classList.remove("scale-95");
      card.classList.add("scale-100");
    }, 10);
  }

  function closeTour() {
    const overlay = document.getElementById("shophere-tour-overlay");
    const card = document.getElementById("shophere-tour-card");
    if (!overlay) return;
    overlay.classList.add("opacity-0");
    card.classList.remove("scale-100");
    card.classList.add("scale-95");
    setTimeout(() => {
      overlay.classList.add("hidden");
    }, 300);
  }

  function getLocalTourData(role) {
    if (role === "superadmin") {
      return {
        title: "Super Admin Tour — Iyiola",
        subtitle: "Full authority over ShopHere Database & Users",
        steps: [
          { title: "Welcome, Iyiola! 👑", description: "As Super Admin (dbOwner), you have complete control over the entire ShopHere system, schemas, and user credentials.", icon: "👑" },
          { title: "User & Password Management", description: "Exclusive power: Change any user role, reset passwords with SHA-256 updates, toggle account status, or provision new staff accounts.", icon: "👥", action: { target: "/admin-security.html", section: "users" } },
          { title: "RBAC Permission Matrix", description: "View the complete 17-permission matrix across all 3 roles: Super Admin, Staff, and Consumer.", icon: "🛡️", action: { target: "/admin-security.html", section: "rbac" } },
          { title: "Inventory & Order Control", description: "Manage orders. When orders are received, atomic triggers instantly update stock and fire reorder alerts.", icon: "📦", action: { target: "/admin.html", section: "orders" } },
          { title: "Backups & Disaster Recovery", description: "Trigger full mongodump database backups and daily order mongoexports with one click.", icon: "💾", action: { target: "/admin-security.html", section: "backup" } },
          { title: "Atlas Storage Capacity Alerts", description: "Monitor cluster storage at 80% (warning) and 95% (critical) thresholds.", icon: "📊", action: { target: "/admin-security.html", section: "storage" } },
          { title: "Audit Log Trail", description: "Inspect timestamped audit logs of all administrative actions and security events.", icon: "📋", action: { target: "/admin-security.html", section: "audit" } }
        ]
      };
    } else if (role === "staff") {
      return {
        title: "Staff Tour — Inventory Manager",
        subtitle: "Operational access for Tomiwa, Solomon & Samuel",
        steps: [
          { title: "Welcome to the Team! 👋", description: "As an Inventory Manager (readWrite), you maintain inventory counts, verify shipments, and monitor stock health.", icon: "👋" },
          { title: "Stock Level Oversight", description: "Track items in real time. Edit physical stock counts and identify low-inventory products.", icon: "📋", action: { target: "/admin.html", section: "inventory" } },
          { title: "Order Receiving & Automatic Triggers", description: "When shipments arrive, mark them as Received. The system automatically recalculates stock and checks reorder levels.", icon: "📦", action: { target: "/admin.html", section: "orders" } },
          { title: "Reorder Alert Feed", description: "Stay alert when inventory drops below safety margins. Review suggested reorder batches.", icon: "🔔", action: { target: "/admin.html", section: "alerts" } },
          { title: "Supplier & Staff Contacts", description: "Access supplier phone numbers and employee directories for dispatch and logistics.", icon: "📇", action: { target: "/admin.html", section: "directory" } },
          { title: "Operational Restrictions ⚠️", description: "Staff members cannot change user roles, reset passwords, delete databases, or run mongodump backups. Those are reserved for Iyiola.", icon: "🚫" }
        ]
      };
    } else {
      return {
        title: "Consumer Tour — Public Shopper",
        subtitle: "Product discovery and seamless order placement",
        steps: [
          { title: "Welcome to Shop Here! 🛍️", description: "Browse our premium multi-category catalog powered live by MongoDB Atlas.", icon: "🛍️" },
          { title: "Category Filtering & Search", description: "Filter items by Household, Sports, Accessories, and Clothing with responsive chips.", icon: "🏷️", action: { target: "/store.html" } },
          { title: "Live Stock Verification", description: "See current inventory quantities directly from the database before placing orders.", icon: "📦", action: { target: "/store.html" } },
          { title: "Instant Ordering", description: "Add items to your cart and place order requests seamlessly.", icon: "🛒", action: { target: "/store.html" } },
          { title: "Role Restrictions 🔒", description: "Consumers enjoy read-only catalog access. Admin dashboards, employee records, and security suites are strictly restricted.", icon: "🔒" }
        ]
      };
    }
  }

  // Tour quick launcher modal
  function showTourSelector() {
    ensureTourDOM();
    const modalId = "shophere-tour-picker";
    let modal = document.getElementById(modalId);
    if (!modal) {
      modal = document.createElement("div");
      modal.id = modalId;
      modal.className = "fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm transition-opacity duration-300";
      modal.innerHTML = `
        <div class="relative w-full max-w-lg bg-white border border-slate-300 rounded-lg shadow-xl p-6 text-slate-800">
          <div class="flex items-center justify-between pb-3 border-b border-slate-200">
            <div class="flex items-center space-x-2">
              <span class="text-lg">🎓</span>
              <h3 class="text-base font-bold text-slate-900">Database Role Onboarding & Presentation</h3>
            </div>
            <button onclick="document.getElementById('${modalId}').remove()" class="text-slate-400 hover:text-slate-700 p-1 rounded-md text-sm">✕</button>
          </div>
          <p class="text-xs text-slate-600 mt-2.5">Select a role tour to see how permissions and operations work across each access tier:</p>
          
          <div class="mt-3.5 space-y-2.5">
            <button onclick="document.getElementById('${modalId}').remove(); ShopHereTour.startTour('superadmin')" class="w-full text-left p-3.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 transition flex items-center space-x-3.5 group shadow-xs">
              <span class="text-2xl p-2 rounded-md bg-purple-50 text-purple-700 border border-purple-200">👑</span>
              <div class="flex-grow">
                <div class="font-semibold text-slate-900 text-sm flex items-center space-x-2">
                  <span>Super Admin Tour (Iyiola)</span>
                  <span class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">dbOwner</span>
                </div>
                <div class="text-xs text-slate-500 mt-0.5">Full system authority, user password & role management, backups, schema, storage alerts.</div>
              </div>
            </button>

            <button onclick="document.getElementById('${modalId}').remove(); ShopHereTour.startTour('staff')" class="w-full text-left p-3.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 transition flex items-center space-x-3.5 group shadow-xs">
              <span class="text-2xl p-2 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">👔</span>
              <div class="flex-grow">
                <div class="font-semibold text-slate-900 text-sm flex items-center space-x-2">
                  <span>Staff / Inventory Manager Tour</span>
                  <span class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">readWrite</span>
                </div>
                <div class="text-xs text-slate-500 mt-0.5">Tomiwa, Solomon, Samuel: Stock updates, order processing triggers, alerts, supplier directory.</div>
              </div>
            </button>

            <button onclick="document.getElementById('${modalId}').remove(); ShopHereTour.startTour('consumer')" class="w-full text-left p-3.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 transition flex items-center space-x-3.5 group shadow-xs">
              <span class="text-2xl p-2 rounded-md bg-blue-50 text-blue-700 border border-blue-200">🛍️</span>
              <div class="flex-grow">
                <div class="font-semibold text-slate-900 text-sm flex items-center space-x-2">
                  <span>Consumer / Shopper Tour</span>
                  <span class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">readOnly</span>
                </div>
                <div class="text-xs text-slate-500 mt-0.5">Public shopper experience: browse catalog, real-time stock levels, category filters, cart orders.</div>
              </div>
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }
  }

  return {
    startTour,
    showTourSelector
  };
})();
