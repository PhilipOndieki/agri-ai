// Input Validation Middleware
const Joi = require('joi');

// Validation schemas
const schemas = {
    // User authentication
    register: Joi.object({
        name: Joi.string().min(2).max(100).required(),
        email: Joi.string().email().required(),
        password: Joi.string().min(6).required(),
        phone: Joi.string().pattern(/^\+?[\d\s-()]+$/).optional(),
        location: Joi.object({
            coordinates: Joi.array().items(Joi.number()).length(2).optional(),
            address: Joi.string().optional()
        }).optional()
    }),

    login: Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().required()
    }),

    updateProfile: Joi.object({
        name: Joi.string().min(2).max(100).optional(),
        phone: Joi.string().pattern(/^\+?[\d\s-()]+$/).optional(),
        location: Joi.object({
            coordinates: Joi.array().items(Joi.number()).length(2).optional(),
            address: Joi.string().optional()
        }).optional(),
        profile: Joi.object({
            farmSize: Joi.string().optional(),
            crops: Joi.array().items(Joi.string()).optional(),
            experience: Joi.number().min(0).optional(),
            language: Joi.string().length(2).optional()
        }).optional()
    }),

    // Community posts
    createPost: Joi.object({
        title: Joi.string().min(1).max(200).required(),
        body: Joi.string().min(1).max(2000).required(),
        category: Joi.string().valid(
            'general', 'pest_alert', 'disease_warning', 
            'weather_update', 'market_info', 'crop_advice', 
            'success_story', 'question'
        ).default('general'),
        tags: Joi.array().items(Joi.string()).optional(),
        priority: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium'),
        targetAudience: Joi.string().valid('all', 'local', 'regional', 'national').default('local'),
        location: Joi.object({
            latitude: Joi.number().min(-90).max(90).optional(),
            longitude: Joi.number().min(-180).max(180).optional(),
            address: Joi.string().optional()
        }).optional()
    }),

    updatePost: Joi.object({
        title: Joi.string().min(1).max(200).optional(),
        body: Joi.string().min(1).max(2000).optional(),
        category: Joi.string().valid(
            'general', 'pest_alert', 'disease_warning', 
            'weather_update', 'market_info', 'crop_advice', 
            'success_story', 'question'
        ).optional(),
        tags: Joi.array().items(Joi.string()).optional(),
        priority: Joi.string().valid('low', 'medium', 'high', 'urgent').optional(),
        targetAudience: Joi.string().valid('all', 'local', 'regional', 'national').optional()
    }),

    // Chatbot
    chatMessage: Joi.object({
        message: Joi.string().min(1).max(1000).required(),
        sessionId: Joi.string().optional(),
        language: Joi.string().length(2).default('en')
    }),

    // Weather
    weatherLocation: Joi.object({
        latitude: Joi.number().min(-90).max(90).required(),
        longitude: Joi.number().min(-180).max(180).required(),
        location: Joi.string().optional()
    }),

    // Notifications
    createNotification: Joi.object({
        title: Joi.string().min(1).max(200).required(),
        message: Joi.string().min(1).max(500).required(),
        type: Joi.string().valid(
            'general', 'weather', 'community', 'alert', 
            'reminder', 'achievement', 'system'
        ).default('general'),
        priority: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium'),
        data: Joi.object().optional(),
        expiresAt: Joi.date().optional()
    }),

    // Password reset
    forgotPassword: Joi.object({
        email: Joi.string().email().required()
    }),

    resetPassword: Joi.object({
        password: Joi.string().min(6).required()
    })
};

// Validation middleware generator
const validate = (schema) => {
    return (req, res, next) => {
        const { error, value } = schemas[schema].validate(req.body);
        
        if (error) {
            const errorMessage = error.details.map(detail => detail.message).join(', ');
            return res.status(400).json({
                success: false,
                message: errorMessage
            });
        }
        
        // Replace req.body with validated data
        req.body = value;
        next();
    };
};

// Query validation middleware
const validateQuery = (schema) => {
    return (req, res, next) => {
        const { error, value } = schemas[schema].validate(req.query);
        
        if (error) {
            const errorMessage = error.details.map(detail => detail.message).join(', ');
            return res.status(400).json({
                success: false,
                message: errorMessage
            });
        }
        
        req.query = value;
        next();
    };
};

// Params validation middleware
const validateParams = (schema) => {
    return (req, res, next) => {
        const { error, value } = schemas[schema].validate(req.params);
        
        if (error) {
            const errorMessage = error.details.map(detail => detail.message).join(', ');
            return res.status(400).json({
                success: false,
                message: errorMessage
            });
        }
        
        req.params = value;
        next();
    };
};

module.exports = {
    validate,
    validateQuery,
    validateParams,
    schemas
};