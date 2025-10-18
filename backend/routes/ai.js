// AI Analysis Routes
const express = require('express');
const tf = require('@tensorflow/tfjs-node');
const mobilenet = require('@tensorflow-models/mobilenet'); 
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
        console.log('🤖 Loading MobileNet model...');
        
        // Load MobileNet using the official package
        model = await mobilenet.load({
            version: 1,
            alpha: 0.25, // Use lightweight version
        });
        
        console.log('✅ MobileNet model loaded successfully');
        modelLoading = false;
        return model;
    } catch (error) {
        console.error('❌ Failed to load MobileNet model:', error);
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

// Analyze image using TensorFlow and MobileNet
const analyzeImageWithAI = async (imagePath) => {
    try {
        // Load model if not already loaded
        const model = await loadModel();
        if (!model) {
            throw new Error('AI model not available');
        }

        // Load and preprocess image
        const imageBuffer = fs.readFileSync(imagePath);
        const imageTensor = tf.node.decodeImage(imageBuffer, 3); // 3 channels (RGB)
        
        // MobileNet expects 224x224 images
        const resizedTensor = tf.image.resizeBilinear(imageTensor, [224, 224]);
        
        // Normalize to [-1, 1] for MobileNet
        const normalizedTensor = resizedTensor.toFloat().div(127.5).sub(1.0);
        
        // Add batch dimension
        const batchedTensor = normalizedTensor.expandDims(0);
        
        // Run prediction using MobileNet classify method
        const predictions = await model.classify(batchedTensor);
        
        console.log('🔍 MobileNet predictions:', predictions);
        
        // Convert to agricultural analysis
        const agriculturalAnalysis = convertToAgriculturalAnalysis(predictions);
        
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
    console.log('📊 Raw MobileNet predictions:', JSON.stringify(predictions, null, 2));
    
    // Ensure we have predictions
    if (!predictions || predictions.length === 0) {
        throw new Error('No predictions returned from model');
    }
    
    // Extract top prediction
    const topPrediction = predictions[0];
    const className = topPrediction.className.toLowerCase();
    const probability = topPrediction.probability;
    
    console.log('🎯 Top prediction:', className, 'confidence:', probability);
    
    // Detect crop type from predictions
    let detectedCrop = 'Unknown Crop';
    let isPlant = false;
    
    // Check if prediction matches agricultural keywords
    for (const [crop, keywords] of Object.entries(AGRICULTURAL_CLASSES)) {
        if (keywords.some(keyword => className.includes(keyword))) {
            detectedCrop = crop.charAt(0).toUpperCase() + crop.slice(1);
            isPlant = true;
            console.log('✅ Matched crop:', detectedCrop);
            break;
        }
    }
    
    // If not agricultural, check if it's plant-related
    const plantKeywords = ['plant', 'leaf', 'flower', 'vegetable', 'fruit', 'crop', 'tree', 'grass', 'bush', 'vine', 'seed', 'root'];
    if (!isPlant && plantKeywords.some(keyword => className.includes(keyword))) {
        isPlant = true;
        detectedCrop = className.split(',')[0].trim();
        console.log('🌱 Plant-related detected:', detectedCrop);
    }
    
    // Calculate health score based on prediction confidence and keywords
    let healthScore = 70;
    const healthKeywords = ['healthy', 'fresh', 'green', 'vibrant'];
    const diseaseKeywords = ['diseased', 'infected', 'blight', 'rot', 'dead', 'withered', 'wilted', 'rust', 'mold'];
    
    if (healthKeywords.some(keyword => className.includes(keyword))) {
        healthScore = Math.floor(85 + (probability * 15)); // 85-100
    } else if (diseaseKeywords.some(keyword => className.includes(keyword))) {
        healthScore = Math.floor(30 + (probability * 30)); // 30-60
    } else {
        healthScore = Math.floor(60 + (probability * 30)); // 60-90
    }
    
    console.log('💚 Calculated health score:', healthScore);
    
    // Detect diseases
    let diseaseDetected = diseaseKeywords.some(keyword => className.includes(keyword)) || healthScore < 60;
    let diseaseName = '';
    let symptoms = [];
    let treatment = [];
    let issues = [];
    
    if (diseaseDetected) {
        diseaseName = 'Potential stress or disease detected';
        symptoms = [
            'Visual stress indicators present',
            'Unusual coloration detected',
            'Possible health decline'
        ];
        treatment = [
            'Consult agricultural expert for proper diagnosis',
            'Isolate affected plants if possible',
            'Check environmental conditions (water, light, nutrients)',
            'Consider appropriate treatment based on expert diagnosis',
            'Monitor surrounding plants for similar symptoms'
        ];
        issues = ['Disease or stress indicators detected', 'Requires attention'];
    }
    
    // Generate recommendations based on health score
    let recommendations = [];
    if (healthScore > 85) {
        recommendations = [
            'Excellent condition - maintain current practices',
            'Document successful methods for future reference',
            'Monitor regularly to catch early issues',
            'Consider this as a baseline for comparison'
        ];
    } else if (healthScore > 70) {
        recommendations = [
            'Good overall health detected',
            'Continue regular monitoring',
            'Ensure consistent care schedule',
            'Check soil moisture and nutrients periodically'
        ];
    } else if (healthScore > 50) {
        recommendations = [
            'Fair condition - increased monitoring recommended',
            'Check for environmental stressors',
            'Consider soil testing',
            'Verify irrigation and drainage systems',
            'Inspect for pest activity'
        ];
    } else {
        recommendations = [
            '⚠️ Poor condition - immediate attention needed',
            'Consult agricultural expert urgently',
            'Isolate plant if disease suspected',
            'Review and adjust care practices immediately',
            'Document symptoms for expert consultation'
        ];
    }
    
    const analysis = {
        cropAnalysis: {
            detectedCrop: detectedCrop,
            healthScore: healthScore,
            condition: healthScore > 85 ? 'excellent' : healthScore > 70 ? 'good' : healthScore > 50 ? 'fair' : 'poor',
            issues: issues,
            recommendations: recommendations,
            confidence: Math.round(probability * 100) / 100,
            rawPredictions: predictions.slice(0, 3).map(p => ({
                class: p.className,
                probability: (p.probability * 100).toFixed(2) + '%'
            }))
        },
        soilAnalysis: {
            type: 'Visual analysis not available',
            moistureLevel: 'Cannot determine from image',
            nutrientDeficiencies: [],
            phEstimate: null,
            texture: 'Not detectable from image',
            color: 'Requires physical soil sample',
            organicMatter: 'Not detectable from image',
            note: 'Soil analysis requires physical sample testing'
        },
        pestAnalysis: {
            detected: diseaseDetected,
            pests: [],
            disease: {
                detected: diseaseDetected,
                name: diseaseName,
                symptoms: symptoms,
                treatment: treatment
            },
            note: 'Detailed pest identification requires expert examination'
        },
        environmentalFactors: {
            lighting: 'Visible in image',
            season: 'Cannot determine from single image',
            weatherConditions: 'Cannot determine from image',
            irrigationStatus: 'Not detectable from image',
            note: 'Environmental factors require additional context'
        }
    };
    
    console.log('✅ Analysis complete:', {
        crop: detectedCrop,
        health: healthScore,
        diseaseDetected,
        recommendationsCount: recommendations.length
    });
    
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
module.exports.analyzeImageWithAI = analyzeImageWithAI;