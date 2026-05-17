/**
 * server.js
 * EmyXpnse - High Density Cloud Sync Express Engine
 * Connects to Supabase PostgreSQL, manages database transactions, synchronize models,
 * and handles safe offline-first fallback conditions.
 */

const express = require('express');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3030;

// Configure body-parsers with safe limits for heavy mobile receipt scan uploads
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Serve static assets cleanly
app.use(express.static(__dirname));

let dbEnabled = false;
let db = null;

// Graceful Database Loader - Prevents crash if database is not yet created or configured in .env!
if (process.env.DATABASE_URL) {
  try {
    db = require('./models');
    dbEnabled = true;
  } catch (err) {
    console.log(`\n\x1b[33m⚠️  [DATABASE CONNECTION WARNING]: Failed to load models folder: ${err.message}\x1b[0m\n`);
  }
}

// REST API — Health & Mode Check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    dbConnected: dbEnabled,
    mode: dbEnabled ? 'HYBRID_CLOUD_SYNC' : 'LOCAL_OFFLINE_FIRST',
    message: dbEnabled ? 'Connected to Supabase PostgreSQL' : 'Running in offline IndexedDB mode.'
  });
});

// REST API — Fetch entire active month sheet data
app.get('/api/ledger/:month', async (req, res) => {
  if (!dbEnabled) {
    return res.status(503).json({ success: false, error: 'Database is in offline mode.' });
  }

  try {
    const days = await db.ExpenseDay.findAll({
      where: { selectedMonth: req.params.month },
      include: [{ model: db.ExpenseItem, as: 'expenses' }],
      order: [
        ['dayNumber', 'ASC'],
        [{ model: db.ExpenseItem, as: 'expenses' }, 'createdAt', 'ASC']
      ]
    });
    res.json({ success: true, days });
  } catch (err) {
    console.error('Fetch ledger failure:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// REST API — Save / Sync entire Day Card and all child expense rows (Upsert Transaction)
app.post('/api/ledger/day/save', async (req, res) => {
  if (!dbEnabled) {
    return res.status(503).json({ success: false, error: 'Database is in offline mode.' });
  }

  const transaction = await db.sequelize.transaction();
  try {
    const { id, selectedMonth, dayNumber, date, expenses } = req.body;
    
    // 1. Upsert the parent Day Card
    await db.ExpenseDay.upsert({ id, selectedMonth, dayNumber, date }, { transaction });
    
    // 2. Synchronize child expense items
    if (expenses && expenses.length > 0) {
      for (const item of expenses) {
        await db.ExpenseItem.upsert({
          id: item.id,
          dayId: id,
          name: item.name,
          amount: item.amount,
          voucherId: item.voucherId,
          voucherName: item.voucherName,
          voucherType: item.voucherType,
          voucherSize: item.voucherSize,
          voucherData: item.voucherData, // base64 string
          auditStatus: item.auditStatus,
          adminComment: item.adminComment
        }, { transaction });
      }
    }
    
    await transaction.commit();

    // AUTOMATED BACKEND DATA LOSS PREVENTION:
    // Every single time a user or admin saves their data, compile a fresh CSV for that entire active month
    // and save it silently on the server's hard drive inside Emyxpnse/backups/!
    try {
      const fs = require('fs');
      const backupsDir = path.join(__dirname, 'backups');
      if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir);
      }

      // Fetch all day cards and row items for the active month
      const allDays = await db.ExpenseDay.findAll({
        where: { selectedMonth },
        include: [{ model: db.ExpenseItem, as: 'expenses' }],
        order: [
          ['dayNumber', 'ASC'],
          [{ model: db.ExpenseItem, as: 'expenses' }, 'createdAt', 'ASC']
        ]
      });

      let csvContent = '\uFEFF'; // UTF-8 BOM
      csvContent += 'Serial No,Date,Expense Description,Amount (INR),Receipt Filename,Audit Status,Auditor Remarks\r\n';

      allDays.forEach(day => {
        if (day.expenses) {
          day.expenses.forEach((exp, idx) => {
            const serial = `"${day.dayNumber}.${idx + 1}"`;
            const dateStr = `"${day.date}"`;
            const name = `"${(exp.name || '').replace(/"/g, '""')}"`;
            const amt = `"${(parseFloat(exp.amount) || 0).toFixed(2)}"`;
            const voucherName = `"${(exp.voucherName || 'None').replace(/"/g, '""')}"`;
            const status = `"${(exp.auditStatus || 'pending').toUpperCase()}"`;
            const comment = `"${(exp.adminComment || '').replace(/"/g, '""')}"`;

            csvContent += `${serial},${dateStr},${name},${amt},${voucherName},${status},${comment}\r\n`;
          });
        }
      });

      // Write the backup file cleanly
      const backupPath = path.join(backupsDir, `emyxpnse_backup_${selectedMonth}.csv`);
      fs.writeFileSync(backupPath, csvContent, 'utf8');
      console.log(`💾 [AUTO BACKUP SUCCESS]: Monthly CSV backup written successfully to ${backupPath}`);
    } catch (backupErr) {
      console.error('💾 [AUTO BACKUP ERROR]: Failed to write server-side backup CSV:', backupErr.message);
    }

    res.json({ success: true, message: 'Day ledger card synced successfully to Supabase.' });
  } catch (err) {
    await transaction.rollback();
    console.error('Day sync failure:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// REST API — Delete Day card and cascade delete all rows
app.delete('/api/ledger/day/:id', async (req, res) => {
  if (!dbEnabled) {
    return res.status(503).json({ success: false, error: 'Database is in offline mode.' });
  }

  try {
    await db.ExpenseDay.destroy({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Day card and cascading rows destroyed.' });
  } catch (err) {
    console.error('Day delete failure:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// REST API — Delete individual expense item row
app.delete('/api/ledger/item/:id', async (req, res) => {
  if (!dbEnabled) {
    return res.status(503).json({ success: false, error: 'Database is in offline mode.' });
  }

  try {
    await db.ExpenseItem.destroy({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Expense row destroyed.' });
  } catch (err) {
    console.error('Row delete failure:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// SPA routing fallback
app.get('*', (req, res, next) => {
  // If request is for an API endpoint, do not send index.html
  if (req.url.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server Routine
if (dbEnabled) {
  db.sequelize.sync().then(() => {
    console.log(`\n\x1b[32m========================================================\x1b[0m`);
    console.log(`\x1b[36m   EMYXPNSE SYSTEM SYNC ENGINE ACTIVE (SUPABASE CONNECTED)\x1b[0m`);
    console.log(`\x1b[33m   Open your web browser at: \x1b[32m\\x1b[1mhttp://localhost:${PORT}\x1b[0m`);
    console.log(`\x1b[32m========================================================\x1b[0m\n`);
    app.listen(PORT);
  }).catch(err => {
    console.error(`\x1b[31m❌ Failed to establish live Supabase DB connection: ${err.message}\x1b[0m`);
    console.log('🔄 Gracefully falling back to Local Offline-First Mode...\n');
    dbEnabled = false;
    launchOfflineServer();
  });
} else {
  console.log(`\n\x1b[33m⚠️  [DATABASE CONFIGURATION WARNING]: DATABASE_URL not set in .env\x1b[0m`);
  console.log(`\x1b[35m👉 Follow C:\\Users\\J S DASH\\.gemini\\antigravity\\brain\\e69ad86f-bde6-4b4d-a76f-cb12e11a6739\\supabase_guide.md to link Supabase!\x1b[0m`);
  console.log('🔄 Running in LOCAL OFFLINE-FIRST Mode (IndexedDB)...');
  launchOfflineServer();
}

function launchOfflineServer() {
  app.listen(PORT, () => {
    console.log(`\x1b[32m========================================================\x1b[0m`);
    console.log(`\x1b[33m   EMYXPNSE SERVER RUNNING AT: \x1b[32m\\x1b[1mhttp://localhost:${PORT}\x1b[0m`);
    console.log(`\x1b[32m========================================================\x1b[0m\n`);
  });
}
