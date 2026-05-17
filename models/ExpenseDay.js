module.exports = (sequelize, DataTypes) => {
  return sequelize.define('ExpenseDay', {
    id: { 
      type: DataTypes.STRING(100), 
      primaryKey: true 
    },
    selectedMonth: { 
      type: DataTypes.STRING, 
      allowNull: false 
    }, // Saved as "YYYY-MM" (e.g. "2026-05") to support high-density sheet querying
    dayNumber: { 
      type: DataTypes.INTEGER, 
      allowNull: false 
    },
    date: { 
      type: DataTypes.STRING, 
      allowNull: false 
    }, // Saved as "YYYY-MM-DD"
    loginId: {
      type: DataTypes.STRING,
      defaultValue: 'user'
    }
  }, { 
    timestamps: true 
  });
};
