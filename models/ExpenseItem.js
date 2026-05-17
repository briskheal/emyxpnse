module.exports = (sequelize, DataTypes) => {
  return sequelize.define('ExpenseItem', {
    id: { 
      type: DataTypes.UUID, 
      defaultValue: DataTypes.UUIDV4, 
      primaryKey: true 
    },
    name: { 
      type: DataTypes.STRING, 
      defaultValue: '' 
    },
    amount: { 
      type: DataTypes.DECIMAL(12, 2), 
      defaultValue: 0.00 
    },
    
    // Receipt Vouchers
    voucherId: { 
      type: DataTypes.STRING, 
      defaultValue: null 
    },
    voucherName: { 
      type: DataTypes.STRING, 
      defaultValue: '' 
    },
    voucherType: { 
      type: DataTypes.STRING, 
      defaultValue: '' 
    },
    voucherSize: { 
      type: DataTypes.STRING, 
      defaultValue: '' 
    },
    voucherData: { 
      type: DataTypes.TEXT, 
      defaultValue: null 
    }, // Holds full raw Base64 data strings for receipts in Supabase
    
    // Admin Audits
    auditStatus: { 
      type: DataTypes.ENUM('pending', 'approved', 'flagged'), 
      defaultValue: 'pending' 
    },
    adminComment: { 
      type: DataTypes.STRING, 
      defaultValue: '' 
    }
  }, { 
    timestamps: true 
  });
};
