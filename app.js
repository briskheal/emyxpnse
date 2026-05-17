/**
 * app.js
 * EmyXpnse - High Density Mobile-First Core Application Engine
 * Integrates IndexedDB, reactive totals recalculations, high-fidelity card UI rendering,
 * camera-friendly inputs, sequential mobile auto-renaming, and print exports.
 */

// Global Safe HTML Escaper Utility
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Application Master State
let state = {
  selectedMonth: '', // format YYYY-MM
  months: {} // holds month keys: { days: [ { id, dayNumber, date, expenses: [...] } ] }
};

// Available Mock Receipt Categories
const MOCK_CATEGORIES = [
  { name: 'Office Rent', merchant: 'Emyris Properties Ltd', items: [{ name: 'Shared Office Co-Working Spaces', price: 15000 }], tax: 2700, total: 17700 },
  { name: 'AWS Cloud Servers', merchant: 'Amazon Web Services', items: [{ name: 'EC2 Instances & S3 Storage', price: 3400 }, { name: 'RDS Postgres Database Instance', price: 1200 }], tax: 828, total: 5428 },
  { name: 'Client Dinner', merchant: 'Grand Imperial Bistro', items: [{ name: 'Gourmet Dinner Meeting (4 Pax)', price: 4200 }, { name: 'Refreshments & Desserts', price: 800 }], tax: 900, total: 5900 },
  { name: 'Office High-Speed Internet', merchant: 'Airtel Enterprise Fiber', items: [{ name: 'Gigabit Business Leased Line', price: 1800 }], tax: 324, total: 2124 },
  { name: 'Airport Taxi Travel', merchant: 'Ola Corporate Cab', items: [{ name: 'Airport Transit - Round Trip', price: 1450 }], tax: 261, total: 1711 },
  { name: 'Stationery & Printing', merchant: 'Staples Business Depot', items: [{ name: 'A4 Copier Paper Bundles (5x)', price: 950 }, { name: 'Printer Toner Cartridge', price: 2100 }], tax: 549, total: 3599 }
];

// Initialize application on DOM load
document.addEventListener('DOMContentLoaded', async () => {
  // SECURITY GATE: Verify active login session exists with robust persistent fallbacks
  const userRole = sessionStorage.getItem('emyxpnse_user_role') || localStorage.getItem('emyxpnse_user_role');
  const isLocalFile = location.protocol === 'file:';

  if (!userRole && !isLocalFile) {
    document.body.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; background:#0b0f19; color:#cbd5e1; font-family:sans-serif; text-align:center;">
        <span style="font-size:3rem; margin-bottom:15px;">🔒</span>
        <h2 style="margin-bottom:8px; font-family:'Outfit', sans-serif; font-weight:800; color:#ef4444;">Session Required</h2>
        <p style="color:#64748b; font-size:0.9rem;">Please authenticate via the secure gateway first.</p>
        <p style="color:#6366f1; font-size:0.8rem; margin-top:20px;">Redirecting to Login...</p>
      </div>
    `;
    setTimeout(() => {
      location.href = 'index.html';
    }, 1500);
    return;
  }

  try {
    // 1. Initialize IndexedDB database connection
    await window.db.init();

    // 2. Load stored state from IndexedDB
    const savedData = await window.db.getSheetData();
    if (savedData && savedData.months) {
      state = savedData;
    } else {
      // Default to current month
      const today = new Date();
      const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      state.selectedMonth = currentMonthKey;
      state.months = {
        [currentMonthKey]: { days: [] }
      };
      await saveState();
    }

    // 3. Populate month selector options
    populateMonthSelector();

    // 4. Bind event listeners
    bindEventListeners();

    // 5. Initial render cycle
    renderAll();
    
    // 6. Seamlessly synchronize with cloud database in background to fetch auditor deletions & edits!
    await fetchCloudLedger();
    
    showToast('Mobile Expense Dashboard Ready', 'success');
  } catch (err) {
    console.error('App start failure:', err);
    showToast('Failed to load database. Working in memory.', 'error');
  }
});

// Save current state back to IndexedDB (debounced/handled async)
async function saveState() {
  try {
    // DYNAMIC DUAL-PORTAL VOUCHER RE-INDEXING:
    // Automatically re-indexes and renames all voucher filenames sequentially inside their day card
    // whenever a row is inserted, deleted, or re-ordered. This guarantees gallery screenshots
    // are renamed to perfect clean matches (e.g. expense1, expense2) aligning with their row numbers!
    Object.values(state.months).forEach(month => {
      if (month && month.days) {
        month.days.forEach(day => {
          if (day && day.expenses) {
            day.expenses.forEach((exp, idx) => {
              if (exp.voucherId && exp.voucherName) {
                const fileExt = (exp.voucherName.split('.').pop() || 'jpg').toLowerCase();
                exp.voucherName = `expense${idx + 1}.${fileExt}`;
              }
            });
          }
        });
      }
    });

    await window.db.saveSheetData(state);
  } catch (err) {
    console.error('Error saving state to DB:', err);
  }
}

// Generate Month Option Items dynamically based on state and padding
function populateMonthSelector() {
  const selector = document.getElementById('monthSelector');
  if (!selector) return;

  const currentYear = new Date().getFullYear();
  const availableMonths = new Set(Object.keys(state.months));
  
  // Always ensure current month, past 4 months, and next 2 months are listed
  const today = new Date();
  for (let i = -4; i <= 2; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    availableMonths.add(key);
  }

  // Sort months descending
  const sortedMonths = Array.from(availableMonths).sort((a, b) => b.localeCompare(a));

  selector.innerHTML = '';
  sortedMonths.forEach(mKey => {
    const [year, month] = mKey.split('-');
    const dateObj = new Date(parseInt(year), parseInt(month) - 1, 1);
    const label = dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    
    const option = document.createElement('option');
    option.value = mKey;
    option.textContent = label;
    selector.appendChild(option);
  });

  selector.value = state.selectedMonth;
}

// Bind Global UI Actions
function bindEventListeners() {
  // Month selector dropdown change
  document.getElementById('monthSelector').addEventListener('change', async (e) => {
    state.selectedMonth = e.target.value;
    if (!state.months[state.selectedMonth]) {
      state.months[state.selectedMonth] = { days: [] };
    }
    await saveState();
    renderAll();
    showToast(`Switched sheet to: ${e.target.selectedOptions[0].textContent}`);
    
    // Automatically trigger cloud ledger pull sync on month switch!
    await fetchCloudLedger();
  });

  // Main global interaction buttons
  document.getElementById('btnAddDay').addEventListener('click', () => {
    addNewDay();
  });

  document.getElementById('btnExportCSV').addEventListener('click', () => {
    exportToCSV();
  });

  const exportAdminBtn = document.getElementById('btnExportAdmin');
  if (exportAdminBtn) {
    exportAdminBtn.addEventListener('click', () => {
      exportToAdminJSON();
    });
  }

  const printBtn = document.getElementById('btnPrintReport');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      window.print();
    });
  }



  // Search input filtering
  document.getElementById('searchInput').addEventListener('input', (e) => {
    renderWorkspace(e.target.value.trim());
  });

  // Clean Screen Hide Synced Toggle Listener
  const hideSyncedToggle = document.getElementById('hideSyncedToggle');
  if (hideSyncedToggle) {
    hideSyncedToggle.addEventListener('change', () => {
      renderAll();
    });
  }

  // Modal lightbox close triggers
  document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
  document.getElementById('lightboxModal').addEventListener('click', (e) => {
    if (e.target.id === 'lightboxModal') closeLightbox();
  });

  // Logout & Exit application securely
  const logoutBtn = document.getElementById('btnLogout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      showToast('Saving active drafts securely...', 'info');
      await saveState();

      // STRICT MULTI-USER ISOLATION:
      // Instantly clear active session and storage parameters to prevent credential residue on shared devices!
      sessionStorage.removeItem('emyxpnse_user_role');
      sessionStorage.removeItem('emyxpnse_login_id');
      localStorage.removeItem('emyxpnse_user_role');
      localStorage.removeItem('emyxpnse_login_id');

      showToast('Logged out successfully.', 'success');
      setTimeout(() => {
        location.href = 'index.html';
      }, 1000);
    });
  }

  // 📅 Go to Date Calendar Binds
  const btnGoToDate = document.getElementById('btnGoToDate');
  if (btnGoToDate) {
    btnGoToDate.addEventListener('click', openDatePickerModal);
  }

  const datePickerClose = document.getElementById('datePickerClose');
  if (datePickerClose) {
    datePickerClose.addEventListener('click', closeDatePickerModal);
  }

  const btnCancelDatePicker = document.getElementById('btnCancelDatePicker');
  if (btnCancelDatePicker) {
    btnCancelDatePicker.addEventListener('click', closeDatePickerModal);
  }

  const datePickerModal = document.getElementById('datePickerModal');
  if (datePickerModal) {
    datePickerModal.addEventListener('click', (e) => {
      if (e.target.id === 'datePickerModal') closeDatePickerModal();
    });
  }

  const goToDateForm = document.getElementById('goToDateForm');
  if (goToDateForm) {
    goToDateForm.addEventListener('submit', handleGoToDateSubmit);
  }

  // 🔑 Employee Password Change Binds
  const btnChangePassword = document.getElementById('btnChangePassword');
  if (btnChangePassword) {
    btnChangePassword.addEventListener('click', openPasswordModal);
  }

  // 🔄 Sync Cloud Binding
  const btnSyncCloud = document.getElementById('btnSyncCloud');
  if (btnSyncCloud) {
    btnSyncCloud.addEventListener('click', syncLocalDaysToCloud);
  }

  const passwordClose = document.getElementById('passwordClose');
  if (passwordClose) {
    passwordClose.addEventListener('click', closePasswordModal);
  }

  const btnCancelPassword = document.getElementById('btnCancelPassword');
  if (btnCancelPassword) {
    btnCancelPassword.addEventListener('click', closePasswordModal);
  }

  const passwordModal = document.getElementById('passwordModal');
  if (passwordModal) {
    passwordModal.addEventListener('click', (e) => {
      if (e.target.id === 'passwordModal') closePasswordModal();
    });
  }

  const changePasswordForm = document.getElementById('changePasswordForm');
  if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', handlePasswordChange);
  }

  // ⚙️ Unified Mobile Header Dropdown Toggler
  const btnHeaderMenu = document.getElementById('btnHeaderMenu');
  const headerDropdown = document.getElementById('headerDropdown');
  if (btnHeaderMenu && headerDropdown) {
    btnHeaderMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = headerDropdown.style.display === 'flex';
      headerDropdown.style.display = isOpen ? 'none' : 'flex';
    });

    // Close dropdown instantly when clicking any item inside it
    headerDropdown.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', () => {
        headerDropdown.style.display = 'none';
      });
    });

    // Auto-close dropdown when clicking anywhere outside of it
    document.addEventListener('click', (e) => {
      if (!btnHeaderMenu.contains(e.target) && !headerDropdown.contains(e.target)) {
        headerDropdown.style.display = 'none';
      }
    });
  }
}

// Add a new Day Card to the current sheet
function addNewDay() {
  const currentMonth = state.months[state.selectedMonth];
  const dayCount = currentMonth.days.length;
  
  // Calculate next sequential Day Number
  let nextDayNum = 1;
  if (dayCount > 0) {
    const maxDayNum = Math.max(...currentMonth.days.map(d => d.dayNumber || 0));
    nextDayNum = maxDayNum + 1;
  }

  // Calculate default date matching the month
  const [year, month] = state.selectedMonth.split('-');
  const targetDay = Math.min(nextDayNum, new Date(parseInt(year), parseInt(month), 0).getDate());
  const defaultDateStr = `${year}-${month}-${String(targetDay).padStart(2, '0')}`;

  const newDay = {
    id: generateUUID(),
    dayNumber: nextDayNum,
    date: defaultDateStr,
    syncStatus: 'pending',
    expenses: []
  };

  currentMonth.days.push(newDay);
  
  // Immediately add one empty item row as default
  addExpenseItem(newDay.id);

  saveState();
  renderAll();
  
  // Scroll to bottom of workspace to focus the newly added Day
  setTimeout(() => {
    const el = document.getElementById(newDay.id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, 100);

  showToast(`Created Day ${nextDayNum} ledger`, 'success');
}

// Add a single expense line item under a specific day
function addExpenseItem(dayId) {
  const day = findDay(dayId);
  if (!day) return;

  const newItem = {
    id: generateUUID(),
    name: '',
    amount: 0,
    voucherId: null,
    voucherName: '',
    voucherType: '',
    voucherSize: ''
  };

  day.expenses.push(newItem);
  saveState();
  renderAll();
}

// Helper to look up a Day by ID in current active month
function findDay(dayId) {
  return state.months[state.selectedMonth].days.find(d => d.id === dayId);
}

// Global state reset trigger
async function resetDatabase() {
  try {
    await window.db.clearAll();
    const today = new Date();
    const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    state = {
      selectedMonth: currentMonthKey,
      months: {
        [currentMonthKey]: { days: [] }
      }
    };
    await saveState();
    populateMonthSelector();
    renderAll();
    showToast('Database reset successfully.', 'success');
  } catch (err) {
    showToast('Reset failed.', 'error');
  }
}

// Render entire board and sync summaries
function renderAll() {
  renderWorkspace();
  updateSidebarMetrics();
}

// Render Main Sheet Canvas (Mobile Optimized Stacked List)
function renderWorkspace(searchQuery = '') {
  const container = document.getElementById('workspaceContainer');
  if (!container) return;

  const currentMonth = state.months[state.selectedMonth];
  
  if (!currentMonth || currentMonth.days.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        </div>
        <h3>No Expenses Captured</h3>
        <p>This sheet is completely empty. Create a stacked Day card to record mobile expenses with camera uploads and automatic sequential naming.</p>
        <div style="display:flex; flex-direction:column; gap:10px; width: 100%;">
          <button class="btn btn-primary" onclick="addNewDay()">➕ Start Exp Submission</button>
        </div>
      </div>
    `;
    return;
  }

  // Clean Screen Synced Days Filtering
  const hideSynced = document.getElementById('hideSyncedToggle')?.checked ?? true;
  let daysRenderedCount = 0;

  container.innerHTML = '';

  let matchFound = false;

  currentMonth.days.forEach(day => {
    // 0. Clean view: Skip rendering synced days if toggle is on
    if (hideSynced && day.syncStatus === 'synced') {
      return;
    }

    // 0b. Auto-exclude empty synced cards to keep employee portal clean
    if (day.syncStatus === 'synced' && (!day.expenses || day.expenses.length === 0)) {
      return;
    }
    daysRenderedCount++;

    // Filter expenses if query is provided
    const filteredExpenses = day.expenses.filter(exp => {
      if (!searchQuery) return true;
      const term = searchQuery.toLowerCase();
      const serial = `${day.dayNumber}.${day.expenses.indexOf(exp) + 1}`;
      return exp.name.toLowerCase().includes(term) || 
             serial.includes(term) || 
             exp.amount.toString().includes(term);
    });

    if (searchQuery && filteredExpenses.length === 0) {
      return; 
    }
    
    matchFound = true;

    // Calculate Day Subtotal
    const dayTotal = day.expenses.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

    // Sync Badge determination
    let syncBadgeHtml = '';
    const status = day.syncStatus || 'pending';
    const isSynced = status === 'synced';
    if (isSynced) {
      syncBadgeHtml = `<span style="font-size:0.6rem; font-weight:700; background:rgba(16,185,129,0.15); color:var(--color-emerald); padding:3px 6px; border-radius:4px; border:1px solid rgba(16,185,129,0.3); display:inline-flex; align-items:center; gap:2px; text-transform:uppercase;">✅ Synced</span>`;
    } else if (status === 'failed') {
      syncBadgeHtml = `<span style="font-size:0.6rem; font-weight:700; background:rgba(244,63,94,0.15); color:var(--color-rose); padding:3px 6px; border-radius:4px; border:1px solid rgba(244,63,94,0.3); display:inline-flex; align-items:center; gap:2px; text-transform:uppercase;">⚠️ Failed</span>`;
    } else {
      syncBadgeHtml = `<span style="font-size:0.6rem; font-weight:700; background:rgba(245,158,11,0.15); color:var(--color-amber); padding:3px 6px; border-radius:4px; border:1px solid rgba(245,158,11,0.3); display:inline-flex; align-items:center; gap:2px; text-transform:uppercase;">⏳ Pending</span>`;
    }

    const card = document.createElement('div');
    card.className = 'day-card';
    card.id = day.id;

    // Build Stacked Day Card HTML (with locked elements for synced cards to prevent user modification error)
    card.innerHTML = `
      <div class="day-header">
        <div class="day-info" style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
          <div class="day-badge" title="${isSynced ? 'Synced & Locked' : 'Tap to change Day value'}">
            Day 
            <input type="number" value="${day.dayNumber}" min="1" max="31" 
              onchange="updateDayNumber('${day.id}', this.value)" 
              onclick="event.stopPropagation()"
              ${isSynced ? 'disabled' : ''}
            />
          </div>
          <input type="date" class="day-date-picker" value="${day.date}" 
            onchange="updateDayDate('${day.id}', this.value)"
            ${isSynced ? 'disabled' : ''}
          />
          ${syncBadgeHtml}
        </div>
        <div class="day-actions">
          <div class="day-subtotal">₹${dayTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          ${isSynced ? '' : `
            <button class="btn btn-danger btn-icon-only" onclick="deleteDay('${day.id}')" style="width:34px; height:34px;" title="Delete Day">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          `}
        </div>
      </div>
      
      <!-- STACKED MOBILE LIST CONTAINER -->
      <div class="expense-mobile-list" id="mobile-list-${day.id}">
        <!-- Item rows render dynamically -->
      </div>

      <div class="day-card-footer" style="display: flex; gap: 10px; padding: 12px 16px;">
        ${isSynced ? `
          <div style="flex: 1; text-align: center; color: var(--color-emerald); font-weight: 700; font-size: 0.85rem; padding: 10px; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 8px; display: flex; align-items: center; justify-content: center; gap: 6px;">
            ✅ Ledger Synced & Locked
          </div>
        ` : `
          <button class="btn btn-success" onclick="addExpenseItem('${day.id}')" style="flex: 1; justify-content:center; padding: 10px 14px; font-size: 0.85rem; font-weight: 700; height: 42px;">
            ➕ Add Row Detail
          </button>
          <button class="btn btn-primary" onclick="syncSingleDay('${day.id}')" style="flex: 1; justify-content:center; padding: 10px 14px; font-size: 0.85rem; font-weight: 700; height: 42px; background: var(--color-indigo); border-color: rgba(99,102,241,0.35);">
            💾 Save & Sync Day
          </button>
        `}
      </div>
    `;

    container.appendChild(card);

    // Render mobile expense stacked cards inside list container
    const listContainer = document.getElementById(`mobile-list-${day.id}`);
    const itemsToRender = searchQuery ? filteredExpenses : day.expenses;

    if (itemsToRender.length === 0) {
      listContainer.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); font-size: 0.75rem; padding: 20px 10px;">
          No expense rows added. Tap 'Add Expense Detail' to begin.
        </div>
      `;
    } else {
      day.expenses.forEach((exp, idx) => {
        // If searching, only render items that match
        if (searchQuery && !filteredExpenses.includes(exp)) return;

        const serialStr = `${day.dayNumber}.${idx + 1}`;
        const row = document.createElement('div');
        row.className = 'expense-item-row';
        row.id = exp.id;

        // Dynamic Audit Verification Status & Remarks Banners
        let auditStatusHtml = '';
        const statusVal = (exp.auditStatus || 'pending').toLowerCase();
        const remarkText = exp.adminComment ? exp.adminComment.trim() : '';

        if (isSynced || statusVal !== 'pending') {
          let badgeBg = 'rgba(245,158,11,0.08)';
          let badgeBorder = 'rgba(245,158,11,0.2)';
          let badgeColor = '#f59e0b';
          let statusText = '⏳ Awaiting Auditor Review';
          let icon = '⏳';

          if (statusVal === 'approved') {
            badgeBg = 'rgba(16,185,129,0.12)';
            badgeBorder = 'rgba(16,185,129,0.3)';
            badgeColor = '#6ee7b7';
            statusText = 'APPROVED BY AUDITOR';
            icon = '✅';
          } else if (statusVal === 'flagged') {
            badgeBg = 'rgba(239,68,68,0.12)';
            badgeBorder = 'rgba(239,68,68,0.3)';
            badgeColor = '#f87171';
            statusText = 'FLAGGED / DISAPPROVED';
            icon = '⚠️';
          }

          auditStatusHtml = `
            <div class="audit-status-banner" style="margin-top:10px; padding:8px 12px; background:${badgeBg}; border:1px solid ${badgeBorder}; border-radius:6px; font-size:0.72rem; color:${badgeColor}; display:flex; flex-direction:column; gap:4px;">
              <div style="font-weight:700; display:flex; align-items:center; gap:4px; letter-spacing:0.02em; text-transform:uppercase;">
                <span>${icon}</span>
                <span>${statusText}</span>
              </div>
              ${remarkText ? `
                <div style="font-size:0.7rem; color:var(--text-secondary); margin-top:2px; font-style:italic; padding-left:16px; border-left:2px solid ${badgeColor};">
                  <strong>Remarks:</strong> "${escapeHtml(remarkText)}"
                </div>
              ` : ''}
            </div>
          `;
        }

        // Structured stacked mobile rows placing Voucher and Amount cleanly below the header input
        row.innerHTML = `
          <!-- Row 1: Header Bar with Serial and Delete Button -->
          <div class="item-header-bar">
            <span class="srl-cell">${serialStr}</span>
            ${isSynced ? '' : `
              <button class="btn btn-danger btn-icon-only" onclick="deleteExpense('${day.id}', '${exp.id}')" 
                style="width: 32px; height: 32px; min-height: 32px; padding: 4px; border-radius: 6px;" title="Delete row">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            `}
          </div>
          
          <!-- Row 2: Full Width Expense Description Header -->
          <input type="text" class="cell-input" placeholder="Expense description..." 
            value="${escapeHtml(exp.name)}" 
            oninput="updateExpenseField('${day.id}', '${exp.id}', 'name', this.value)"
            ${isSynced ? 'disabled' : ''}
          />

          <!-- Row 3: Mobile Voucher Section (COMES DIRECTLY BELOW EXPENSE HEADER!) -->
          <div class="item-voucher-box" id="voucher-cell-${exp.id}">
            <!-- Voucher upload or preview thumbnail is rendered here -->
          </div>

          <!-- Row 4: Touch-friendly Amount input -->
          <div class="item-amount-box">
            <span class="amount-currency-label">₹</span>
            <input type="number" class="cell-input number-input" step="0.01" min="0" placeholder="0.00" 
              value="${exp.amount || ''}" 
              oninput="updateExpenseField('${day.id}', '${exp.id}', 'amount', this.value)"
              onblur="formatAmountCell(this)"
              ${isSynced ? 'disabled' : ''}
            />
          </div>

          <!-- Row 5: Dynamic Audit Verification Status & Remarks -->
          ${auditStatusHtml}
        `;

        listContainer.appendChild(row);
        renderVoucherCell(day.id, exp);
      });
    }
  });

  // Custom empty state if all cards are hidden because they are synced
  if (daysRenderedCount === 0 && currentMonth.days.length > 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 40px 16px;">
        <div class="empty-state-icon" style="color: var(--color-emerald); background: rgba(16, 185, 129, 0.1); border-color: rgba(16, 185, 129, 0.2);">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
        </div>
        <h3>All Ledger Days Synced</h3>
        <p>Your logged expenses for this month are safely saved and synced to the cloud. The workspace is kept clean for your next day entries.</p>
        <div style="display:flex; flex-direction:column; gap:10px; width: 100%;">
          <button class="btn btn-primary" onclick="addNewDay()">➕ Start Another Day</button>
        </div>
      </div>
    `;
    return;
  }

  if (searchQuery && !matchFound) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 40px 16px;">
        <h3>No match found</h3>
        <p>No expense description, serial, or amount matches "${escapeHtml(searchQuery)}" inside the ${state.selectedMonth} sheet.</p>
        <button class="btn btn-primary" onclick="document.getElementById('searchInput').value = ''; renderWorkspace();">Reset Filter</button>
      </div>
    `;
  }
}

// Render dynamic voucher upload container under the description
function renderVoucherCell(dayId, exp) {
  const container = document.getElementById(`voucher-cell-${exp.id}`);
  if (!container) return;

  const day = findDay(dayId);
  const isSynced = day && day.syncStatus === 'synced';

  if (exp.voucherId) {
    // Determine preview thumbnail
    let iconHTML = '';
    if (exp.voucherType.startsWith('image/')) {
      iconHTML = `<img class="voucher-thumbnail" src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='36' height='36' viewBox='0 0 36 36'><rect width='100%25' height='100%25' fill='%23111827'/><circle cx='18' cy='18' r='6' fill='%236366f1'/></svg>" id="thumb-img-${exp.id}" alt="thumbnail"/>`;
      // Load actual base64 image from IndexedDB asynchronously for better grid load performance
      loadVoucherThumbnail(exp.id);
    } else {
      // PDF or general document icon
      iconHTML = `<span class="voucher-file-icon">📄</span>`;
    }

    container.innerHTML = `
      <div class="voucher-cell-container">
        <div class="voucher-thumbnail-wrapper" onclick="viewVoucher('${exp.id}')" title="Tap to preview receipt">
          ${iconHTML}
          ${isSynced ? '' : `<button class="voucher-remove-btn" onclick="event.stopPropagation(); removeVoucher('${dayId}', '${exp.id}')" title="Delete attachment">×</button>`}
        </div>
        <span class="voucher-meta-text">
          ${escapeHtml(exp.voucherName)}
        </span>
      </div>
    `;
  } else {
    // Interactive File Upload Trigger (using mobile camera integrations)
    if (isSynced) {
      container.innerHTML = `
        <div class="voucher-upload-btn disabled" style="opacity: 0.5; pointer-events: none; border-style: solid; border-color: rgba(255,255,255,0.05); color: var(--text-muted); cursor: default; background: transparent; display: flex; align-items: center; justify-content: center; width: 100%; height: 42px; border-radius: 8px;">
          <span>📋 No Voucher Attached</span>
        </div>
      `;
    } else {
      container.innerHTML = `
        <label class="voucher-upload-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-indigo)">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
            <circle cx="12" cy="13" r="4"></circle>
          </svg>
          <span>📷 Attach Voucher / Take Photo</span>
          <input type="file" accept="image/*,application/pdf" capture="environment" onchange="uploadVoucher('${dayId}', '${exp.id}', this.files[0])" />
        </label>
      `;
    }
  }
}

// Asynchronously load heavy base64 to image element
async function loadVoucherThumbnail(expId) {
  try {
    let base64 = await window.db.getVoucher(`v-${expId}`);

    // Dynamic Fallback: If not found in local cache, fetch from live cloud database
    if (!base64 && navigator.onLine) {
      try {
        const res = await fetch(`/api/ledger/item/${expId}/voucher`);
        if (res.ok) {
          const result = await res.json();
          if (result.success && result.voucherData) {
            base64 = result.voucherData;
            // Silently cache it in IndexedDB so subsequent loads are instant and offline-capable!
            await window.db.saveVoucher(`v-${expId}`, base64);
          }
        }
      } catch (netErr) {
        console.error('Failed to load online thumbnail:', netErr);
      }
    }

    if (base64) {
      const img = document.getElementById(`thumb-img-${expId}`);
      if (img) img.src = base64;
    }
  } catch (err) {
    console.error('Failed to load thumbnail:', err);
  }
}

// Handle Day fields edit
function updateDayNumber(dayId, newVal) {
  const day = findDay(dayId);
  if (!day) return;
  const num = Math.min(31, Math.max(1, parseInt(newVal) || 1));
  day.dayNumber = num;
  
  // Dynamically keep date picker day component synchronized with manual dayNumber edits!
  if (day.date) {
    const parts = day.date.split('-');
    if (parts.length === 3) {
      parts[2] = String(num).padStart(2, '0');
      day.date = parts.join('-');
    }
  }

  day.syncStatus = 'pending';
  saveState();
  renderAll(); // Renders all to update serial indices reactively
}

function updateDayDate(dayId, newVal) {
  const day = findDay(dayId);
  if (!day) return;

  // Check if ANOTHER card already has this exact date to prevent duplicates
  const currentMonthKey = state.selectedMonth;
  const currentMonth = state.months[currentMonthKey];
  const existingDay = currentMonth.days.find(d => d.date === newVal && d.id !== dayId);

  if (existingDay) {
    showToast(`A sheet for ${newVal} already exists. Switching you to the existing record.`, 'warning');
    
    // Automatically make it visible if it was hidden under the clean view filter
    const hideSyncedToggle = document.getElementById('hideSyncedToggle');
    if (hideSyncedToggle && hideSyncedToggle.checked && existingDay.syncStatus === 'synced') {
      hideSyncedToggle.checked = false;
    }
    
    renderAll();
    
    // Scroll and pulse the existing card
    setTimeout(() => {
      const el = document.getElementById(existingDay.id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('highlight-glow');
        setTimeout(() => el.classList.remove('highlight-glow'), 2000);
      }
    }, 150);
    return;
  }

  day.date = newVal;
  
  // Dynamically keep dayNumber synchronized with date day for serial numbers (e.g., Day 17 for YYYY-MM-17)
  if (newVal) {
    const parts = newVal.split('-');
    if (parts.length === 3) {
      const dayNum = parseInt(parts[2], 10);
      if (!isNaN(dayNum)) {
        day.dayNumber = dayNum;
      }
    }
  }

  day.syncStatus = 'pending';
  
  // Sort cards chronologically so the list remains clean and ordered
  currentMonth.days.sort((a, b) => a.date.localeCompare(b.date));

  saveState();
  renderAll();
}

// Handle inline sheet cell edits
function updateExpenseField(dayId, expId, field, value) {
  const day = findDay(dayId);
  if (!day) return;
  const expense = day.expenses.find(e => e.id === expId);
  if (!expense) return;

  if (field === 'amount') {
    expense.amount = parseFloat(value) || 0;
  } else {
    expense.name = value;
  }

  day.syncStatus = 'pending';
  // Save silently to DB, update totals in place for high density speed
  saveState();
  updateLiveTotals();
}

// Simple blur amount formatting
function formatAmountCell(input) {
  const val = parseFloat(input.value);
  if (!isNaN(val)) {
    input.value = val.toFixed(2);
  }
}

// Update Totals on Keypress instantly without re-rendering tables (avoid input lag!)
function updateLiveTotals() {
  const currentMonth = state.months[state.selectedMonth];
  if (!currentMonth) return;

  let grandTotal = 0;

  currentMonth.days.forEach(day => {
    const dayTotal = day.expenses.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    grandTotal += dayTotal;

    // Update individual day subtotal elements directly in DOM
    const cardEl = document.getElementById(day.id);
    if (cardEl) {
      const subtotalEl = cardEl.querySelector('.day-subtotal');
      if (subtotalEl) {
        subtotalEl.textContent = `₹${dayTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
      }
    }
  });

  // Update Footer totals in DOM
  const totalDisplay = document.getElementById('footerGrandTotal');
  if (totalDisplay) {
    totalDisplay.textContent = `₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  }

  // Update sidebar totals in DOM
  const sidebarTotal = document.getElementById('sidebarMonthTotal');
  if (sidebarTotal) {
    sidebarTotal.textContent = `₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  }

  // Live refresh category breakdown
  renderCategoryBreakdown(currentMonth);
}

// Complete UI Metrics rendering inside sidebar
async function updateSidebarMetrics() {
  const currentMonth = state.months[state.selectedMonth];
  const sidebarTotal = document.getElementById('sidebarMonthTotal');
  const sidebarDayCount = document.getElementById('sidebarDayCount');
  const sidebarVoucherCount = document.getElementById('sidebarVoucherCount');
  const footerTotal = document.getElementById('footerGrandTotal');
  
  if (!currentMonth) return;

  // Calcul totals
  let grandTotal = 0;
  let totalItems = 0;
  let voucherCount = 0;
  
  currentMonth.days.forEach(day => {
    grandTotal += day.expenses.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    totalItems += day.expenses.length;
    voucherCount += day.expenses.filter(e => e.voucherId).length;
  });

  // Populate basic text metrics
  if (sidebarTotal) sidebarTotal.textContent = `₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  if (sidebarDayCount) sidebarDayCount.textContent = currentMonth.days.length;
  if (sidebarVoucherCount) sidebarVoucherCount.textContent = voucherCount;
  if (footerTotal) footerTotal.textContent = `₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  // Populate dynamic category horizontal chart
  renderCategoryBreakdown(currentMonth);
}

// Generate category grouping and render progress charts
function renderCategoryBreakdown(monthData) {
  const chartContainer = document.getElementById('categoryChartContainer');
  if (!chartContainer) return;

  // Aggregate category spends
  const categories = {};
  monthData.days.forEach(day => {
    day.expenses.forEach(exp => {
      const rawName = exp.name.trim() || 'Uncategorized';
      let catName = 'General';
      
      const lower = rawName.toLowerCase();
      if (lower.includes('rent') || lower.includes('office space')) catName = 'Office Rent';
      else if (lower.includes('aws') || lower.includes('server') || lower.includes('cloud') || lower.includes('software')) catName = 'Software / Cloud';
      else if (lower.includes('taxi') || lower.includes('cab') || lower.includes('ola') || lower.includes('uber') || lower.includes('travel') || lower.includes('flight')) catName = 'Travel / Logistics';
      else if (lower.includes('lunch') || lower.includes('dinner') || lower.includes('food') || lower.includes('snacks') || lower.includes('tea')) catName = 'Food & Catering';
      else if (lower.includes('stationery') || lower.includes('paper') || lower.includes('toner') || lower.includes('printing')) catName = 'Office Supplies';
      else if (rawName !== 'Uncategorized') {
        catName = rawName.split(' ')[0];
        catName = catName.charAt(0).toUpperCase() + catName.slice(1).toLowerCase();
      } else {
        catName = 'Uncategorized';
      }

      categories[catName] = (categories[catName] || 0) + (parseFloat(exp.amount) || 0);
    });
  });

  const categoryEntries = Object.entries(categories).sort((a, b) => b[1] - a[1]);

  if (categoryEntries.length === 0) {
    chartContainer.innerHTML = `<div class="empty-analytics-msg">No expense analysis details entered.</div>`;
    return;
  }

  const maxVal = Math.max(...categoryEntries.map(e => e[1])) || 1;

  chartContainer.innerHTML = '';
  categoryEntries.forEach(([name, amt]) => {
    if (amt === 0) return;
    const pct = (amt / maxVal) * 100;
    
    const row = document.createElement('div');
    row.className = 'category-row';
    row.innerHTML = `
      <div class="category-row-header">
        <span class="category-name">${escapeHtml(name)}</span>
        <span class="category-amt">₹${amt.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
      </div>
      <div class="category-progress-bar">
        <div class="category-progress-fill" style="width: ${pct}%"></div>
      </div>
    `;
    chartContainer.appendChild(row);
  });
}

// Handle File upload inside row (WITH AUTOMATED MOBILE RENAMING)
async function uploadVoucher(dayId, expId, file) {
  if (!file) return;

  // File validator
  const maxSize = 3 * 1024 * 1024; // 3MB limit
  if (file.size > maxSize) {
    showToast('File too large. Max attachment size is 3MB.', 'error');
    return;
  }

  showToast('Processing photo...', 'info');

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const base64Data = e.target.result;
      const voucherId = `v-${expId}`;

      // Save voucher binary inside IndexedDB
      await window.db.saveVoucher(voucherId, base64Data);

      // Save metadata in active state
      const day = findDay(dayId);
      if (day) {
        day.syncStatus = 'pending';
        const exp = day.expenses.find(item => item.id === expId);
        if (exp) {
          // EXCLUSIVE MOBILE RENAMING: auto renaming file to expense1, expense2, expense3 based on position index
          const itemIndex = day.expenses.indexOf(exp);
          const serialSuffix = itemIndex !== -1 ? (itemIndex + 1) : 1;
          const fileExt = file.name.split('.').pop() || 'jpg';
          const customRenamedName = `expense${serialSuffix}.${fileExt}`;

          exp.voucherId = voucherId;
          exp.voucherName = customRenamedName; // Saved beautifully as clean sequential filename!
          exp.voucherType = file.type;
          exp.voucherSize = formatBytes(file.size);
        }
      }

      await saveState();
      renderAll();
      showToast('Voucher attached successfully.', 'success');

      // AUTO-SYNC RECEIPT ATTACHMENT TO DATABASE:
      // If the device is online, automatically sync the updated Day card to Supabase in the background!
      if (navigator.onLine) {
        showToast('Auto-syncing receipt attachment to cloud database...', 'info');
        await syncSingleDay(dayId);
      }
    } catch (err) {
      console.error(err);
      showToast('Attachment processing failed.', 'error');
    }
  };

  reader.onerror = () => showToast('Failed to read file.', 'error');
  reader.readAsDataURL(file);
}

// Remove voucher attachment
async function removeVoucher(dayId, expId) {
  if (!confirm('Are you sure you want to remove this receipt attachment?')) return;

  try {
    await window.db.deleteVoucher(`v-${expId}`);

    const day = findDay(dayId);
    if (day) {
      day.syncStatus = 'pending';
      const exp = day.expenses.find(item => item.id === expId);
      if (exp) {
        exp.voucherId = null;
        exp.voucherName = '';
        exp.voucherType = '';
        exp.voucherSize = '';
      }
    }

    await saveState();
    renderAll();
    showToast('Voucher receipt removed.');

    // Auto-sync removal to cloud database
    if (navigator.onLine) {
      showToast('Syncing removal to database...', 'info');
      await syncSingleDay(dayId);
    }
  } catch (err) {
    showToast('Removal failed.', 'error');
  }
}

// Lightbox preview viewer
async function viewVoucher(expId) {
  const modal = document.getElementById('lightboxModal');
  const details = document.getElementById('lightboxDetails');
  const frameContainer = document.getElementById('lightboxFrame');

  if (!modal || !frameContainer) return;

  // Find expense item anywhere in state to get metadata
  let targetExp = null;
  Object.values(state.months).forEach(m => {
    m.days.forEach(d => {
      const found = d.expenses.find(e => e.id === expId);
      if (found) targetExp = found;
    });
  });

  if (!targetExp) return;

  showToast('Loading image preview...', 'info');

  try {
    // 1. Try to read from IndexedDB first (offline check)
    let base64Data = await window.db.getVoucher(`v-${expId}`);

    // 2. Dynamic Fallback: If not found in local IndexedDB, fetch high-res attachment from live PostgreSQL!
    if (!base64Data && navigator.onLine) {
      try {
        const res = await fetch(`/api/ledger/item/${expId}/voucher`);
        if (res.ok) {
          const result = await res.json();
          if (result.success && result.voucherData) {
            base64Data = result.voucherData;
          }
        }
      } catch (netErr) {
        console.error('Failed to retrieve voucher attachment from server:', netErr);
      }
    }

    if (!base64Data) {
      showToast('Voucher receipt not found.', 'error');
      return;
    }

    details.innerHTML = `
      <div class="lightbox-title">${escapeHtml(targetExp.voucherName)}</div>
      <div class="lightbox-meta">${targetExp.name || 'No Description'} • ${targetExp.voucherSize} • Amount: ₹${targetExp.amount.toFixed(2)}</div>
    `;

    // Foolproof type detection checking both metadata and actual data URL prefix
    const isImage = (targetExp.voucherType && targetExp.voucherType.startsWith('image/')) || base64Data.startsWith('data:image/');
    const isPDF = (targetExp.voucherType && targetExp.voucherType === 'application/pdf') || base64Data.startsWith('data:application/pdf');

    if (isImage) {
      frameContainer.innerHTML = `<img class="lightbox-preview" src="${base64Data}" alt="voucher fullsize"/>`;
    } else if (isPDF) {
      frameContainer.innerHTML = `<iframe class="lightbox-preview" src="${base64Data}" style="width: 100%; height: 50vh; border:none;"></iframe>`;
    } else {
      frameContainer.innerHTML = `
        <div class="lightbox-file-placeholder">
          <span style="font-size:2.5rem;">📄</span>
          <span>Receipt document file format.</span>
        </div>
      `;
    }

    // Set download button URL
    document.getElementById('lightboxDownloadBtn').href = base64Data;
    document.getElementById('lightboxDownloadBtn').setAttribute('download', targetExp.voucherName);

    modal.classList.add('active');
  } catch (err) {
    console.error(err);
    showToast('Failed to open lightbox.', 'error');
  }
}

function closeLightbox() {
  const modal = document.getElementById('lightboxModal');
  if (modal) modal.classList.remove('active');
}

// Delete Day card completely
async function deleteDay(dayId) {
  if (!confirm('Are you sure you want to delete this entire Day card and all its details?')) return;

  const currentMonth = state.months[state.selectedMonth];
  const idx = currentMonth.days.findIndex(d => d.id === dayId);
  if (idx !== -1) {
    const day = currentMonth.days[idx];
    for (const exp of day.expenses) {
      if (exp.voucherId) {
        await window.db.deleteVoucher(exp.voucherId);
      }
    }

    currentMonth.days.splice(idx, 1);
    await saveState();
    renderAll();
    showToast('Day card deleted.');
  }
}

// Delete expense item row
async function deleteExpense(dayId, expId) {
  const day = findDay(dayId);
  if (!day) return;

  const idx = day.expenses.findIndex(e => e.id === expId);
  if (idx !== -1) {
    const exp = day.expenses[idx];
    if (exp.voucherId) {
      await window.db.deleteVoucher(exp.voucherId);
    }
    
    day.expenses.splice(idx, 1);
    day.syncStatus = 'pending';

    // AUTOMATIC EMPTY DAY CARD CLEANUP:
    // If there are no expenses left under this day, automatically clear the day card entirely!
    let dayCleared = false;
    if (day.expenses.length === 0) {
      const currentMonthKey = state.selectedMonth;
      const currentMonth = state.months[currentMonthKey];
      if (currentMonth && currentMonth.days) {
        const dayIdx = currentMonth.days.findIndex(d => d.id === dayId);
        if (dayIdx !== -1) {
          currentMonth.days.splice(dayIdx, 1);
          dayCleared = true;
        }
      }
    }

    await saveState();
    renderAll();
    
    if (dayCleared) {
      showToast('Empty day card cleared automatically.', 'info');
    } else {
      showToast('Expense item row deleted.');
    }
  }
}

// Export sheet data to beautifully formatted CSV
async function exportToCSV() {
  const currentMonth = state.months[state.selectedMonth];
  if (!currentMonth || currentMonth.days.length === 0) {
    showToast('No data available to export.', 'error');
    return;
  }

  // Load the latest profiles dynamically to resolve names and employee codes
  let users = [];
  try {
    const res = await fetch('/api/users');
    const resJson = await res.json();
    if (resJson.success && resJson.users) {
      users = resJson.users;
    }
  } catch (err) {
    console.error('Failed to fetch user list for CSV resolution:', err);
  }

  const loginId = sessionStorage.getItem('emyxpnse_login_id') || localStorage.getItem('emyxpnse_login_id') || 'user';
  const currentUser = users.find(u => u.loginId === loginId) || {};
  const empName = currentUser.name || 'Unknown Employee';
  const empCode = currentUser.empCode || 'N/A';

  let csvContent = '\uFEFF'; // UTF-8 BOM
  csvContent += 'Serial No,Date,Employee Code,Employee Name,Expense Description,Amount (INR),Receipt Filename,APRV (Y/N),Auditor Remarks\r\n';

  currentMonth.days.forEach(day => {
    day.expenses.forEach((exp, idx) => {
      const serial = `"${day.dayNumber}.${idx + 1}"`;
      const date = `"${day.date}"`;
      const code = `"${empCode}"`;
      const nameCol = `"${empName.replace(/"/g, '""')}"`;
      const name = `"${String(exp.name || '').replace(/"/g, '""')}"`;
      const amt = `"${(parseFloat(exp.amount) || 0).toFixed(2)}"`;
      const voucherName = `"${String(exp.voucherName || 'None').replace(/"/g, '""')}"`;

      // Map auditStatus to APRV (Y/N)
      const statusVal = (exp.auditStatus || 'pending').toLowerCase();
      let aprvStatus = 'PENDING';
      if (statusVal === 'approved') aprvStatus = 'Y';
      else if (statusVal === 'flagged') aprvStatus = 'N';
      const aprv = `"${aprvStatus}"`;

      const comment = `"${String(exp.adminComment || '').replace(/"/g, '""')}"`;

      csvContent += `${serial},${date},${code},${nameCol},${name},${amt},${voucherName},${aprv},${comment}\r\n`;
    });
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `EmyXpnse-Report-${state.selectedMonth}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('CSV report downloaded successfully.', 'success');
}

// Core SVG mock receipt invoice builder
function generateSVGReceipt(merchant, items, tax, total, date) {
  const itemRows = items.map((item, idx) => `
    <text x="30" y="${180 + idx * 25}" fill="#94a3b8" font-size="14" font-family="Inter">${item.name}</text>
    <text x="370" y="${180 + idx * 25}" fill="#f8fafc" font-size="14" font-family="Inter" font-weight="600" text-anchor="end">₹${item.price.toFixed(2)}</text>
  `).join('');
  
  const height = 250 + items.length * 28;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 ${height}" width="400" height="${height}">
      <rect width="100%" height="100%" fill="#0b0f19" rx="16" stroke="rgba(255,255,255,0.06)" stroke-width="2"/>
      <circle cx="200" cy="50" r="140" fill="rgba(99,102,241,0.08)" filter="blur(40px)" />
      <rect x="30" y="32" width="44" height="44" rx="10" fill="rgba(99,102,241,0.1)" stroke="rgba(99,102,241,0.3)" stroke-width="1"/>
      <text x="43" y="60" fill="#6366f1" font-size="20" font-family="Outfit" font-weight="900">E</text>
      <text x="90" y="48" fill="#f8fafc" font-size="16" font-family="Outfit" font-weight="700">${escapeHtml(merchant)}</text>
      <text x="90" y="68" fill="#64748b" font-size="11" font-family="Inter" font-weight="600" letter-spacing="1">EXPENSE VOUCHER DEPT</text>
      <line x1="30" y1="100" x2="370" y2="100" stroke="rgba(255,255,255,0.06)" stroke-width="2" stroke-dasharray="6 4" />
      <text x="30" y="130" fill="#64748b" font-size="12" font-family="Inter" font-weight="600">INVOICE NO:</text>
      <text x="120" y="130" fill="#cbd5e1" font-size="12" font-family="Inter" font-weight="700">TXN-${Math.floor(100000 + Math.random() * 900000)}</text>
      <text x="370" y="130" fill="#94a3b8" font-size="12" font-family="Inter" font-weight="600" text-anchor="end">${date}</text>
      <line x1="30" y1="150" x2="370" y2="150" stroke="rgba(255,255,255,0.08)" stroke-width="1" />
      ${itemRows}
      <line x1="30" y1="${height - 90}" x2="370" y2="${height - 90}" stroke="rgba(255,255,255,0.08)" stroke-width="1" />
      <text x="30" y="${height - 65}" fill="#64748b" font-size="13" font-family="Inter">TAX (GST 18%):</text>
      <text x="370" y="${height - 65}" fill="#cbd5e1" font-size="13" font-family="Inter" font-weight="600" text-anchor="end">₹${tax.toFixed(2)}</text>
      <text x="30" y="${height - 35}" fill="#f8fafc" font-size="15" font-family="Outfit" font-weight="800">GRAND TOTAL:</text>
      <text x="370" y="${height - 35}" fill="#10b981" font-size="19" font-family="Outfit" font-weight="800" text-anchor="end">₹${total.toFixed(2)}</text>
    </svg>
  `;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Generate complete set of mock vouchers and entries instantly
async function generateMockData() {
  showToast('Populating mobile ledger details...', 'info');

  const currentMonthKey = state.selectedMonth;
  const [year, month] = currentMonthKey.split('-');
  
  // Reset current month entries first
  state.months[currentMonthKey] = { days: [] };
  const currentMonth = state.months[currentMonthKey];

  // We will generate 3 realistic days: Day 1, Day 3, and Day 5
  const activeDays = [1, 3, 5];
  
  for (const dayNum of activeDays) {
    const formattedDate = `${year}-${month}-${String(dayNum).padStart(2, '0')}`;
    const dayId = `day-mock-${dayNum}-${Date.now()}`;

    const newDay = {
      id: dayId,
      dayNumber: dayNum,
      date: formattedDate,
      expenses: []
    };

    let itemsToPick = [];
    if (dayNum === 1) {
      itemsToPick = [MOCK_CATEGORIES[0], MOCK_CATEGORIES[1], MOCK_CATEGORIES[4]]; // Rent, AWS, Taxi
    } else if (dayNum === 3) {
      itemsToPick = [MOCK_CATEGORIES[2], MOCK_CATEGORIES[3]]; // Dinner, Internet
    } else {
      itemsToPick = [MOCK_CATEGORIES[5]]; // Stationery
    }

    for (let i = 0; i < itemsToPick.length; i++) {
      const cat = itemsToPick[i];
      const expId = `exp-mock-${dayNum}-${i}-${Date.now()}`;
      const voucherId = `v-${expId}`;
      const vName = `expense${i + 1}.svg`; // Automatically named expense1, expense2 sequentially!

      // Generate custom mock receipt SVG
      const base64Receipt = generateSVGReceipt(cat.merchant, cat.items, cat.tax, cat.total, formattedDate);
      
      // Save heavy voucher string to IndexedDB
      await window.db.saveVoucher(voucherId, base64Receipt);

      newDay.expenses.push({
        id: expId,
        name: cat.name,
        amount: cat.total,
        voucherId: voucherId,
        voucherName: vName,
        voucherType: 'image/svg+xml',
        voucherSize: '3.4 KB'
      });
    }

    currentMonth.days.push(newDay);
  }

  await saveState();
  renderAll();
  showToast('Demo vouchers and sequential receipts generated!', 'success');
}

// Toast notification display system
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '❌';

  toast.innerHTML = `
    <span>${icon}</span>
    <span>${message}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-15px)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => {
      if (container.contains(toast)) container.removeChild(toast);
    }, 250);
  }, 3000);
}

// Utility file size formatter
function formatBytes(bytes, decimals = 1) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

// HTML escape helper to prevent input injections
function escapeHtml(string) {
  return String(string)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// PACK AND EXPORT ENTIRE MONTH SHEET DATA + ALL INDEXEDDB ATTACHED BASE64 VOUCHERS
async function exportToAdminJSON() {
  const currentMonthKey = state.selectedMonth;
  const currentMonth = state.months[currentMonthKey];
  if (!currentMonth || currentMonth.days.length === 0) {
    showToast('No data available to export.', 'error');
    return;
  }

  showToast('Bundling ledger sheet & receipts...', 'info');

  try {
    const exportBundle = {
      type: 'emyxpnse_export_package',
      version: '1.0.0',
      exportDate: new Date().toISOString(),
      selectedMonth: currentMonthKey,
      days: currentMonth.days,
      vouchers: {} // Keyed by voucherId -> base64Data
    };

    // Asynchronously gather base64 vouchers from IndexedDB store
    for (const day of currentMonth.days) {
      for (const exp of day.expenses) {
        if (exp.voucherId) {
          const base64 = await window.db.getVoucher(exp.voucherId);
          if (base64) {
            exportBundle.vouchers[exp.voucherId] = base64;
          }
        }
      }
    }

    const jsonString = JSON.stringify(exportBundle, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    link.setAttribute('href', url);
    link.setAttribute('download', `emyxpnse_ledger_${currentMonthKey}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('Ledger package downloaded successfully!', 'success');
  } catch (err) {
    console.error(err);
    showToast('Export packing failed.', 'error');
  }
}

// =========================================================================
// 🔐 EMPLOYEE PASSWORD CHANGE MODAL CONTROLLER
// =========================================================================

function openPasswordModal() {
  const modal = document.getElementById('passwordModal');
  if (modal) {
    modal.classList.add('active');
  }
}

function closePasswordModal() {
  const modal = document.getElementById('passwordModal');
  if (modal) {
    modal.classList.remove('active');
    document.getElementById('changePasswordForm').reset();
  }
}

async function handlePasswordChange(e) {
  e.preventDefault();
  
  const newPass = document.getElementById('newPassword').value;
  const confirmPass = document.getElementById('confirmPassword').value;

  if (newPass.length < 4) {
    showToast('Password must be at least 4 characters long.', 'error');
    return;
  }

  if (newPass !== confirmPass) {
    showToast('New passwords do not match.', 'error');
    return;
  }

  const loginId = sessionStorage.getItem('emyxpnse_login_id');

  try {
    const response = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginId, newPassword: newPass })
    });

    const result = await response.json();

    if (response.ok && result.success) {
      showToast('Password updated successfully inside credentials!', 'success');
      closePasswordModal();
    } else {
      showToast(result.error || 'Failed to change password.', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Offline Mode: Cannot change password without server connection.', 'error');
  }
}

// =========================================================================
// 📅 EMPLOYEE GO TO DATE CALENDAR ENGINE
// =========================================================================

function openDatePickerModal() {
  const activeMonth = state.selectedMonth; // format YYYY-MM
  if (!activeMonth) {
    showToast('Please select a valid month sheet first.', 'error');
    return;
  }

  const [yr, mn] = activeMonth.split('-');
  const totalDays = new Date(parseInt(yr), parseInt(mn), 0).getDate();
  
  const input = document.getElementById('calendarDateInput');
  if (input) {
    input.min = `${activeMonth}-01`;
    input.max = `${activeMonth}-${String(totalDays).padStart(2, '0')}`;
    
    // Default value: check if today's date is in the selected month
    const today = new Date();
    const todayMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    if (todayMonthKey === activeMonth) {
      input.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    } else {
      input.value = `${activeMonth}-01`;
    }
  }
  
  const modal = document.getElementById('datePickerModal');
  if (modal) modal.classList.add('active');
}

function closeDatePickerModal() {
  const modal = document.getElementById('datePickerModal');
  if (modal) {
    modal.classList.remove('active');
    document.getElementById('goToDateForm').reset();
  }
}

async function handleGoToDateSubmit(e) {
  e.preventDefault();
  
  const selectedDateStr = document.getElementById('calendarDateInput').value;
  if (!selectedDateStr) return;

  const currentMonthKey = state.selectedMonth;
  const currentMonth = state.months[currentMonthKey];
  
  // 1. Check if card for this exact date already exists!
  const existingDay = currentMonth.days.find(d => d.date === selectedDateStr);
  
  if (existingDay) {
    // If the card is synced but hidden because of the clean-view filter, automatically uncheck the filter!
    const hideSyncedToggle = document.getElementById('hideSyncedToggle');
    if (hideSyncedToggle && hideSyncedToggle.checked && existingDay.syncStatus === 'synced') {
      hideSyncedToggle.checked = false;
      renderAll(); // Re-render so the synced card is visible before scrolling
    }

    closeDatePickerModal();
    // Scroll and pulse target card to notify user!
    setTimeout(() => {
      const el = document.getElementById(existingDay.id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('highlight-glow');
        showToast('Jumping to existing date sheet!', 'success');
        setTimeout(() => {
          el.classList.remove('highlight-glow');
        }, 2000);
      }
    }, 100);
    return;
  }
  
  // 2. If it does not exist, let's create a new card chronologically!
  const dayNum = parseInt(selectedDateStr.split('-')[2], 10);
  const newDay = {
    id: generateUUID(),
    dayNumber: dayNum,
    date: selectedDateStr,
    syncStatus: 'pending',
    expenses: []
  };

  currentMonth.days.push(newDay);
  
  // 3. Chronological sorting so the ledger card list is always clean and ordered!
  currentMonth.days.sort((a, b) => a.date.localeCompare(b.date));

  // Immediately add one empty item row as default
  addExpenseItem(newDay.id);

  await saveState();
  renderAll();
  closeDatePickerModal();

  // Scroll and pulse new card!
  setTimeout(() => {
    const el = document.getElementById(newDay.id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('highlight-glow');
      setTimeout(() => {
        el.classList.remove('highlight-glow');
      }, 2000);
    }
  }, 200);

  showToast(`Created Day ${dayNum} sheet successfully!`, 'success');
}

// =========================================================================
// 🔄 DAY-WISE OFFLINE DELTA SYNC ENGINE
// =========================================================================

async function syncLocalDaysToCloud() {
  if (!navigator.onLine) {
    showToast("Sync Failed: Device is currently offline.", "error");
    return;
  }
  
  const currentMonthKey = state.selectedMonth;
  const currentMonth = state.months[currentMonthKey];
  if (!currentMonth) return;

  // 1. Isolate pending/failed day cards
  const unSyncedDays = currentMonth.days.filter(
    d => d.syncStatus === 'pending' || d.syncStatus === 'failed'
  );

  if (unSyncedDays.length === 0) {
    showToast("All logged days are already synced to the cloud!", "success");
    return;
  }

  showToast(`Syncing ${unSyncedDays.length} days...`, 'info');

  for (const day of unSyncedDays) {
    try {
      // 2. Gather base64 vouchers for this day from IndexedDB
      const dayVouchers = {};
      for (const exp of day.expenses) {
        if (exp.voucherId) {
          const base64 = await window.db.getVoucher(exp.voucherId);
          if (base64) {
            dayVouchers[exp.voucherId] = base64;
          }
        }
      }

      // 3. Post day package to the Express Server
      const response = await fetch('/api/sync/day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loginId: sessionStorage.getItem('emyxpnse_login_id') || 'local_user',
          monthKey: currentMonthKey,
          dayData: day,
          vouchers: dayVouchers
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        day.syncStatus = 'synced'; // Mark as synced!
      } else {
        day.syncStatus = 'failed';
      }
    } catch (err) {
      console.error(`Failed to push Day ${day.dayNumber}:`, err);
      day.syncStatus = 'failed';
    }
  }

  // 4. Save statuses to local IndexedDB and refresh layout!
  await saveState();
  renderAll();
  showToast("Sync cycle complete!", "success");
  
  // Automatically trigger cloud ledger pull sync to align with latest cloud state!
  await fetchCloudLedger();
}

// Helper to generate standard RFC4122 v4 UUID strings in client side PWA
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Interactive Single-Day Cloud Sync Trigger (dedicated Save option!)
async function syncSingleDay(dayId) {
  if (!navigator.onLine) {
    showToast("Sync Failed: Device is currently offline.", "error");
    return;
  }

  const day = findDay(dayId);
  if (!day) return;

  showToast(`Syncing Day ${day.dayNumber} ledger securely...`, 'info');

  try {
    // 1. Gather base64 vouchers for this day from IndexedDB
    const dayVouchers = {};
    for (const exp of day.expenses) {
      if (exp.voucherId) {
        const base64 = await window.db.getVoucher(exp.voucherId);
        if (base64) {
          dayVouchers[exp.voucherId] = base64;
        }
      }
    }

    const currentMonthKey = state.selectedMonth;

    // 2. Post day package to the Express Server
    const response = await fetch('/api/sync/day', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        loginId: sessionStorage.getItem('emyxpnse_login_id') || 'local_user',
        monthKey: currentMonthKey,
        dayData: day,
        vouchers: dayVouchers
      })
    });

    const result = await response.json();

    if (response.ok && result.success) {
      day.syncStatus = 'synced'; // Mark as synced!
      showToast(`Day ${day.dayNumber} successfully saved to database!`, 'success');
    } else {
      day.syncStatus = 'failed';
      showToast(result.error || `Failed to sync Day ${day.dayNumber}.`, 'error');
    }
  } catch (err) {
    console.error(`Failed to push Day ${day.dayNumber}:`, err);
    day.syncStatus = 'failed';
    showToast(`Network sync error for Day ${day.dayNumber}.`, 'error');
  }

  // 3. Save local IndexedDB state & refresh views in-place!
  await saveState();
  renderAll();
  
  // Automatically trigger cloud ledger pull sync to align with latest cloud state!
  await fetchCloudLedger();
}

// Automatically pull live synced employee ledger submissions from Supabase cloud database
// and merge them to synchronize any auditor comments, status changes, or permanent deletions!
async function fetchCloudLedger() {
  if (!navigator.onLine) return;

  const loginId = sessionStorage.getItem('emyxpnse_login_id') || localStorage.getItem('emyxpnse_login_id');
  if (!loginId) return;

  const currentMonthKey = state.selectedMonth;
  try {
    // 1. Fetch user-scoped synced day cards from cloud database
    const response = await fetch(`/api/ledger/${currentMonthKey}?loginId=${loginId}&role=user`);
    if (response.ok) {
      const result = await response.json();
      if (result.success && result.days) {
        const cloudDays = result.days;
        const cloudDayIds = new Set(cloudDays.map(d => d.id));

        const currentMonth = state.months[currentMonthKey];
        if (currentMonth && currentMonth.days) {
          // A. Synchronize deletions: If a card was previously synced but is now missing from the cloud,
          // it means the auditor deleted it permanently! We must delete it locally too.
          for (let i = currentMonth.days.length - 1; i >= 0; i--) {
            const localDay = currentMonth.days[i];
            if (localDay.syncStatus === 'synced' && !cloudDayIds.has(localDay.id)) {
              console.log(`Auto-sync delete: Purging deleted cloud day card ${localDay.id} locally.`);
              // Cascading voucher cleanup
              if (localDay.expenses) {
                for (const exp of localDay.expenses) {
                  if (exp.voucherId) {
                    try {
                      await window.db.deleteVoucher(exp.voucherId);
                    } catch (e) {
                      console.error('Failed to delete voucher:', e);
                    }
                  }
                }
              }
              currentMonth.days.splice(i, 1);
            }
          }

          // B. Synchronize updates and row deletions inside remaining days
          for (const cloudDay of cloudDays) {
            const localDay = currentMonth.days.find(d => d.id === cloudDay.id);
            if (localDay) {
              // Update parent day attributes
              localDay.dayNumber = cloudDay.dayNumber;
              localDay.date = cloudDay.date;
              localDay.syncStatus = 'synced';

              // Synchronize expense rows: The auditor might have deleted specific rows on the cloud database!
              const cloudExpIds = new Set((cloudDay.expenses || []).map(e => e.id));

              // Clean up local vouchers for any deleted rows
              if (localDay.expenses) {
                for (const localExp of localDay.expenses) {
                  if (!cloudExpIds.has(localExp.id) && localExp.voucherId) {
                    try {
                      await window.db.deleteVoucher(localExp.voucherId);
                    } catch (e) {
                      console.error('Failed to delete row voucher:', e);
                    }
                  }
                }
              }

              // Replace local synced expenses with pristine server list to pull auditor comments/approvals
              localDay.expenses = cloudDay.expenses || [];
            } else {
              // C. If the synced day exists on cloud but is missing locally (e.g. cleared browser cache),
              // reconstruct and restore it locally!
              currentMonth.days.push({
                id: cloudDay.id,
                dayNumber: cloudDay.dayNumber,
                date: cloudDay.date,
                syncStatus: 'synced',
                expenses: cloudDay.expenses || []
              });
            }
          }

          // D. Sort chronologically so the ledger card list is always clean and ordered!
          currentMonth.days.sort((a, b) => a.date.localeCompare(b.date));

          await saveState();
          renderAll();
        }
      }
    }
  } catch (err) {
    console.error('Failed to auto-sync cloud ledger deletions:', err);
  }
}
