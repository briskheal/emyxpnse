const { Sequelize, DataTypes } = require('sequelize');
require('dotenv').config();

// Establish safe PostgreSQL pooler connection with forced SSL for Supabase cloud security groups
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  },
  logging: false // Disable console log noise in dev mode
});

const db = {};
db.Sequelize = Sequelize;
db.sequelize = sequelize;

// Register sheet models
db.ExpenseDay = require('./ExpenseDay')(sequelize, DataTypes);
db.ExpenseItem = require('./ExpenseItem')(sequelize, DataTypes);
db.User = require('./User')(sequelize, DataTypes);

// Establish clean parent-child foreign key mappings (One Day Card -> Many Expense Detail Rows)
db.ExpenseDay.hasMany(db.ExpenseItem, { as: 'expenses', foreignKey: 'dayId', onDelete: 'CASCADE' });
db.ExpenseItem.belongsTo(db.ExpenseDay, { as: 'day', foreignKey: 'dayId' });

module.exports = db;
