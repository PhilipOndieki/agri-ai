// Weather Alert Model
const mongoose = require('mongoose');

const weatherAlertSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Alert title is required'],
        trim: true,
        maxlength: [200, 'Title cannot exceed 200 characters']
    },
    description: {
        type: String,
        required: [true, 'Alert description is required'],
        maxlength: [1000, 'Description cannot exceed 1000 characters']
    },
    severity: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        required: true
    },
    type: {
        type: String,
        enum: ['temperature', 'precipitation', 'wind', 'humidity', 'storm', 'frost', 'drought', 'flood'],
        required: true
    },
    affectedAreas: {
        type: {
            type: String,
            enum: ['Point', 'Polygon'],
            default: 'Point'
        },
        coordinates: {
            type: [Number],
            required: true
        }
    },
    recommendations: [{
        type: String,
        maxlength: [500, 'Recommendation cannot exceed 500 characters']
    }],
    affectedCrops: [String],
    startTime: {
        type: Date,
        default: Date.now
    },
    expiresAt: {
        type: Date,
        required: true
    },
    isGlobal: {
        type: Boolean,
        default: false
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    acknowledgedBy: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        acknowledgedAt: {
            type: Date,
            default: Date.now
        }
    }],
    metadata: {
        source: {
            type: String,
            enum: ['manual', 'automatic', 'external_api'],
            default: 'manual'
        },
        confidence: {
            type: Number,
            min: 0,
            max: 1
        },
        externalId: String
    }
}, {
    timestamps: true
});

// Index for efficient querying
weatherAlertSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
weatherAlertSchema.index({ affectedAreas: '2dsphere' });
weatherAlertSchema.index({ severity: 1, isActive: 1 });
weatherAlertSchema.index({ createdAt: -1 });

// Virtual for checking if alert is active
weatherAlertSchema.virtual('isExpired').get(function() {
    return this.expiresAt < new Date();
});

// Pre-save middleware to set isActive based on expiration
weatherAlertSchema.pre('save', function(next) {
    this.isActive = this.expiresAt > new Date();
    next();
});

// Method to acknowledge alert
weatherAlertSchema.methods.acknowledge = function(userId) {
    const alreadyAcknowledged = this.acknowledgedBy.some(
        ack => ack.user.toString() === userId.toString()
    );

    if (!alreadyAcknowledged) {
        this.acknowledgedBy.push({ user: userId });
        return this.save();
    }

    return Promise.resolve(this);
};

// Static method to get active alerts for location
weatherAlertSchema.statics.getActiveAlertsForLocation = function(latitude, longitude) {
    return this.find({
        $or: [
            {
                expiresAt: { $gt: new Date() },
                affectedAreas: {
                    $geoIntersects: {
                        $geometry: {
                            type: 'Point',
                            coordinates: [parseFloat(longitude), parseFloat(latitude)]
                        }
                    }
                }
            },
            {
                expiresAt: { $gt: new Date() },
                isGlobal: true
            }
        ]
    }).sort({ severity: -1, createdAt: -1 });
};

// Static method to get alerts by severity
weatherAlertSchema.statics.getAlertsBySeverity = function(severity, limit = 20) {
    return this.find({
        severity: severity,
        expiresAt: { $gt: new Date() },
        isActive: true
    })
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Static method to create automatic alerts
weatherAlertSchema.statics.createAutomaticAlert = function(weatherData) {
    const alerts = [];

    // Temperature alerts
    if (weatherData.temperature > 40) {
        alerts.push({
            title: 'Extreme Heat Warning',
            description: `Temperature of ${weatherData.temperature}°C poses risk to crops and livestock.`,
            severity: 'high',
            type: 'temperature',
            affectedAreas: {
                type: 'Point',
                coordinates: [weatherData.longitude, weatherData.latitude]
            },
            recommendations: [
                'Provide shade for livestock and crops',
                'Increase water availability',
                'Avoid working during peak heat hours',
                'Monitor heat-sensitive crops closely'
            ],
            affectedCrops: ['tomatoes', 'peppers', 'lettuce', 'spinach'],
            expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000) // 6 hours
        });
    }

    // Wind alerts
    if (weatherData.windSpeed > 15) {
        alerts.push({
            title: 'Strong Wind Advisory',
            description: `Wind speeds of ${weatherData.windSpeed} m/s may cause crop damage.`,
            severity: 'medium',
            type: 'wind',
            affectedAreas: {
                type: 'Point',
                coordinates: [weatherData.longitude, weatherData.latitude]
            },
            recommendations: [
                'Secure tall crops and structures',
                'Harvest ripe fruits to prevent wind damage',
                'Check greenhouse and tunnel integrity',
                'Avoid spraying operations'
            ],
            affectedCrops: ['corn', 'sunflowers', 'tomatoes', 'fruit trees'],
            expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000) // 12 hours
        });
    }

    // Save alerts
    return Promise.all(
        alerts.map(alert => this.create({
            ...alert,
            createdBy: null, // System generated
            metadata: {
                source: 'automatic',
                confidence: 0.8,
                externalId: weatherData._id
            }
        }))
    );
};

module.exports = mongoose.model('WeatherAlert', weatherAlertSchema);