module.exports = (sequelize, DataTypes) => {
  return sequelize.define('User', {
    id: { 
      type: DataTypes.UUID, 
      defaultValue: DataTypes.UUIDV4, 
      primaryKey: true 
    },
    loginId: { 
      type: DataTypes.STRING, 
      allowNull: false, 
      unique: true 
    },
    password: { 
      type: DataTypes.STRING, 
      allowNull: false 
    },
    role: { 
      type: DataTypes.ENUM('user', 'admin'), 
      defaultValue: 'user' 
    } // 'user' represents standard mobile employees, 'admin' represents desktop auditors
  }, { 
    timestamps: true 
  });
};
