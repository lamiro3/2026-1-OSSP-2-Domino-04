/**
 * [ARCHIVED] 20260504104132-create-place.js 원본
 *
 * 원래 위치:
 *   express-server/src/migrations/20260504104132-create-place.js
 *
 * 아카이브 이유:
 *   Places.gu_id 컬럼이 GuBoundaries 테이블을 외래키로 참조하고 있었으나,
 *   GuBoundaries 테이블을 생성하는 migration이 존재하지 않아
 *   "ERROR: Failed to open the referenced table 'GuBoundaries'" 오류 발생.
 *   GuBoundaries 기능이 현재 미구현 상태이므로 외래키를 제거한 버전으로 교체함.
 *
 * GuBoundaries 테이블 역할 (추후 구현 시 참고):
 *   - 서울시 구(區) 경계 데이터를 저장하는 테이블
 *   - Places.gu_id → GuBoundaries.id (N:1 관계)
 *   - 장소가 어느 구에 속하는지를 공간 데이터로 관리하려는 의도였을 것으로 추정
 *   - 구현 재개 시 GuBoundaries migration을 create-place.js 보다 먼저 실행해야 함
 *
 * 복원 방법:
 *   1. GuBoundaries migration 파일을 먼저 생성 (타임스탬프를 더 이른 날짜로)
 *   2. 이 파일의 내용으로 create-place.js를 덮어씀
 *   3. docker compose exec express-server npx sequelize-cli db:migrate 재실행
 *
 * 아카이브 날짜: 2025-05-25
 */

'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Places', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      gu_id: {
        type: Sequelize.INTEGER,
        references: {
          model: 'GuBoundaries', // GuBoundaries 테이블이 먼저 존재해야 함
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      category: {
        type: Sequelize.ENUM('ACCOMMODATION', 'RESTAURANT', 'CAFE', 'ATTRACTION'),
        allowNull: false
      },
      place_id: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true
      },
      coordinates: {
        type: Sequelize.GEOMETRY('POINT', 4326),
        allowNull: false
      },
      rating: {
        type: Sequelize.DECIMAL(3, 2)
      },
      num_reviews: {
        type: Sequelize.INTEGER
      },
      cached_at: {
        type: Sequelize.DATE
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    await queryInterface.addIndex('Places', ['coordinates'], {
      type: 'SPATIAL',
      name: 'places_coordinates_spatial'
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Places');
  }
};
