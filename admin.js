/**
 * admin.js
 * EmyXpnse - High Density Desktop Audit Engine
 * Manages JSON ledger package imports, IndexedDB voucher restoration, wide grid rendering,
 * real-time row color status tracking, inline cell remarks, and final sign-offs.
 */

// Master State Object
let state = {
  selectedMonth: '',
  months: {}
};

// Available Mock Receipt Categories for the Demo ledger
const MOCK_CATEGORIES = [
  { name: 'Office Rent', merchant: 'Emyris Properties Ltd', items: [{ name: 'Shared Office Co-Working Spaces', price: 15000 }], tax: 2700, total: 17700 },
  { name: 'AWS Cloud Servers', merchant: 'Amazon Web Services', items: [{ name: 'EC2 Instances & S3 Storage', price: 3400 }, { name: 'RDS Postgres Database Instance', price: 1200 }], tax: 828, total: 5428 },
  { name: 'Client Dinner', merchant: 'Grand Imperial Bistro', items: [{ name: 'Gourmet Dinner Meeting (4 Pax)', price: 4200 }, { name: 'Refreshments & Desserts', price: 800 }], tax: 900, total: 5900 },
  { name: 'Office High-Speed Internet', merchant: 'Airtel Enterprise Fiber', items: [{ name: 'Gigabit Business Leased Line', price: 1800 }], tax: 324, total: 2124 },
  { name: 'Airport Taxi Travel', merchant: 'Ola Corporate Cab', items: [{ name: 'Airport Transit - Round Trip', price: 1450 }], tax: 261, total: 1711 },
  { name: 'Stationery & Printing', merchant: 'Staples Business Depot', items: [{ name: 'A4 Copier Paper Bundles (5x)', price: 950 }, { name: 'Printer Toner Cartridge', price: 2100 }], tax: 549, total: 3599 }
];

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async () => {
  // SECURITY GATE: Verify auditor credentials with robust persistent fallbacks
  const userRole = sessionStorage.getItem('emyxpnse_user_role') || localStorage.getItem('emyxpnse_user_role');
  const isLocalFile = location.protocol === 'file:';

  if (userRole !== 'admin' && !isLocalFile) {
    document.body.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; background:#05070c; color:#cbd5e1; font-family:sans-serif; text-align:center;">
        <span style="font-size:3rem; margin-bottom:15px;">❌</span>
        <h2 style="margin-bottom:8px; font-family:'Outfit', sans-serif; font-weight:800; color:#ef4444;">Access Denied</h2>
        <p style="color:#64748b; font-size:0.9rem;">Auditor credentials are required to view the Desktop Audit Panel.</p>
        <p style="color:#6366f1; font-size:0.8rem; margin-top:20px;">Redirecting to Secure Gateway...</p>
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

    // 3. Populate selectors & listeners
    populateMonthSelector();
    bindAdminEvents();

    // 4. Initial audit compilation
    renderAll();
    
    showToast('Admin Audit Dashboard Activated', 'success');
  } catch (err) {
    console.error('Admin boot fail:', err);
    showToast('Failed to initialize IndexedDB.', 'error');
  }
});

// Save state to local database
async function saveState() {
  try {
    // DYNAMIC DUAL-PORTAL VOUCHER RE-INDEXING:
    // Keep voucher names perfectly sequential inside each day grid
    // when the admin modifies amounts, descriptions, or deletes rows!
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
    console.error('Error saving state:', err);
  }
}

// Generate Month Option Items dynamically
function populateMonthSelector() {
  const selector = document.getElementById('monthSelector');
  if (!selector) return;

  const availableMonths = new Set(Object.keys(state.months));
  
  // Pad standard active months list
  const today = new Date();
  for (let i = -4; i <= 2; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    availableMonths.add(key);
  }

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

// Bind admin-focused interaction controls
function bindAdminEvents() {
  // Selector switch
  document.getElementById('monthSelector').addEventListener('change', (e) => {
    state.selectedMonth = e.target.value;
    if (!state.months[state.selectedMonth]) {
      state.months[state.selectedMonth] = { days: [] };
    }
    saveState();
    renderAll();
    showToast(`Switched audit sheet: ${e.target.selectedOptions[0].textContent}`);
  });

  // Action buttons
  document.getElementById('btnAddDay').addEventListener('click', () => {
    addNewDay();
  });

  document.getElementById('btnResetDB').addEventListener('click', () => {
    if (confirm('Delete the active ledger grid completely?')) {
      resetActiveLedger();
    }
  });

  document.getElementById('btnGenerateMock').addEventListener('click', () => {
    generateMockLedger();
  });

  document.getElementById('btnExportCSV').addEventListener('click', () => {
    exportAuditedCSV();
  });

  document.getElementById('btnSignOff').addEventListener('click', () => {
    window.print();
  });

  // Search input filtering
  document.getElementById('searchInput').addEventListener('input', (e) => {
    renderWorkspace(e.target.value.trim());
  });

  // Modal close binds
  document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
  document.getElementById('lightboxModal').addEventListener('click', (e) => {
    if (e.target.id === 'lightboxModal') closeLightbox();
  });

  // Logout & Exit audit panel securely
  const logoutBtn = document.getElementById('btnLogout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      showToast('Saving active audit progress securely...', 'info');
      await saveState();

      // AUTOMATED DATA PROTECTION AUDIT BACKUP:
      // Instantly generate and trigger a local download of the compiled audited CSV ledger backup!
      try {
        exportAuditedCSV();
      } catch (err) {
        console.error('Auto Audited CSV export failed on logout:', err);
      }

      showToast('Admin logged out successfully.', 'success');
      setTimeout(() => {
        location.href = 'index.html';
      }, 1000);
    });
  }

  // JSON Import Trigger Binds
  const importFileInput = document.getElementById('importFileInput');
  if (importFileInput) {
    importFileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        importUserLedgerFile(e.target.files[0]);
      }
    });
  }

  // 🔑 Employee Accounts Manager Binds
  const btnManageAccounts = document.getElementById('btnManageAccounts');
  if (btnManageAccounts) {
    btnManageAccounts.addEventListener('click', openAccountsModal);
  }
  
  const accountsClose = document.getElementById('accountsClose');
  if (accountsClose) {
    accountsClose.addEventListener('click', closeAccountsModal);
  }

  const btnCloseAccounts = document.getElementById('btnCloseAccounts');
  if (btnCloseAccounts) {
    btnCloseAccounts.addEventListener('click', closeAccountsModal);
  }

  const accountsModal = document.getElementById('accountsModal');
  if (accountsModal) {
    accountsModal.addEventListener('click', (e) => {
      if (e.target.id === 'accountsModal') closeAccountsModal();
    });
  }

  const addAccountForm = document.getElementById('addAccountForm');
  if (addAccountForm) {
    addAccountForm.addEventListener('submit', addAccount);
  }

  // Setup visual title
  updateActiveTitle();
}

function updateActiveTitle() {
  const titleEl = document.getElementById('activeLedgerTitle');
  if (!titleEl) return;
  const currentMonth = state.months[state.selectedMonth];
  if (currentMonth && currentMonth.days.length > 0) {
    titleEl.textContent = `Active Ledger: ${state.selectedMonth}`;
    titleEl.style.color = 'var(--color-emerald)';
  } else {
    titleEl.textContent = 'Empty Sheet';
    titleEl.style.color = 'var(--text-muted)';
  }
}

// Add a new Day sheet block
function addNewDay() {
  const currentMonth = state.months[state.selectedMonth];
  const dayCount = currentMonth.days.length;
  
  let nextDayNum = 1;
  if (dayCount > 0) {
    const maxDayNum = Math.max(...currentMonth.days.map(d => d.dayNumber || 0));
    nextDayNum = maxDayNum + 1;
  }

  const [year, month] = state.selectedMonth.split('-');
  const targetDay = Math.min(nextDayNum, new Date(parseInt(year), parseInt(month), 0).getDate());
  const defaultDateStr = `${year}-${month}-${String(targetDay).padStart(2, '0')}`;

  const newDay = {
    id: `day-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    dayNumber: nextDayNum,
    date: defaultDateStr,
    expenses: []
  };

  currentMonth.days.push(newDay);
  
  // Add one empty detail row by default
  addExpenseItem(newDay.id);

  saveState();
  renderAll();

  setTimeout(() => {
    const el = document.getElementById(newDay.id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, 100);

  showToast(`Created Day ${nextDayNum} ledger workspace.`, 'success');
}

function addExpenseItem(dayId) {
  const day = findDay(dayId);
  if (!day) return;

  const newItem = {
    id: `exp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    name: '',
    amount: 0,
    voucherId: null,
    voucherName: '',
    voucherType: '',
    voucherSize: '',
    auditStatus: 'pending', // 'approved' | 'flagged' | 'pending'
    adminComment: ''
  };

  day.expenses.push(newItem);
  saveState();
  renderAll();
}

function findDay(dayId) {
  return state.months[state.selectedMonth].days.find(d => d.id === dayId);
}

// Clear active month sheet
async function resetActiveLedger() {
  const currentMonthKey = state.selectedMonth;
  state.months[currentMonthKey] = { days: [] };
  await saveState();
  renderAll();
  showToast('Ledger cleared.');
}

// Refresh overall admin audit views
function renderAll() {
  renderWorkspace();
  updateAuditMetrics();
  updateActiveTitle();
}

// Render Wide Spreadsheet Desktop Grid
function renderWorkspace(searchQuery = '') {
  const container = document.getElementById('workspaceContainer');
  if (!container) return;

  const currentMonth = state.months[state.selectedMonth];
  
  if (!currentMonth || currentMonth.days.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📂</div>
        <h3>No Expense Data Loaded</h3>
        <p>This desktop sheet is currently empty. Import a mobile user ledger package JSON file on the left, load the demo ledger, or manually build expense items.</p>
        <div style="display:flex; gap:10px; width: 100%; max-width: 400px;">
          <button class="btn btn-primary" onclick="addNewDay()" style="flex:1;">➕ Start Ledger</button>
          <button class="btn" onclick="generateMockLedger()" style="border-color:rgba(16,185,129,0.3); color:var(--color-emerald); flex:1;">⚡ Load Demo</button>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  let matchFound = false;

  currentMonth.days.forEach(day => {
    // Filter rows based on search
    const filteredExpenses = day.expenses.filter(exp => {
      if (!searchQuery) return true;
      const term = searchQuery.toLowerCase();
      const serial = `${day.dayNumber}.${day.expenses.indexOf(exp) + 1}`;
      const status = (exp.auditStatus || 'pending').toLowerCase();
      return exp.name.toLowerCase().includes(term) || 
             serial.includes(term) || 
             exp.amount.toString().includes(term) ||
             status.includes(term) ||
             (exp.adminComment || '').toLowerCase().includes(term);
    });

    if (searchQuery && filteredExpenses.length === 0) return;
    matchFound = true;

    // Calcul subtotal
    const dayTotal = day.expenses.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

    const card = document.createElement('div');
    card.className = 'day-card';
    card.id = day.id;

    // Header structure for Desktop day sheet
    card.innerHTML = `
      <div class="day-header" style="padding: 14px 20px;">
        <div class="day-info">
          <div class="day-badge">
            Day 
            <input type="number" value="${day.dayNumber}" min="1" max="31" 
              onchange="updateDayNumber('${day.id}', this.value)" 
              onclick="event.stopPropagation()"
            />
          </div>
          <input type="date" class="day-date-picker" value="${day.date}" 
            onchange="updateDayDate('${day.id}', this.value)"
          />
        </div>
        <div class="day-actions">
          <div class="day-subtotal">Day Subtotal: ₹${dayTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          <button class="btn btn-danger btn-icon-only" onclick="deleteDay('${day.id}')" style="width:34px; height:34px;" title="Delete Day">
            🗑️
          </button>
        </div>
      </div>
      
      <!-- DESKTOP SPREADSHEET TABULAR GRID -->
      <div style="overflow-x: auto; background: rgba(0,0,0,0.15);">
        <table class="admin-desktop-grid">
          <thead>
            <tr>
              <th style="width: 70px;">Srl</th>
              <th>Expense Details</th>
              <th style="width: 160px; text-align: right;">Amount (INR)</th>
              <th style="width: 220px;">Voucher Document</th>
              <th style="width: 240px; text-align: center;">Audit Verification</th>
              <th style="width: 280px;">Audit Remarks / Notes</th>
              <th style="width: 60px; text-align: center;"></th>
            </tr>
          </thead>
          <tbody id="table-body-${day.id}">
            <!-- Rows render here -->
          </tbody>
        </table>
      </div>

      <div class="day-card-footer" style="padding: 10px 20px; display: flex; justify-content: flex-start; background: rgba(0,0,0,0.05);">
        <button class="btn btn-success" onclick="addExpenseItem('${day.id}')" style="font-size:0.75rem; padding: 6px 12px;">
          ➕ Insert Expense Row
        </button>
      </div>
    `;

    container.appendChild(card);

    const tbody = document.getElementById(`table-body-${day.id}`);
    const items = searchQuery ? filteredExpenses : day.expenses;

    if (items.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: var(--text-muted); font-size: 0.75rem; padding: 20px;">
            No items match active filters.
          </td>
        </tr>
      `;
    } else {
      day.expenses.forEach((exp, idx) => {
        if (searchQuery && !filteredExpenses.includes(exp)) return;

        const serialStr = `${day.dayNumber}.${idx + 1}`;
        const row = document.createElement('tr');
        row.id = exp.id;
        
        // Dynamic row styling matching verification status
        const currentStatus = exp.auditStatus || 'pending';
        if (currentStatus === 'approved') row.className = 'row-approved';
        else if (currentStatus === 'flagged') row.className = 'row-flagged';

        row.innerHTML = `
          <!-- Serial -->
          <td style="font-weight: 700; color: var(--text-muted); font-size: 0.8rem;">${serialStr}</td>
          
          <!-- Expense Details Description -->
          <td>
            <input type="text" class="cell-input" style="font-size: 0.85rem; padding: 4px;"
              value="${escapeHtml(exp.name)}" 
              placeholder="e.g. Travel tickets, stationery..."
              oninput="updateExpenseField('${day.id}', '${exp.id}', 'name', this.value)"
            />
          </td>

          <!-- Amount -->
          <td>
            <div style="display: flex; align-items: center; justify-content: flex-end; gap: 4px;">
              <span style="font-size:0.8rem; color:var(--text-muted)">₹</span>
              <input type="number" class="cell-input number-input" step="0.01" min="0" 
                style="text-align: right; font-size: 0.85rem; font-weight: 700; color: var(--color-emerald); max-width: 110px; padding: 4px;"
                value="${exp.amount || ''}" 
                placeholder="0.00"
                oninput="updateExpenseField('${day.id}', '${exp.id}', 'amount', this.value)"
                onblur="formatAmountCell(this)"
              />
            </div>
          </td>

          <!-- Voucher File Attachment Info -->
          <td id="voucher-cell-${exp.id}">
            <!-- Managed dynamically by renderVoucherCell -->
          </td>

          <!-- Verification Toggle Pills -->
          <td>
            <div class="status-pill-group" style="justify-content: center;">
              <button class="status-btn approved ${currentStatus === 'approved' ? 'active' : ''}" 
                onclick="updateAuditStatus('${day.id}', '${exp.id}', 'approved')" title="Approve expense">
                ✓ Approved
              </button>
              <button class="status-btn flagged ${currentStatus === 'flagged' ? 'active' : ''}" 
                onclick="updateAuditStatus('${day.id}', '${exp.id}', 'flagged')" title="Flag for review">
                ⚠ Flagged
              </button>
              <button class="status-btn ${currentStatus === 'pending' ? 'active' : ''}" 
                onclick="updateAuditStatus('${day.id}', '${exp.id}', 'pending')" title="Mark as pending">
                Pending
              </button>
            </div>
          </td>

          <!-- Admin Remarks Note -->
          <td>
            <input type="text" class="cell-input" style="font-size: 0.8rem; padding: 4px; border-color: rgba(255,255,255,0.06);"
              value="${escapeHtml(exp.adminComment || '')}" 
              placeholder="Add audit comments..."
              oninput="updateExpenseField('${day.id}', '${exp.id}', 'adminComment', this.value)"
            />
          </td>

          <!-- Delete Row Action -->
          <td style="text-align: center;">
            <button class="btn btn-danger btn-icon-only" onclick="deleteExpense('${day.id}', '${exp.id}')"
              style="width: 28px; height: 28px; padding: 0; min-height: 28px; border-radius: 6px;" title="Delete row">
              ×
            </button>
          </td>
        `;

        tbody.appendChild(row);
        renderVoucherCell(day.id, exp);
      });
    }
  });

  if (searchQuery && !matchFound) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 40px 16px;">
        <h3>No filter results found</h3>
        <p>No ledger item description, status, or comment matches "${escapeHtml(searchQuery)}" inside the sheet.</p>
        <button class="btn btn-primary" onclick="document.getElementById('searchInput').value = ''; renderWorkspace();">Clear Filters</button>
      </div>
    `;
  }
}

// Renders the voucher column inside the desktop table row
function renderVoucherCell(dayId, exp) {
  const cell = document.getElementById(`voucher-cell-${exp.id}`);
  if (!cell) return;

  if (exp.voucherId) {
    cell.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <button class="btn" style="padding: 2px 6px; font-size: 0.7rem; border-color: rgba(99,102,241,0.3); color: var(--color-indigo);" 
          onclick="viewVoucher('${exp.id}')" title="Preview receipt paper">
          🔍 Preview
        </button>
        <span style="font-size: 0.75rem; color: var(--text-muted); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 140px;" 
          title="${escapeHtml(exp.voucherName)}">
          ${escapeHtml(exp.voucherName)}
        </span>
      </div>
    `;
  } else {
    cell.innerHTML = `
      <span style="font-size: 0.75rem; color: var(--text-muted); font-style: italic;">
        No attachment
      </span>
    `;
  }
}

// Handle Import Ledger JSON Package (The offline mobile-to-admin bridge!)
function importUserLedgerFile(file) {
  if (!file) return;

  showToast('Reading ledger export package...', 'info');

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const packageObj = JSON.parse(e.target.result);

      if (packageObj.type !== 'emyxpnse_export_package') {
        showToast('Invalid file format. Please upload an EmyXpnse export file.', 'error');
        return;
      }

      // 1. Restore Sheet month data
      const monthKey = packageObj.selectedMonth;
      state.selectedMonth = monthKey;
      
      // Keep track of imported items
      state.months[monthKey] = { days: packageObj.days };

      // 2. Restore Embedded Base64 Vouchers directly into Admin IndexedDB!
      let vouchersImported = 0;
      if (packageObj.vouchers) {
        for (const [vId, base64Data] of Object.entries(packageObj.vouchers)) {
          await window.db.saveVoucher(vId, base64Data);
          vouchersImported++;
        }
      }

      // 3. Save combined data and reload dashboard
      await saveState();
      populateMonthSelector();
      renderAll();

      showToast(`Successfully imported ledger: ${monthKey} (${packageObj.days.length} Days, ${vouchersImported} Receipt Vouchers)`, 'success');
    } catch (err) {
      console.error(err);
      showToast('Import parsing failed. Corrupted JSON.', 'error');
    }
  };

  reader.onerror = () => showToast('Failed to load file.', 'error');
  reader.readAsText(file);
}

// Interactive status update trigger (Approved/Flagged/Pending)
function updateAuditStatus(dayId, expId, newStatus) {
  const day = findDay(dayId);
  if (!day) return;
  const exp = day.expenses.find(e => e.id === expId);
  if (!exp) return;

  exp.auditStatus = newStatus;
  
  // Save silently
  saveState();

  // Instant DOM updating of row highlight class to prevent overall list lags
  const rowEl = document.getElementById(expId);
  if (rowEl) {
    rowEl.className = ''; // remove existing classes
    if (newStatus === 'approved') rowEl.classList.add('row-approved');
    else if (newStatus === 'flagged') rowEl.classList.add('row-flagged');

    // Update active pill button highlights inside row
    const buttons = rowEl.querySelectorAll('.status-btn');
    buttons.forEach(btn => {
      btn.classList.remove('active');
      if (newStatus === 'approved' && btn.classList.contains('approved')) btn.classList.add('active');
      else if (newStatus === 'flagged' && btn.classList.contains('flagged')) btn.classList.add('active');
      else if (newStatus === 'pending' && !btn.classList.contains('approved') && !btn.classList.contains('flagged')) btn.classList.add('active');
    });
  }

  // Update audit metrics progress counters
  updateAuditMetrics();
}

// Edit fields inline
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

  if (field === 'adminComment') {
    expense.adminComment = value;
  }

  saveState();
  updateLiveTotals();
}

function updateDayNumber(dayId, newVal) {
  const day = findDay(dayId);
  if (!day) return;
  day.dayNumber = parseInt(newVal) || 1;
  saveState();
  renderAll();
}

function updateDayDate(dayId, newVal) {
  const day = findDay(dayId);
  if (!day) return;
  day.date = newVal;
  saveState();
  renderAll();
}

function formatAmountCell(input) {
  const val = parseFloat(input.value);
  if (!isNaN(val)) {
    input.value = val.toFixed(2);
  }
}

// Recalculates subtotals and updates DOM in-place
function updateLiveTotals() {
  const currentMonth = state.months[state.selectedMonth];
  if (!currentMonth) return;

  let grandTotal = 0;

  currentMonth.days.forEach(day => {
    const dayTotal = day.expenses.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    grandTotal += dayTotal;

    const cardEl = document.getElementById(day.id);
    if (cardEl) {
      const subtotalEl = cardEl.querySelector('.day-subtotal');
      if (subtotalEl) {
        subtotalEl.textContent = `Day Subtotal: ₹${dayTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
      }
    }
  });

  const totalDisplay = document.getElementById('footerGrandTotal');
  if (totalDisplay) totalDisplay.textContent = `₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  const sidebarTotal = document.getElementById('sidebarMonthTotal');
  if (sidebarTotal) sidebarTotal.textContent = `₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  renderCategoryBreakdown(currentMonth);
}

// Calculate compile totals and verification progress rates
function updateAuditMetrics() {
  const currentMonth = state.months[state.selectedMonth];
  if (!currentMonth) return;

  let grandTotal = 0;
  let totalItems = 0;
  let verifiedItems = 0;
  let voucherCount = 0;

  currentMonth.days.forEach(day => {
    grandTotal += day.expenses.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    totalItems += day.expenses.length;
    verifiedItems += day.expenses.filter(e => e.auditStatus === 'approved').length;
    voucherCount += day.expenses.filter(e => e.voucherId).length;
  });

  const rate = totalItems > 0 ? Math.round((verifiedItems / totalItems) * 100) : 0;

  // DOM bindings
  const displayTotal = document.getElementById('sidebarMonthTotal');
  if (displayTotal) displayTotal.textContent = `₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  const displayRate = document.getElementById('sidebarAuditRate');
  if (displayRate) displayRate.textContent = `${rate}%`;

  const displayVouchers = document.getElementById('sidebarVoucherCount');
  if (displayVouchers) displayVouchers.textContent = voucherCount;

  const displayFooter = document.getElementById('footerGrandTotal');
  if (displayFooter) displayFooter.textContent = `₹${grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

  renderCategoryBreakdown(currentMonth);
}

// Generate category spending breakdown charts
function renderCategoryBreakdown(monthData) {
  const chartContainer = document.getElementById('categoryChartContainer');
  if (!chartContainer) return;

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

// Lightbox preview viewer
async function viewVoucher(expId) {
  const modal = document.getElementById('lightboxModal');
  const details = document.getElementById('lightboxDetails');
  const frameContainer = document.getElementById('lightboxFrame');

  if (!modal || !frameContainer) return;

  let targetExp = null;
  Object.values(state.months).forEach(m => {
    m.days.forEach(d => {
      const found = d.expenses.find(e => e.id === expId);
      if (found) targetExp = found;
    });
  });

  if (!targetExp) return;

  showToast('Loading voucher receipt preview...', 'info');

  try {
    const base64Data = await window.db.getVoucher(`v-${expId}`);
    if (!base64Data) {
      showToast('Voucher attachment not found.', 'error');
      return;
    }

    details.innerHTML = `
      <div class="lightbox-title">${escapeHtml(targetExp.voucherName)}</div>
      <div class="lightbox-meta">${targetExp.name || 'No Description'} • ${targetExp.voucherSize} • Amount: ₹${targetExp.amount.toFixed(2)}</div>
    `;

    if (targetExp.voucherType.startsWith('image/')) {
      frameContainer.innerHTML = `<img class="lightbox-preview" src="${base64Data}" alt="voucher fullsize"/>`;
    } else if (targetExp.voucherType === 'application/pdf') {
      frameContainer.innerHTML = `<iframe class="lightbox-preview" src="${base64Data}" style="width: 100%; height: 50vh; border:none;"></iframe>`;
    } else {
      frameContainer.innerHTML = `
        <div class="lightbox-file-placeholder">
          <span style="font-size:2.5rem;">📄</span>
          <span>Receipt document file format.</span>
        </div>
      `;
    }

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

// Delete Day block
async function deleteDay(dayId) {
  if (!confirm('Are you sure you want to delete this entire Day card ledger?')) return;

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

// Delete row
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
    await saveState();
    renderAll();
    showToast('Expense row deleted.');
  }
}

// Export final Compiled Audit CSV (Including audit status verification and remarks!)
function exportAuditedCSV() {
  const currentMonth = state.months[state.selectedMonth];
  if (!currentMonth || currentMonth.days.length === 0) {
    showToast('No data available to export.', 'error');
    return;
  }

  let csvContent = '\uFEFF'; // UTF-8 BOM
  csvContent += 'Serial No,Date,Expense Description,Amount (INR),Receipt Filename,Audit Status,Auditor Remarks\r\n';

  currentMonth.days.forEach(day => {
    day.expenses.forEach((exp, idx) => {
      const serial = `"${day.dayNumber}.${idx + 1}"`;
      const date = `"${day.date}"`;
      const name = `"${(exp.name || '').replace(/"/g, '""')}"`;
      const amt = `"${(exp.amount || 0).toFixed(2)}"`;
      const voucherName = `"${(exp.voucherName || 'None').replace(/"/g, '""')}"`;
      const status = `"${(exp.auditStatus || 'pending').toUpperCase()}"`;
      const comment = `"${(exp.adminComment || '').replace(/"/g, '""')}"`;

      csvContent += `${serial},${date},${name},${amt},${voucherName},${status},${comment}\r\n`;
    });
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `emyxpnse_AUDITED_ledger_${state.selectedMonth}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Audited CSV ledger downloaded successfully.', 'success');
}

// SVG mock receipt builder
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
async function generateMockLedger() {
  showToast('Populating corporate demo ledger...', 'info');

  const currentMonthKey = state.selectedMonth;
  const [year, month] = currentMonthKey.split('-');
  
  state.months[currentMonthKey] = { days: [] };
  const currentMonth = state.months[currentMonthKey];

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
      const vName = `expense${i + 1}.svg`;

      const base64Receipt = generateSVGReceipt(cat.merchant, cat.items, cat.tax, cat.total, formattedDate);
      await window.db.saveVoucher(voucherId, base64Receipt);

      // Pre-set some audit states to look beautiful out of the box!
      let preSetStatus = 'pending';
      let preSetComment = '';
      if (dayNum === 1 && i === 0) {
        preSetStatus = 'approved';
        preSetComment = 'Office rental invoice verified.';
      } else if (dayNum === 1 && i === 1) {
        preSetStatus = 'approved';
        preSetComment = 'AWS cloud instances approved by CTO.';
      } else if (dayNum === 3 && i === 0) {
        preSetStatus = 'flagged';
        preSetComment = 'Missing dinner client list attendee sheet.';
      }

      newDay.expenses.push({
        id: expId,
        name: cat.name,
        amount: cat.total,
        voucherId: voucherId,
        voucherName: vName,
        voucherType: 'image/svg+xml',
        voucherSize: '3.4 KB',
        auditStatus: preSetStatus,
        adminComment: preSetComment
      });
    }

    currentMonth.days.push(newDay);
  }

  await saveState();
  renderAll();
  showToast('Corporate demo ledger populated!', 'success');
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

// HTML escape helper
function escapeHtml(string) {
  return String(string)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// =========================================================================
// 🔑 EMPLOYEE ACCOUNTS MANAGEMENT PANEL ENGINE
// =========================================================================

function openAccountsModal() {
  const modal = document.getElementById('accountsModal');
  if (modal) {
    modal.classList.add('active');
    loadAccounts();
  }
}

function closeAccountsModal() {
  const modal = document.getElementById('accountsModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

async function loadAccounts() {
  const tbody = document.getElementById('accountsTableBody');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); font-size:0.8rem;">Loading accounts from database...</td></tr>`;

  try {
    const response = await fetch('/api/users');
    const result = await response.json();

    if (result.success && result.users) {
      tbody.innerHTML = '';
      if (result.users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); font-size:0.8rem;">No registered accounts found.</td></tr>`;
        return;
      }

      result.users.forEach(user => {
        const tr = document.createElement('tr');
        const roleBadge = user.role === 'admin' 
          ? `<span class="portal-badge" style="background:rgba(16,185,129,0.1); border-color:rgba(16,185,129,0.2); color:#6ee7b7; font-size:0.65rem;">Auditor Admin</span>` 
          : `<span class="portal-badge" style="background:rgba(99,102,241,0.1); border-color:rgba(99,102,241,0.2); color:#a5b4fc; font-size:0.65rem;">Employee User</span>`;

        tr.innerHTML = `
          <td style="font-weight:700; color:var(--text-primary); font-size:0.85rem; padding: 10px 16px;">${escapeHtml(user.loginId)}</td>
          <td style="font-family:monospace; color:var(--text-secondary); font-size:0.85rem; padding: 10px 16px;">${escapeHtml(user.password)}</td>
          <td style="padding: 10px 16px;">${roleBadge}</td>
          <td style="text-align:right; padding: 10px 16px; display: flex; gap: 6px; justify-content: flex-end;">
            <button class="status-btn" onclick="resetEmployeePassword('${user.loginId}')" style="background:rgba(16,185,129,0.1); border-color:rgba(16,185,129,0.2); color:#6ee7b7; font-size:0.7rem; padding:4px 8px;">
              ✏️ Reset
            </button>
            <button class="status-btn" onclick="deleteAccount('${user.id}', '${user.loginId}')" style="background:rgba(239,68,68,0.1); border-color:rgba(239,68,68,0.2); color:#f87171; font-size:0.7rem; padding:4px 8px;">
              🗑️ Delete
            </button>
          </td>
        `;
        tbody.appendChild(tr);
      });
    } else {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#ef4444; font-size:0.8rem;">Failed to fetch accounts.</td></tr>`;
    }
  } catch (err) {
    console.error('Fetch users error:', err);
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); font-size:0.8rem;">Running offline. Predefined accounts: admin / user</td></tr>`;
  }
}

// Expose actions globally for inline html onclick bindings
window.deleteAccount = deleteAccount;
window.resetEmployeePassword = resetEmployeePassword;

async function resetEmployeePassword(loginId) {
  const newPass = prompt(`Enter a new security password for employee "${loginId}":`);
  if (!newPass) return;

  if (newPass.trim().length < 4) {
    alert("Security Alert: Password must be at least 4 characters long.");
    return;
  }

  try {
    const response = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginId, newPassword: newPass.trim() })
    });

    const result = await response.json();

    if (response.ok && result.success) {
      showToast(`Password for "${loginId}" updated successfully!`, 'success');
      loadAccounts();
    } else {
      showToast(result.error || 'Failed to reset password.', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Offline Mode: Cannot reset passwords without server database.', 'error');
  }
}

async function addAccount(e) {
  e.preventDefault();
  const loginIdInput = document.getElementById('newLoginId');
  const passwordInput = document.getElementById('newPassword');
  const roleInput = document.getElementById('newRole');

  const loginId = loginIdInput.value.trim();
  const password = passwordInput.value;
  const role = roleInput.value;

  if (!loginId || !password || !role) return;

  try {
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginId, password, role })
    });

    const result = await response.json();

    if (response.ok && result.success) {
      showToast(`User account "${loginId}" registered successfully!`, 'success');
      loginIdInput.value = '';
      passwordInput.value = '';
      loadAccounts();
    } else {
      showToast(result.error || 'Failed to add user account.', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Offline Mode: Cannot register accounts without server database.', 'error');
  }
}

async function deleteAccount(id, loginId) {
  // Prevent self-deletion of currently logged-in account
  const currentLogin = sessionStorage.getItem('emyxpnse_login_id');
  if (loginId === currentLogin) {
    showToast('Security Alert: You cannot delete your own logged-in account!', 'error');
    return;
  }

  if (!confirm(`Are you absolutely sure you want to delete the account "${loginId}"?`)) return;

  try {
    const response = await fetch(`/api/users/${id}`, {
      method: 'DELETE'
    });

    const result = await response.json();

    if (response.ok && result.success) {
      showToast(`Account "${loginId}" deleted successfully.`, 'success');
      loadAccounts();
    } else {
      showToast('Failed to delete account.', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Offline Mode: Cannot delete accounts without server database.', 'error');
  }
}
