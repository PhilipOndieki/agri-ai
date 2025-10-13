// Authentication Middleware
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const auth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: 'Access denied. No token provided.' 
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        const user = await User.findById(decoded.id).select('-password');
        
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid token. User not found.' 
            });
        }

        if (!user.isActive) {
            return res.status(401).json({ 
                success: false, 
                message: 'Account is deactivated. Please contact support.' 
            });
        }

        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid token.' 
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                success: false, 
                message: 'Token expired.' 
            });
        }
        
        console.error('Auth middleware error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error.' 
        });
    }
};

// Optional authentication - doesn't require token but loads user if available
const optionalAuth = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
            const user = await User.findById(decoded.id).select('-password');
            
            if (user && user.isActive) {
                req.user = user;
            }
        }
        
        next();
    } catch (error) {
        // Ignore errors for optional auth
        next();
    }
};

// Role-based authorization
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Authentication required.' 
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ 
                success: false, 
                message: 'Access denied. Insufficient permissions.' 
            });
        }

        next();
    };
};

// Subscription-based authorization
const requireSubscription = (requiredLevel = 'free') => {
    const subscriptionLevels = {
        'free': 0,
        'premium': 1,
        'enterprise': 2
    };

    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Authentication required.' 
            });
        }

        const userLevel = req.user.subscription.type;
        const userLevelValue = subscriptionLevels[userLevel] || 0;
        const requiredLevelValue = subscriptionLevels[requiredLevel] || 0;

        if (userLevelValue < requiredLevelValue) {
            return res.status(403).json({ 
                success: false, 
                message: `This feature requires a ${requiredLevel} subscription.` 
            });
        }

        if (!req.user.isSubscriptionActive()) {
            return res.status(403).json({ 
                success: false, 
                message: 'Subscription is not active. Please renew your subscription.' 
            });
        }

        next();
    };
};

module.exports = {
    auth,
    optionalAuth,
    authorize,
    requireSubscription
};