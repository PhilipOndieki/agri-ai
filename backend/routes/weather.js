// Weather API Routes
const express = require('express');
const axios = require('axios');
const WeatherData = require('../models/WeatherData');
const WeatherAlert = require('../models/WeatherAlert');
const { auth } = require('../middleware/auth');

const router = express.Router();

// OpenWeatherMap API configuration
const WEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
const WEATHER_BASE_URL = 'https://api.openweathermap.org/data/2.5';
const GEOCODE_BASE_URL = 'http://api.openweathermap.org/geo/1.0';

// @route   GET /api/weather/current
// @desc    Get current weather conditions
// @access  Private
router.get('/current', auth, async (req, res, next) => {
    try {
        const { latitude, longitude, location } = req.query;

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: 'Latitude and longitude are required'
            });
        }

        // Check if we have recent cached data
        const cacheExpiry = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes
        const cachedWeather = await WeatherData.findOne({
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            timestamp: { $gte: cacheExpiry }
        }).sort({ timestamp: -1 });

        if (cachedWeather) {
            return res.json({
                success: true,
                data: {
                    weather: cachedWeather,
                    source: 'cache'
                }
            });
        }

        // Fetch from OpenWeatherMap API
        const response = await axios.get(`${WEATHER_BASE_URL}/weather`, {
            params: {
                lat: latitude,
                lon: longitude,
                appid: WEATHER_API_KEY,
                units: 'metric'
            }
        });

        const weatherData = response.data;

        // Save to database
        const weatherRecord = await WeatherData.create({
            user: req.user._id,
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            location: location || `${weatherData.name}, ${weatherData.sys.country}`,
            temperature: weatherData.main.temp,
            feelsLike: weatherData.main.feels_like,
            humidity: weatherData.main.humidity,
            pressure: weatherData.main.pressure,
            windSpeed: weatherData.wind.speed,
            windDirection: weatherData.wind.deg,
            visibility: weatherData.visibility,
            uvIndex: weatherData.uvi || null,
            conditions: weatherData.weather[0].main,
            description: weatherData.weather[0].description,
            icon: weatherData.weather[0].icon,
            sunrise: new Date(weatherData.sys.sunrise * 1000),
            sunset: new Date(weatherData.sys.sunset * 1000),
            timestamp: new Date()
        });

        res.json({
            success: true,
            data: {
                weather: weatherRecord,
                source: 'api'
            }
        });

    } catch (error) {
        if (error.response && error.response.status === 401) {
            return res.status(500).json({
                success: false,
                message: 'Weather service temporarily unavailable'
            });
        }
        next(error);
    }
});

// @route   GET /api/weather/forecast
// @desc    Get weather forecast
// @access  Private
router.get('/forecast', auth, async (req, res, next) => {
    try {
        const { latitude, longitude, days = 5 } = req.query;

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: 'Latitude and longitude are required'
            });
        }

        const response = await axios.get(`${WEATHER_BASE_URL}/forecast`, {
            params: {
                lat: latitude,
                lon: longitude,
                appid: WEATHER_API_KEY,
                units: 'metric',
                cnt: parseInt(days) * 8 // 8 forecasts per day (3-hour intervals)
            }
        });

        const forecastData = response.data.list.map(item => ({
            timestamp: new Date(item.dt * 1000),
            temperature: item.main.temp,
            feelsLike: item.main.feels_like,
            humidity: item.main.humidity,
            pressure: item.main.pressure,
            windSpeed: item.wind.speed,
            windDirection: item.wind.deg,
            conditions: item.weather[0].main,
            description: item.weather[0].description,
            icon: item.weather[0].icon,
            precipitation: item.rain ? item.rain['3h'] || 0 : 0,
            probability: item.pop || 0
        }));

        // Group by days
        const dailyForecast = {};
        forecastData.forEach(item => {
            const date = item.timestamp.toDateString();
            if (!dailyForecast[date]) {
                dailyForecast[date] = {
                    date: item.timestamp,
                    items: []
                };
            }
            dailyForecast[date].items.push(item);
        });

        // Calculate daily summaries
        const dailySummaries = Object.values(dailyForecast).map(day => {
            const temps = day.items.map(item => item.temperature);
            return {
                date: day.date,
                minTemp: Math.min(...temps),
                maxTemp: Math.max(...temps),
                avgTemp: temps.reduce((a, b) => a + b, 0) / temps.length,
                humidity: day.items[0].humidity, // Use first reading of the day
                conditions: day.items[0].conditions,
                description: day.items[0].description,
                icon: day.items[0].icon,
                precipitation: day.items.reduce((sum, item) => sum + item.precipitation, 0),
                hourly: day.items
            };
        });

        res.json({
            success: true,
            data: {
                location: response.data.city.name,
                forecast: dailySummaries
            }
        });

    } catch (error) {
        next(error);
    }
});

// @route   GET /api/weather/alerts
// @desc    Get weather alerts for location
// @access  Private
router.get('/alerts', auth, async (req, res, next) => {
    try {
        const { latitude, longitude } = req.query;

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: 'Latitude and longitude are required'
            });
        }

        // Get existing alerts from database
        const activeAlerts = await WeatherAlert.find({
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

        // Generate agricultural weather alerts
        const agriculturalAlerts = generateAgriculturalAlerts(latitude, longitude);

        res.json({
            success: true,
            data: {
                weatherAlerts: activeAlerts,
                agriculturalAlerts: agriculturalAlerts
            }
        });

    } catch (error) {
        next(error);
    }
});

// Generate agricultural weather alerts
const generateAgriculturalAlerts = (latitude, longitude) => {
    const alerts = [];
    const now = new Date();

    // Temperature alerts
    alerts.push({
        type: 'temperature',
        severity: 'medium',
        title: 'Temperature Monitoring',
        description: 'Monitor crop temperature stress. Consider shade nets for sensitive crops during peak heat hours.',
        recommendations: [
            'Increase watering frequency during hot periods',
            'Use mulch to retain soil moisture',
            'Provide shade for heat-sensitive crops'
        ],
        affectedCrops: ['tomatoes', 'peppers', 'lettuce', 'spinach'],
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) // 24 hours
    });

    // Wind alerts
    alerts.push({
        type: 'wind',
        severity: 'low',
        title: 'Wind Advisory',
        description: 'Moderate winds expected. Secure tall plants and lightweight materials.',
        recommendations: [
            'Stake tall plants properly',
            'Secure greenhouse covers',
            'Harvest ripe fruits to prevent wind damage'
        ],
        affectedCrops: ['corn', 'sunflowers', 'tomatoes'],
        expiresAt: new Date(now.getTime() + 12 * 60 * 60 * 1000) // 12 hours
    });

    // Humidity alerts
    alerts.push({
        type: 'humidity',
        severity: 'medium',
        title: 'Humidity Levels',
        description: 'High humidity may increase fungal disease risk. Ensure proper air circulation.',
        recommendations: [
            'Increase spacing between plants',
            'Water at soil level, not on leaves',
            'Apply preventive fungicide if needed'
        ],
        affectedCrops: ['cucumbers', 'squash', 'beans'],
        expiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1000) // 48 hours
    });

    return alerts;
};

// @route   POST /api/weather/alerts
// @desc    Create weather alert
// @access  Private (Admin only)
router.post('/alerts', auth, async (req, res, next) => {
    try {
        // Note: In a real implementation, you'd check for admin role
        const {
            title,
            description,
            severity,
            type,
            affectedAreas,
            recommendations,
            affectedCrops,
            expiresAt
        } = req.body;

        const alert = await WeatherAlert.create({
            title,
            description,
            severity,
            type,
            affectedAreas,
            recommendations,
            affectedCrops,
            expiresAt: expiresAt ? new Date(expiresAt) : new Date(Date.now() + 24 * 60 * 60 * 1000),
            createdBy: req.user._id
        });

        res.status(201).json({
            success: true,
            message: 'Weather alert created successfully',
            data: { alert }
        });

    } catch (error) {
        next(error);
    }
});

// @route   GET /api/weather/history
// @desc    Get historical weather data
// @access  Private
router.get('/history', auth, async (req, res, next) => {
    try {
        const { latitude, longitude, days = 30 } = req.query;

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: 'Latitude and longitude are required'
            });
        }

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        const historicalData = await WeatherData.find({
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            timestamp: { $gte: startDate }
        })
        .sort({ timestamp: 1 })
        .select('timestamp temperature humidity pressure windSpeed conditions');

        // Calculate statistics
        const temperatures = historicalData.map(d => d.temperature);
        const humidity = historicalData.map(d => d.humidity);

        const stats = {
            temperature: {
                min: Math.min(...temperatures),
                max: Math.max(...temperatures),
                avg: temperatures.reduce((a, b) => a + b, 0) / temperatures.length,
                trend: calculateTrend(temperatures)
            },
            humidity: {
                min: Math.min(...humidity),
                max: Math.max(...humidity),
                avg: humidity.reduce((a, b) => a + b, 0) / humidity.length,
                trend: calculateTrend(humidity)
            },
            totalRecords: historicalData.length
        };

        res.json({
            success: true,
            data: {
                historicalData,
                statistics: stats
            }
        });

    } catch (error) {
        next(error);
    }
});

// Calculate trend in data
const calculateTrend = (data) => {
    if (data.length < 2) return 'stable';
    
    const firstHalf = data.slice(0, Math.floor(data.length / 2));
    const secondHalf = data.slice(Math.floor(data.length / 2));
    
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    
    const change = ((secondAvg - firstAvg) / firstAvg) * 100;
    
    if (change > 5) return 'increasing';
    if (change < -5) return 'decreasing';
    return 'stable';
};

// @route   GET /api/weather/agricultural-insights
// @desc    Get agricultural weather insights
// @access  Private
router.get('/agricultural-insights', auth, async (req, res, next) => {
    try {
        const { latitude, longitude } = req.query;

        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: 'Latitude and longitude are required'
            });
        }

        // Get current weather
        const currentWeather = await WeatherData.findOne({
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude)
        }).sort({ timestamp: -1 });

        if (!currentWeather) {
            return res.status(404).json({
                success: false,
                message: 'Weather data not found'
            });
        }

        // Generate agricultural insights
        const insights = generateAgriculturalInsights(currentWeather);

        res.json({
            success: true,
            data: { insights }
        });

    } catch (error) {
        next(error);
    }
});

// Generate agricultural insights based on weather conditions
const generateAgriculturalInsights = (weather) => {
    const insights = [];

    // Temperature insights
    if (weather.temperature > 35) {
        insights.push({
            type: 'temperature',
            level: 'high',
            title: 'High Temperature Alert',
            description: `Current temperature of ${weather.temperature}°C is high for many crops.`,
            recommendations: [
                'Increase watering frequency during hot periods',
                'Provide shade for heat-sensitive crops',
                'Mulch around plants to retain soil moisture',
                'Harvest ripe fruits to prevent heat damage'
            ],
            affectedCrops: ['tomatoes', 'peppers', 'lettuce', 'spinach', 'cabbage']
        });
    } else if (weather.temperature < 5) {
        insights.push({
            type: 'temperature',
            level: 'low',
            title: 'Low Temperature Alert',
            description: `Current temperature of ${weather.temperature}°C may affect crop growth.`,
            recommendations: [
                'Protect sensitive crops with row covers',
                'Water plants before freeze to protect roots',
                'Harvest frost-sensitive crops before cold snap',
                'Use cold frames or greenhouses for protection'
            ],
            affectedCrops: ['tomatoes', 'peppers', 'beans', 'squash']
        });
    }

    // Humidity insights
    if (weather.humidity > 80) {
        insights.push({
            type: 'humidity',
            level: 'high',
            title: 'High Humidity Conditions',
            description: `Humidity at ${weather.humidity}% increases disease risk.`,
            recommendations: [
                'Improve air circulation around plants',
                'Avoid overhead watering',
                'Apply preventive fungicide treatments',
                'Remove infected plant material promptly'
            ],
            affectedCrops: ['cucumbers', 'tomatoes', 'beans', 'leafy greens']
        });
    } else if (weather.humidity < 30) {
        insights.push({
            type: 'humidity',
            level: 'low',
            title: 'Low Humidity Conditions',
            description: `Low humidity (${weather.humidity}%) may stress plants.`,
            recommendations: [
                'Increase watering frequency',
                'Use mulch to retain soil moisture',
                'Group plants to create humidity microclimate',
                'Avoid watering during hot, windy periods'
            ],
            affectedCrops: ['all crops', 'especially leafy greens']
        });
    }

    // Wind insights
    if (weather.windSpeed > 10) {
        insights.push({
            type: 'wind',
            level: 'medium',
            title: 'Windy Conditions',
            description: `Wind speed of ${weather.windSpeed} m/s may cause damage.`,
            recommendations: [
                'Stake tall plants securely',
                'Secure greenhouse covers and materials',
                'Harvest ripe fruits to prevent wind damage',
                'Provide windbreaks for sensitive crops'
            ],
            affectedCrops: ['tall crops', 'corn', 'sunflowers', 'tomatoes']
        });
    }

    return insights;
};

module.exports = router;