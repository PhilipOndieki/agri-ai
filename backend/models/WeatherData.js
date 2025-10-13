// Weather Data Model
const mongoose = require('mongoose');

const weatherDataSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    latitude: {
        type: Number,
        required: true,
        min: -90,
        max: 90
    },
    longitude: {
        type: Number,
        required: true,
        min: -180,
        max: 180
    },
    location: String,
    temperature: {
        type: Number,
        required: true
    },
    feelsLike: Number,
    humidity: {
        type: Number,
        min: 0,
        max: 100
    },
    pressure: Number,
    windSpeed: Number,
    windDirection: Number,
    visibility: Number,
    uvIndex: Number,
    conditions: {
        type: String,
        required: true
    },
    description: String,
    icon: String,
    sunrise: Date,
    sunset: Date,
    precipitation: {
        rain: Number,
        snow: Number
    },
    clouds: {
        all: Number
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    source: {
        type: String,
        enum: ['api', 'cache', 'manual'],
        default: 'api'
    }
}, {
    timestamps: true
});

// Index for efficient querying
weatherDataSchema.index({ latitude: 1, longitude: 1, timestamp: -1 });
weatherDataSchema.index({ user: 1, timestamp: -1 });
weatherDataSchema.index({ timestamp: 1 });

// Static method to get latest weather for location
weatherDataSchema.statics.getLatestForLocation = function(latitude, longitude) {
    return this.findOne({
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude)
    }).sort({ timestamp: -1 });
};

// Static method to get weather history
weatherDataSchema.statics.getHistory = function(latitude, longitude, startDate, endDate) {
    return this.find({
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        timestamp: { $gte: startDate, $lte: endDate }
    }).sort({ timestamp: 1 });
};

// Static method to get daily averages
weatherDataSchema.statics.getDailyAverages = function(latitude, longitude, days = 7) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days);

    return this.aggregate([
        {
            $match: {
                latitude: parseFloat(latitude),
                longitude: parseFloat(longitude),
                timestamp: { $gte: startDate, $lte: endDate }
            }
        },
        {
            $group: {
                _id: {
                    year: { $year: '$timestamp' },
                    month: { $month: '$timestamp' },
                    day: { $dayOfMonth: '$timestamp' }
                },
                avgTemperature: { $avg: '$temperature' },
                avgHumidity: { $avg: '$humidity' },
                avgPressure: { $avg: '$pressure' },
                avgWindSpeed: { $avg: '$windSpeed' },
                minTemperature: { $min: '$temperature' },
                maxTemperature: { $max: '$temperature' },
                conditions: { $addToSet: '$conditions' }
            }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);
};

module.exports = mongoose.model('WeatherData', weatherDataSchema);