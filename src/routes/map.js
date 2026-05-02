const express = require('express');
const router = express.Router();
const Kakao_Service = require('../services/Kakao_Service');

router.get('/search', async (req, res) => {
    try {
        const query = req.query.query; // 브라우저에서 보낸 ?query=강남역 추출
        if (!query) return res.status(400).send('검색어를 입력하세요.');

        const results = await Kakao_Service.searchPlaces(query);
        res.json(results);
    } catch (error) {
        res.status(500).send(error.message);
    }
});

module.exports = router;