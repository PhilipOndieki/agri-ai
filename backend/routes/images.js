// Image Upload and Processing Routes
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const ImageAnalysis = require('../models/ImageAnalysis');
const { auth } = require('../middleware/auth');
const User = require('../models/User');
const router = express.Router();

// Configure multer storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, '..', 'uploads', 'images');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// File filter
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
    }
};

// Multer upload configuration
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
        files: 1
    },
    fileFilter: fileFilter
});

// @route   POST /api/images/upload
// @desc    Upload image for analysis
// @access  Private
router.post('/upload', auth, upload.single('image'), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No image file provided'
            });
        }

        const { latitude, longitude, location, useProfileLocation = 'true' } = req.body;

        // Get user's default location from profile
        const user = await User.findById(req.user._id);
        
        let finalLocation = {
            latitude: null,
            longitude: null,
            address: null
        };

        // Priority 1: Manual location override (if provided)
        if (latitude && longitude) {
            console.log('✅ Using manual location from upload');
            finalLocation = {
                latitude: parseFloat(latitude),
                longitude: parseFloat(longitude),
                address: location || null
            };
        } 
        // Priority 2: User profile location (if useProfileLocation is true and available)
        else if (useProfileLocation === 'true' && user?.location?.coordinates?.[0] !== 0) {
            console.log('✅ Using profile default location');
            finalLocation = {
                latitude: user.location.coordinates[1], // MongoDB stores [longitude, latitude]
                longitude: user.location.coordinates[0],
                address: user.location.address || `${user.location.city || ''}, ${user.location.country || ''}`.trim()
            };
        } else {
            console.log('⚠️ No location data available');
        }

        // Create image analysis record
        const imageAnalysis = await ImageAnalysis.create({
            user: req.user._id,
            originalImage: {
                filename: req.file.filename,
                url: `/uploads/images/${req.file.filename}`,
                path: req.file.path,
                size: req.file.size,
                mimetype: req.file.mimetype
            },
            metadata: {
                location: finalLocation,
                deviceInfo: {
                    userAgent: req.get('User-Agent'),
                    timestamp: new Date()
                }
            }
        });

        res.json({
            success: true,
            message: 'Image uploaded successfully',
            data: {
                analysis: imageAnalysis,
                analysisId: imageAnalysis._id,
                imageUrl: imageAnalysis.originalImage.url,
                status: imageAnalysis.status,
                locationUsed: finalLocation.latitude ? 'provided' : 'not_available'
            }
        });
    } catch (error) {
        // Clean up uploaded file if error occurs
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        next(error);
    }
});


// @route   GET /api/images/analyses
// @desc    Get user's image analyses
// @access  Private
router.get('/analyses', auth, async (req, res, next) => {
    try {
        const { page = 1, limit = 10, status } = req.query;
        const skip = (page - 1) * limit;

        const filter = { user: req.user._id };
        if (status) {
            filter.status = status;
        }

        const analyses = await ImageAnalysis.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('user', 'name email');

        const total = await ImageAnalysis.countDocuments(filter);

        res.json({
            success: true,
            data: {
                analyses,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        next(error);
    }
});

// @route   GET /api/images/analyses/:id
// @desc    Get specific image analysis
// @access  Private
router.get('/analyses/:id', auth, async (req, res, next) => {
    try {
        const analysis = await ImageAnalysis.findOne({
            _id: req.params.id,
            $or: [
                { user: req.user._id },
                { sharedWith: req.user._id },
                { isPublic: true }
            ]
        }).populate('user', 'name email profile.avatar');

        if (!analysis) {
            return res.status(404).json({
                success: false,
                message: 'Analysis not found'
            });
        }

        res.json({
            success: true,
            data: { analysis }
        });
    } catch (error) {
        next(error);
    }
});

// @route   DELETE /api/images/analyses/:id
// @desc    Delete image analysis
// @access  Private
router.delete('/analyses/:id', auth, async (req, res, next) => {
    try {
        const analysis = await ImageAnalysis.findOne({
            _id: req.params.id,
            user: req.user._id
        });

        if (!analysis) {
            return res.status(404).json({
                success: false,
                message: 'Analysis not found'
            });
        }

        // Delete image files
        if (analysis.originalImage.path && fs.existsSync(analysis.originalImage.path)) {
            fs.unlinkSync(analysis.originalImage.path);
        }

        if (analysis.processedImage && analysis.processedImage.path && fs.existsSync(analysis.processedImage.path)) {
            fs.unlinkSync(analysis.processedImage.path);
        }

        await analysis.deleteOne();

        res.json({
            success: true,
            message: 'Analysis deleted successfully'
        });
    } catch (error) {
        next(error);
    }
});

// @route   POST /api/images/analyses/:id/feedback
// @desc    Add feedback to analysis
// @access  Private
router.post('/analyses/:id/feedback', auth, async (req, res, next) => {
    try {
        const { rating, comments, correctedAnalysis } = req.body;

        const analysis = await ImageAnalysis.findOne({
            _id: req.params.id,
            $or: [
                { user: req.user._id },
                { sharedWith: req.user._id }
            ]
        });

        if (!analysis) {
            return res.status(404).json({
                success: false,
                message: 'Analysis not found'
            });
        }

        await analysis.addFeedback(rating, comments, correctedAnalysis);

        res.json({
            success: true,
            message: 'Feedback submitted successfully'
        });
    } catch (error) {
        next(error);
    }
});

// @route   POST /api/images/analyses/:id/share
// @desc    Share analysis with other users
// @access  Private
router.post('/analyses/:id/share', auth, async (req, res, next) => {
    try {
        const { userIds, makePublic } = req.body;

        const analysis = await ImageAnalysis.findOne({
            _id: req.params.id,
            user: req.user._id
        });

        if (!analysis) {
            return res.status(404).json({
                success: false,
                message: 'Analysis not found'
            });
        }

        if (makePublic) {
            analysis.isPublic = true;
        }

        if (userIds && userIds.length > 0) {
            await analysis.shareWith(userIds);
        }

        res.json({
            success: true,
            message: 'Analysis shared successfully'
        });
    } catch (error) {
        next(error);
    }
});

// @route   GET /api/images/nearby
// @desc    Get analyses near a location
// @access  Private
router.get('/nearby', auth, async (req, res, next) => {
    try {
        const { latitude, longitude, radius = 10000, limit = 20 } = req.query;

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: 'Latitude and longitude are required'
            });
        }

        const analyses = await ImageAnalysis.getAnalysesByLocation(
            parseFloat(latitude),
            parseFloat(longitude),
            parseInt(radius),
            parseInt(limit)
        );

        res.json({
            success: true,
            data: { analyses }
        });
    } catch (error) {
        next(error);
    }
});

// @route   GET /api/images/stats
// @desc    Get user's image analysis statistics
// @access  Private
router.get('/stats', auth, async (req, res, next) => {
    try {
        const stats = await ImageAnalysis.aggregate([
            { $match: { user: req.user._id } },
            {
                $group: {
                    _id: null,
                    totalAnalyses: { $sum: 1 },
                    completedAnalyses: {
                        $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                    },
                    averageHealthScore: {
                        $avg: '$analysis.cropAnalysis.healthScore'
                    },
                    mostCommonCrop: {
                        $addToSet: '$analysis.cropAnalysis.detectedCrop'
                    }
                }
            }
        ]);

        const monthlyStats = await ImageAnalysis.aggregate([
            { $match: { user: req.user._id } },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id.year': -1, '_id.month': -1 } },
            { $limit: 12 }
        ]);

        res.json({
            success: true,
            data: {
                overall: stats[0] || {
                    totalAnalyses: 0,
                    completedAnalyses: 0,
                    averageHealthScore: 0,
                    mostCommonCrop: []
                },
                monthly: monthlyStats
            }
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;