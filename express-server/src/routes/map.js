const express = require('express');
const router = express.Router();
const axios = require('axios');
const { calculateRoute } = require('../services/FastAPI_Service');

router.get('/tripadvisor/search', async (req, res) => {
    try {
        const { searchQuery, latLong } = req.query;
        if (!searchQuery || !latLong) {
            return res.status(400).json({ error: 'searchQuery and latLong are required' });
        }
        const response = await axios.get('https://api.content.tripadvisor.com/api/v1/location/search', {
            params: { searchQuery, latLong, language: 'ko', key: process.env.TRIPADVISOR_API_KEY },
            headers: { 'Referer': '' }
        });
        res.json(response.data);
    } catch (error) {
        console.error('Tripadvisor search error:', error);
        const statusCode = error.response?.status || 500;
        res.status(statusCode).json(error.response?.data || { error: 'Search failed' });
    }
});

router.get('/tripadvisor/details/:locationId', async (req, res) => {
    try {
        const { locationId } = req.params;
        const response = await axios.get(`https://api.content.tripadvisor.com/api/v1/location/${locationId}/details`, {
            params: { language: 'ko', key: process.env.TRIPADVISOR_API_KEY },
            headers: { 'Referer': '' }
        });
        res.json(response.data);
    } catch (error) {
        console.error('Tripadvisor details error:', error);
        const statusCode = error.response?.status || 500;
        res.status(statusCode).json(error.response?.data || { error: 'Details failed' });
    }
});

/**
 * GET /api/directions
 * Kakao Directions + FastAPI disaster weight analysis
 * - FastAPI failure does NOT block route response (graceful degradation)
 * - Response: { route: <kakao data>, disaster_analysis: <fastapi data | null> }
 */
router.get('/directions', async (req, res) => {
    try {
        const { origin, destination } = req.query;
        if (!origin || !destination) {
            return res.status(400).json({ error: 'origin and destination are required' });
        }

        // 1. Kakao Directions
        const kakaoResponse = await axios.get(process.env.KAKAO_DIRECTIONS_URL, {
            params: req.query,
            headers: { 'Authorization': `KakaoAK ${process.env.KAKAO_REST_API_KEY}` }
        });
        const kakaoData = kakaoResponse.data;

        // 2. FastAPI disaster weight analysis (graceful degradation)
        let disasterAnalysis = null;
        try {
            disasterAnalysis = await calculateRoute(kakaoData);
        } catch (fastapiError) {
            console.error('[WARN] Disaster analysis failed, returning route only:', fastapiError.message);
        }

        // 3. Combined response
        res.json({
            route: kakaoData,
            disaster_analysis: disasterAnalysis,
        });

    } catch (error) {
        console.error('Kakao directions error:', error);
        const statusCode = error.response?.status || 500;
        res.status(statusCode).json(error.response?.data || { error: 'Directions failed' });
    }
});

module.exports = router;