// AgriAI Backend Server - Main Entry Point
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');

// Load environment variables FIRST
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const imageRoutes = require('./routes/images');
const aiRoutes = require('./routes/ai');
const chatbotRoutes = require('./routes/chatbot');
const weatherRoutes = require('./routes/weather');
const communityRoutes = require('./routes/community');
const notificationRoutes = require('./routes/notifications');

// Import middleware
const { auth } = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');

// Import database connection
const connectDB = require('./config/database');

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to database
connectDB();

// Trust proxy - important for Render/Heroku
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// CORS configuration - Updated for production
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    process.env.FRONTEND_URL,
    'https://agri-ai33.netlify.app/', // Replace with your actual Netlify URL
].filter(Boolean); // Remove undefined values

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);
        
        // Check if origin is in whitelist
        if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 600 // Cache preflight requests for 10 minutes
}));

// Handle preflight requests
app.options('*', cors());

// Rate limiting - More restrictive in production
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'production' ? 100 : 1000,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression
app.use(compression());

// Logging - Different formats for dev/prod
if (process.env.NODE_ENV === 'production') {
    app.use(morgan('combined'));
} else {
    app.use(morgan('dev'));
}

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('📁 Created uploads directory');
}

// Static file serving
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint (public - no auth required)
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        uptime: process.uptime(),
        mongodb: require('mongoose').connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'AgriAI Backend API',
        version: '1.0.0',
        status: 'active',
        endpoints: {
            health: '/api/health',
            auth: '/api/auth',
            images: '/api/images',
            ai: '/api/ai',
            chatbot: '/api/chatbot',
            weather: '/api/weather',
            community: '/api/community',
            notifications: '/api/notifications'
        },
        documentation: '/api/docs',
        repository: 'https://github.com/yourusername/agriai-backend'
    });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/images', auth, imageRoutes);
app.use('/api/ai', auth, aiRoutes);
app.use('/api/chatbot', auth, chatbotRoutes);
app.use('/api/weather', auth, weatherRoutes);
app.use('/api/community', auth, communityRoutes);
app.use('/api/notifications', auth, notificationRoutes);

// 404 handler for undefined routes
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found',
        path: req.originalUrl
    });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('👋 SIGTERM received, closing server gracefully...');
    server.close(() => {
        console.log('✅ Server closed');
        require('mongoose').connection.close(false, () => {
            console.log('✅ MongoDB connection closed');
            process.exit(0);
        });
    });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('═══════════════════════════════════════');
    console.log('🌾 AgriAI Backend Server');
    console.log('═══════════════════════════════════════');
    console.log(`📡 Port: ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔧 Health: http://localhost:${PORT}/api/health`);
    console.log(`📚 Docs: http://localhost:${PORT}/api/docs`);
    console.log('═══════════════════════════════════════');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('❌ Unhandled Promise Rejection:', err);
    // Close server & exit process
    server.close(() => process.exit(1));
});

module.exports = app;