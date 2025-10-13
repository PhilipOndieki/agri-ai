// AI Analysis Routes
const express = require('express');
const tf = require('@tensorflow/tfjs-node');
const path = require('path');
const fs = require('fs');
const ImageAnalysis = require('../models/ImageAnalysis');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Load TensorFlow model (singleton)
let model = null;
let modelLoading = false;

const loadModel = async () => {
    if (model || modelLoading) return model;
    
    modelLoading = true;
    try {
        console.log('🤖 Loading TensorFlow model...');
        // Load MobileNet model
        model = await tf.loadLayersModel('https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_0.25_224/model.json');
        console.log('✅ TensorFlow model loaded successfully');
        modelLoading = false;
        return model;
    } catch (error) {
        console.error('❌ Failed to load TensorFlow model:', error);
        modelLoading = false;
        throw error;
    }
};

// Agricultural crop classes mapping (subset of ImageNet classes relevant to agriculture)
const AGRICULTURAL_CLASSES = {
    // Crops
    'corn': ['maize', 'corn', 'ear', 'spike', 'cob'],
    'wheat': ['wheat', 'grain', 'cereal', 'spike'],
    'rice': ['rice', 'grain', 'cereal', 'paddy'],
    'soybean': ['soybean', 'bean', 'legume'],
    'potato': ['potato', 'tuber', 'vegetable'],
    'tomato': ['tomato', 'fruit', 'vegetable'],
    'cotton': ['cotton', 'plant', 'fiber'],
    'sugarcane': ['sugarcane', 'sugar', 'cane'],
    
    // Issues
    'diseased': ['diseased', 'disease', 'infected', 'blight', 'rot'],
    'healthy': ['healthy', 'fresh', 'green', 'vibrant'],
    'dry': ['dry', 'withered', 'wilted', 'dead'],
    'wet': ['wet', 'waterlogged', 'flooded', 'moist']
};

// Analyze image using TensorFlow
const analyzeImageWithAI = async (imagePath) => {
    try {
        // Load model if not already loaded
        const model = await loadModel();
        if (!model) {
            throw new Error('AI model not available');
        }

        // Load and preprocess image
        const imageBuffer = fs.readFileSync(imagePath);
        const imageTensor = tf.node.decodeImage(imageBuffer);
        
        // Resize to 224x224 for MobileNet
        const resizedTensor = tf.image.resizeBilinear(imageTensor, [224, 224]);
        
        // Normalize pixel values
        const normalizedTensor = resizedTensor.div(255.0);
        
        // Add batch dimension
        const batchedTensor = normalizedTensor.expandDims(0);
        
        // Run prediction
        const predictions = await model.predict(batchedTensor).data();
        
        // Get top predictions
        const topPredictions = Array.from(predictions)
            .map((probability, index) => ({ probability, index }))
            .sort((a, b) => b.probability - a.probability)
            .slice(0, 5);

        // Convert to agricultural analysis
        const agriculturalAnalysis = convertToAgriculturalAnalysis(topPredictions);
        
        // Clean up tensors
        imageTensor.dispose();
        resizedTensor.dispose();
        normalizedTensor.dispose();
        batchedTensor.dispose();

        return agriculturalAnalysis;
    } catch (error) {
        console.error('AI analysis error:', error);
        throw error;
    }
};

// Convert ImageNet predictions to agricultural analysis
const convertToAgriculturalAnalysis = (predictions) => {
    // Mock agricultural analysis based on predictions
    // In a real implementation, you'd have a trained agricultural model
    
    const analysis = {
        cropAnalysis: {
            detectedCrop: 'Unknown Crop',
            healthScore: Math.floor(Math.random() * 40) + 60, // 60-100
            condition: 'good',
            issues: [],
            recommendations: [
                'Monitor crop regularly for signs of stress',
                'Maintain proper irrigation schedule',
                'Check soil nutrient levels'
            ],
            confidence: 0.75
        },
        soilAnalysis: {
            type: 'loamy',
            moistureLevel: 'moist',
            nutrientDeficiencies: [],
            phEstimate: 6.5,
            texture: 'Medium',
            color: 'Dark brown',
            organicMatter: 'Adequate'
        },
        pestAnalysis: {
            detected: false,
            pests: [],
            disease: {
                detected: false,
                name: '',
                symptoms: [],
                treatment: []
            }
        },
        environmentalFactors: {
            lighting: 'Adequate',
            season: 'Growing season',
            weatherConditions: 'Favorable',
            irrigationStatus: 'Optimal'
        }
    };

    // Simulate analysis based on random factors
    const healthScore = Math.floor(Math.random() * 40) + 60;
    analysis.cropAnalysis.healthScore = healthScore;
    
    if (healthScore > 90) {
        analysis.cropAnalysis.condition = 'excellent';
        analysis.cropAnalysis.recommendations = [
            'Excellent crop condition maintained',
            'Continue current farming practices',
            'Consider sharing success with community'
        ];
    } else if (healthScore > 75) {
        analysis.cropAnalysis.condition = 'good';
        analysis.cropAnalysis.recommendations = [
            'Good overall condition',
            'Monitor for any changes',
            'Maintain regular care schedule'
        ];
    } else if (healthScore > 50) {
        analysis.cropAnalysis.condition = 'fair';
        analysis.cropAnalysis.issues = ['Minor stress indicators'];
        analysis.cropAnalysis.recommendations = [
            'Check irrigation system',
            'Inspect for pests',
            'Consider soil testing'
        ];
    } else {
        analysis.cropAnalysis.condition = 'poor';
        analysis.cropAnalysis.issues = ['Visible stress', 'Poor growth'];
        analysis.cropAnalysis.recommendations = [
            'Immediate attention required',
            'Consult agricultural expert',
            'Consider treatment options'
        ];
    }

    return analysis;
};

// @route   POST /api/ai/analyze/:analysisId
// @desc    Analyze image using AI
// @access  Private
router.post('/analyze/:analysisId', auth, async (req, res, next) => {
    try {
        const { analysisId } = req.params;
        
        // Find the image analysis
        const imageAnalysis = await ImageAnalysis.findOne({
            _id: analysisId,
            user: req.user._id
        });

        if (!imageAnalysis) {
            return res.status(404).json({
                success: false,
                message: 'Image analysis not found'
            });
        }

        // Check if already processed
        if (imageAnalysis.status === 'completed') {
            return res.json({
                success: true,
                message: 'Analysis already completed',
                data: { analysis: imageAnalysis }
            });
        }

        // Update status to processing
        imageAnalysis.status = 'processing';
        await imageAnalysis.save();

        try {
            const startTime = Date.now();
            
            // Perform AI analysis
            const analysis = await analyzeImageWithAI(imageAnalysis.originalImage.path);
            
            const processingTime = (Date.now() - startTime) / 1000;

            // Update analysis with results
            imageAnalysis.analysis = analysis;
            imageAnalysis.processingTime = processingTime;
            imageAnalysis.status = 'completed';
            await imageAnalysis.save();

            res.json({
                success: true,
                message: 'Image analyzed successfully',
                data: { analysis: imageAnalysis }
            });

        } catch (aiError) {
            // Update status to failed
            imageAnalysis.status = 'failed';
            imageAnalysis.errorMessage = aiError.message;
            await imageAnalysis.save();

            return res.status(500).json({
                success: false,
                message: 'AI analysis failed',
                error: aiError.message
            });
        }

    } catch (error) {
        next(error);
    }
});

// @route   GET /api/ai/models
// @desc    Get available AI models
// @access  Private
router.get('/models', auth, async (req, res, next) => {
    try {
        const models = [
            {
                id: 'mobilenet-v2',
                name: 'MobileNet V2',
                description: 'Lightweight model for mobile and edge devices',
                categories: ['crop_classification', 'health_assessment'],
                accuracy: 0.75,
                speed: 'fast',
                size: '14MB'
            },
            {
                id: 'agricultural-net',
                name: 'AgriculturalNet',
                description: 'Specialized model for agricultural applications',
                categories: ['crop_classification', 'disease_detection', 'pest_identification'],
                accuracy: 0.85,
                speed: 'medium',
                size: '45MB'
            }
        ];

        res.json({
            success: true,
            data: { models }
        });
    } catch (error) {
        next(error);
    }
});

// @route   GET /api/ai/crop-suggestions
// @desc    Get crop suggestions based on location and conditions
// @access  Private
router.get('/crop-suggestions', auth, async (req, res, next) => {
    try {
        const { latitude, longitude, soilType, season } = req.query;

        // Mock crop suggestions based on location and conditions
        const suggestions = [
            {
                crop: 'Rice',
                suitability: 85,
                reasons: ['Suitable for tropical climate', 'High water availability', 'Good soil conditions'],
                growingSeason: 'Kharif',
                expectedYield: '4-5 tons/hectare',
                marketPrice: '₹18-22/kg',
                investment: 'Medium',
                risks: ['Water logging', 'Pest attacks'],
                recommendations: ['Use quality seeds', 'Proper water management', 'Regular pest monitoring']
            },
            {
                crop: 'Wheat',
                suitability: 75,
                reasons: ['Suitable for temperate climate', 'Good soil drainage', 'Moderate water requirement'],
                growingSeason: 'Rabi',
                expectedYield: '3-4 tons/hectare',
                marketPrice: '₹20-25/kg',
                investment: 'Low',
                risks: ['Frost damage', 'Rust diseases'],
                recommendations: ['Timely sowing', 'Disease resistant varieties', 'Proper fertilization']
            },
            {
                crop: 'Cotton',
                suitability: 70,
                reasons: ['Warm climate suitable', 'Well-drained soil', 'Long growing season'],
                growingSeason: 'Kharif',
                expectedYield: '2-3 tons/hectare',
                marketPrice: '₹45-55/kg',
                investment: 'High',
                risks: ['Pest attacks', 'Weather fluctuations'],
                recommendations: ['BT cotton varieties', 'Integrated pest management', 'Proper spacing']
            }
        ];

        res.json({
            success: true,
            data: { suggestions }
        });
    } catch (error) {
        next(error);
    }
});

// @route   POST /api/ai/batch-analyze
// @desc    Analyze multiple images
// @access  Private
router.post('/batch-analyze', auth, async (req, res, next) => {
    try {
        const { analysisIds } = req.body;

        if (!analysisIds || !Array.isArray(analysisIds)) {
            return res.status(400).json({
                success: false,
                message: 'Analysis IDs array is required'
            });
        }

        const results = await Promise.allSettled(
            analysisIds.map(id => 
                analyzeImageWithAI(id)
                    .then(analysis => ({ id, success: true, analysis }))
                    .catch(error => ({ id, success: false, error: error.message }))
            )
        );

        const successful = results.filter(r => r.status === 'fulfilled' && r.value.success);
        const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success));

        res.json({
            success: true,
            data: {
                successful: successful.length,
                failed: failed.length,
                results: results.map(r => r.status === 'fulfilled' ? r.value : { success: false, error: r.reason })
            }
        });
    } catch (error) {
        next(error);
    }
});

// @route   GET /api/ai/analytics
// @desc    Get AI analysis analytics
// @access  Private
router.get('/analytics', auth, async (req, res, next) => {
    try {
        const { period = '30d' } = req.query;

        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - parseInt(period.replace('d', '')));

        const analytics = await ImageAnalysis.aggregate([
            {
                $match: {
                    user: req.user._id,
                    createdAt: { $gte: startDate, $lte: endDate },
                    status: 'completed'
                }
            },
            {
                $group: {
                    _id: null,
                    totalAnalyses: { $sum: 1 },
                    averageHealthScore: {
                        $avg: '$analysis.cropAnalysis.healthScore'
                    },
                    commonCrops: {
                        $addToSet: '$analysis.cropAnalysis.detectedCrop'
                    },
                    commonIssues: {
                        $addToSet: '$analysis.cropAnalysis.issues'
                    }
                }
            },
            {
                $project: {
                    totalAnalyses: 1,
                    averageHealthScore: { $round: ['$averageHealthScore', 2] },
                    commonCrops: 1,
                    commonIssues: 1
                }
            }
        ]);

        const monthlyAnalytics = await ImageAnalysis.aggregate([
            {
                $match: {
                    user: req.user._id,
                    createdAt: { $gte: startDate, $lte: endDate },
                    status: 'completed'
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' }
                    },
                    analyses: { $sum: 1 },
                    avgHealthScore: { $avg: '$analysis.cropAnalysis.healthScore' }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        res.json({
            success: true,
            data: {
                summary: analytics[0] || {
                    totalAnalyses: 0,
                    averageHealthScore: 0,
                    commonCrops: [],
                    commonIssues: []
                },
                monthly: monthlyAnalytics
            }
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;