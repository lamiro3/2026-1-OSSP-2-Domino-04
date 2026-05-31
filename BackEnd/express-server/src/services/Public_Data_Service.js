const axios = require('axios');

class PublicDataService {
    constructor() {
        this.baseUrl = 'https://api.odcloud.kr/api';
<<<<<<< HEAD
        // .env 파일에 PUBLIC_DATA_API_KEY를 설정해야 합니다. (디코딩된 키 사용 권장)
        this.serviceKey = process.env.PUBLIC_DATA_API_KEY; 
=======
        // Set PUBLIC_DATA_API_KEY in .env (use decoded key)
        this.serviceKey = process.env.PUBLIC_DATA_API_KEY;
>>>>>>> cc7618cee76bc2259ea2796180f1e1c55eae24f8
    }

    async getMediaLocations(pageNo = 1, numOfRows = 10) {
        try {
<<<<<<< HEAD
            // 상세 엔드포인트 경로는 실제 발급받은 API 명세에 따라 수정 필요
            const endpoint = '/15111405/v1/uddi:d8741b9c-f484-4ea8-8f54-bd21ab62de14';
            
            //파라미터 변경 pageNo -> page, numOfRows -> perPage
            //returnType 제거 (ODCloud는 기본값이 JSON인 경우가 많음)
            const url = `${this.baseUrl}${endpoint}`;

            const requestConfig= {
=======
            // Update endpoint path according to the API spec you were issued
            const endpoint = '/15111405/v1/uddi:d8741b9c-f484-4ea8-8f54-bd21ab62de14';

            // Param names changed: pageNo -> page, numOfRows -> perPage
            // returnType removed (ODCloud defaults to JSON)
            const url = `${this.baseUrl}${endpoint}`;

            const requestConfig = {
>>>>>>> cc7618cee76bc2259ea2796180f1e1c55eae24f8
                params: {
                    serviceKey: this.serviceKey,
                    page: pageNo,
                    perPage: numOfRows,
<<<<<<< HEAD
                   returnType: 'JSON'
                },
            headers: {
                // 이미지의 'Name: Authorization'에 해당
                // ODCloud(infuser) API는 보통 'Infuser ' 접두사를 요구합니다.
                'Authorization': `Infuser ${this.serviceKey}`
            }
        };
            // 2. axios 호출 직전에 로그를 찍어 실제 전달되는 값을 확인합니다.
            console.log("=== API 요청 정보 ===");
            console.log("요청 URL:", url);
            console.log("파라미터:", requestConfig.params);
            console.log("헤더:", requestConfig.headers);
            console.log("=====================");

            // 3. API 호출
            const response = await axios.get(url, requestConfig);
            return response.data;
        } catch (error) {
            // 4. 400 에러의 구체적인 이유(공공데이터 서버가 보내주는 메시지)를 로그로 출력합니다.
            if (error.response) {
                console.error('공공데이터 API 응답 에러 데이터:', error.response.data);
            } else {
                console.error('공공데이터 API 호출 오류:', error.message);
=======
                    returnType: 'JSON'
                },
                headers: {
                    // ODCloud (infuser) API requires the 'Infuser ' prefix
                    'Authorization': `Infuser ${this.serviceKey}`
                }
            };

            const response = await axios.get(url, requestConfig);
            return response.data;
        } catch (error) {
            if (error.response) {
                console.error('[ERROR] Public Data API response error:', error.response.data);
            } else {
                console.error('[ERROR] Public Data API call failed:', error.message);
>>>>>>> cc7618cee76bc2259ea2796180f1e1c55eae24f8
            }
            throw error;
        }
    }
}

<<<<<<< HEAD
module.exports = new PublicDataService();
=======
module.exports = new PublicDataService();
>>>>>>> cc7618cee76bc2259ea2796180f1e1c55eae24f8
