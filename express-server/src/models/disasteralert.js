'use strict';
<<<<<<< HEAD
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class DisasterAlert extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  DisasterAlert.init({
    message: DataTypes.TEXT,
    radius_m: DataTypes.INTEGER,
    weight_penalty: DataTypes.INTEGER,
    received_at: DataTypes.DATE,
    expires_at: DataTypes.DATE
  }, {
    sequelize,
    modelName: 'DisasterAlert',
  });
  return DisasterAlert;
};
=======
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class DisasterAlert extends Model {
    static associate(models) {
      // define associations here
    }
  }

  DisasterAlert.init({
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    coordinates: {
      type: DataTypes.GEOMETRY('POINT', 4326),
      allowNull: false,
    },
    radius_m: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 500,
      validate: {
        min: 0,
      },
    },
    weight_penalty: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 30,
      validate: {
        min: 0,
        max: 100,
      },
    },
    received_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  }, {
    sequelize,
    modelName: 'DisasterAlert',
    indexes: [
      {
        // Prevents duplicate messages from being inserted via Sequelize
        unique: true,
        fields: ['message'],
        // TEXT columns need a prefix length for MySQL unique indexes
        // If migration already has this, Sequelize will skip creation
      },
    ],
  });

  return DisasterAlert;
};
>>>>>>> cc7618cee76bc2259ea2796180f1e1c55eae24f8
