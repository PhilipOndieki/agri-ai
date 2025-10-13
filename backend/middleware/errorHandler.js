// Error Handler Middleware
const errorHandler = (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message;

    console.error('Error Stack:', err.stack);

    // Mongoose bad ObjectId
    if (err.name === 'CastError') {
        const message = 'Resource not found';
        error = {
            message,
            statusCode: 404,
            success: false
        };
    }

    // Mongoose duplicate key
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue)[0];
        const message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`;
        error = {
            message,
            statusCode: 400,
            success: false
        };
    }

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const message = Object.values(err.errors).map(val => val.message).join(', ');
        error = {
            message,
            statusCode: 400,
            success: false
        };
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        const message = 'Invalid token';
        error = {
            message,
            statusCode: 401,
            success: false
        };
    }

    if (err.name === 'TokenExpiredError') {
        const message = 'Token expired';
        error = {
            message,
            statusCode: 401,
            success: false
        };
    }

    // Multer errors
    if (err.name === 'MulterError') {
        let message = 'File upload error';
        if (err.code === 'LIMIT_FILE_SIZE') {
            message = 'File too large';
        } else if (err.code === 'LIMIT_FILE_COUNT') {
            message = 'Too many files';
        } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            message = 'Unexpected file field';
        }
        
        error = {
            message,
            statusCode: 400,
            success: false
        };
    }

    // Default to 500 server error
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal Server Error';

    res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

module.exports = errorHandler;