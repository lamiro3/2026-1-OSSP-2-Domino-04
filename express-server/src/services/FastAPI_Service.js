const axios = require('axios');

const FASTAPI_URL = process.env.FASTAPI_URL || 'http://fastapi:8000';

// FastAPI 서버가 다운됐을 때와 요청 자체가 실패했을 때를 구분해서 처리
const parseDisaster = async (message) => {
  try {
    const response = await axios.post(`${FASTAPI_URL}/disaster/analyze`, {
      message
    }, { timeout: 10000 }); // 타임아웃 추가 (10초)
    return response.data;
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      throw new Error('AI 분석 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.');
    }
    const message = error.response?.data?.detail || error.message;
    throw new Error(`재난 문자 분석 실패: ${message}`);
  }
};

const calculateRoute = async (routeData) => {
  try {
    const response = await axios.post(`${FASTAPI_URL}/route/calculate`, {
      routeData
    }, { timeout: 10000 });
    return response.data;
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      throw new Error('AI 분석 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.');
    }
    const message = error.response?.data?.detail || error.message;
    throw new Error(`경로 계산 실패: ${message}`);
  }
};

module.exports = { parseDisaster, calculateRoute };