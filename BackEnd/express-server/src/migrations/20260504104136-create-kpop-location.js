'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('KpopLocations', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      artist_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Artists', // 참조할 테이블
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE' // 아티스트가 삭제되면 관련 장소 기록도 삭제
      },
      location_name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      place_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'Places',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      media_title: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      source_type: {
        type: Sequelize.ENUM('CSV', 'USER', 'ADMIN'),
        allowNull: false,
        defaultValue: 'CSV'
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
      }
    });
    await queryInterface.addIndex('KpopLocations', ['artist_id']);
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('KpopLocations');
  }
};