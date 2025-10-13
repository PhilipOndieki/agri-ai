// Image Analysis Model
const mongoose = require('mongoose');

const imageAnalysisSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    originalImage: {
        filename: String,
        url: String,
        path: String,
        size: Number,
        mimetype: String,
        uploadedAt: { type: Date, default: Date.now }
    },
    processedImage: {
        filename: String,
        url: String,
        path: String,
        size: Number
    },
    analysis: {
        modelUsed: {
            type: String,
            default: 'mobilenet-v2'
        },
        predictions: [{
            className: String,
            probability: Number,
            classId: Number
        }],
        cropAnalysis: {
            detectedCrop: String,
            healthScore: {
                type: Number,
                min: 0,
                max: 100
            },
            condition: {
                type: String,
                enum: ['excellent', 'good', 'fair', 'poor', 'critical']
            },
            issues: [String],
            recommendations: [String],
            confidence: Number
        },
        soilAnalysis: {
            type: {
                type: String,
                enum: ['clay', 'sandy', 'loamy', 'silty', 'peaty', 'chalky']
            },
            moistureLevel: {
                type: String,
                enum: ['dry', 'moist', 'wet', 'waterlogged']
            },
            nutrientDeficiencies: [String],
            phEstimate: Number,
            texture: String,
            color: String,
            organicMatter: String
        },
        pestAnalysis: {
            detected: Boolean,
            pests: [{
                name: String,
                severity: {
                    type: String,
                    enum: ['low', 'medium', 'high', 'critical']
                },
                affectedArea: Number,
                recommendations: [String]
            }],
            disease: {
                detected: Boolean,
                name: String,
                symptoms: [String],
                treatment: [String]
            }
        },
        environmentalFactors: {
            lighting: String,
            season: String,
            weatherConditions: String,
            irrigationStatus: String
        }
    },
    metadata: {
        location: {
            latitude: Number,
            longitude: Number,
            address: String
        },
        weatherAtTime: {
            temperature: Number,
            humidity: Number,
            conditions: String
        },
        deviceInfo: {
            userAgent: String,
            deviceType: String,
            timestamp: Date
        }
    },
    isPublic: {
        type: Boolean,
        default: false
    },
    sharedWith: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    feedback: {
        rating: {
            type: Number,
            min: 1,
            max: 5
        },
        comments: String,
        correctedAnalysis: Object,
        submittedAt: Date
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed'],
        default: 'pending'
    },
    processingTime: Number, // in seconds
    errorMessage: String
}, {
    timestamps: true
});

// Index for efficient querying
imageAnalysisSchema.index({ user: 1, createdAt: -1 });
imageAnalysisSchema.index({ 'metadata.location': '2dsphere' });
imageAnalysisSchema.index({ status: 1 });

// Virtual for getting analysis summary
imageAnalysisSchema.virtual('summary').get(function() {
    return {
        id: this._id,
        crop: this.analysis.cropAnalysis.detectedCrop,
        healthScore: this.analysis.cropAnalysis.healthScore,
        condition: this.analysis.cropAnalysis.condition,
        issues: this.analysis.cropAnalysis.issues,
        recommendations: this.analysis.cropAnalysis.recommendations,
        createdAt: this.createdAt,
        imageUrl: this.originalImage.url
    };
});

// Method to add user feedback
imageAnalysisSchema.methods.addFeedback = function(rating, comments, correctedAnalysis) {
    this.feedback = {
        rating,
        comments,
        correctedAnalysis,
        submittedAt: new Date()
    };
    return this.save();
};

// Method to share analysis with other users
imageAnalysisSchema.methods.shareWith = function(userIds) {
    this.sharedWith = [...new Set([...this.sharedWith, ...userIds])];
    return this.save();
};

// Static method to get user's recent analyses
imageAnalysisSchema.statics.getRecentAnalyses = function(userId, limit = 10) {
    return this.find({ user: userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate('user', 'name email')
        .select('originalImage.url analysis.cropAnalysis createdAt');
};

// Static method to get analyses by location
imageAnalysisSchema.statics.getAnalysesByLocation = function(latitude, longitude, radius = 10000) {
    return this.find({
        'metadata.location': {
            $near: {
                $geometry: {
                    type: 'Point',
                    coordinates: [longitude, latitude]
                },
                $maxDistance: radius
            }
        }
    })
    .populate('user', 'name profile.avatar')
    .sort({ createdAt: -1 });
};

module.exports = mongoose.model('ImageAnalysis', imageAnalysisSchema);