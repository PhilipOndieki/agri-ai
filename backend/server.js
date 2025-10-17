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
    'https://agri-ai33.netlify.app', // Replace with your actual Netlify URL
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

// API Documentation endpoint
app.get('/api/docs', (req, res) => {
    res.json({
        title: 'AgriAI API Documentation',
        version: '1.0.0',
        description: 'Smart Agriculture Platform with AI-powered crop disease detection, weather forecasting, and farming community features',
        repository: 'https://github.com/PhilipOndieki/agri-ai.git',
        baseUrl: `${req.protocol}://${req.get('host')}/api`,
        endpoints: {
            authentication: {
                register: {
                    method: 'POST',
                    path: '/auth/register',
                    description: 'Register a new user',
                    body: {
                        name: 'string (required)',
                        email: 'string (required)',
                        password: 'string (required)',
                        phone: 'string (optional)',
                        location: 'string (optional)'
                    }
                },
                login: {
                    method: 'POST',
                    path: '/auth/login',
                    description: 'Login user',
                    body: {
                        email: 'string (required)',
                        password: 'string (required)'
                    }
                },
                profile: {
                    method: 'GET',
                    path: '/auth/profile',
                    description: 'Get user profile',
                    auth: 'Bearer Token Required'
                }
            },
            images: {
                upload: {
                    method: 'POST',
                    path: '/images/upload',
                    description: 'Upload crop image for analysis',
                    auth: 'Bearer Token Required',
                    contentType: 'multipart/form-data',
                    body: {
                        image: 'file (required)',
                        cropType: 'string (optional)'
                    }
                },
                list: {
                    method: 'GET',
                    path: '/images',
                    description: 'Get user uploaded images',
                    auth: 'Bearer Token Required'
                },
                delete: {
                    method: 'DELETE',
                    path: '/images/:id',
                    description: 'Delete an image',
                    auth: 'Bearer Token Required'
                }
            },
            ai: {
                analyze: {
                    method: 'POST',
                    path: '/ai/analyze',
                    description: 'Analyze crop disease from image',
                    auth: 'Bearer Token Required',
                    body: {
                        imageUrl: 'string (required)',
                        cropType: 'string (optional)'
                    }
                },
                recommendations: {
                    method: 'POST',
                    path: '/ai/recommendations',
                    description: 'Get farming recommendations',
                    auth: 'Bearer Token Required',
                    body: {
                        cropType: 'string (required)',
                        location: 'string (optional)',
                        season: 'string (optional)'
                    }
                }
            },
            chatbot: {
                query: {
                    method: 'POST',
                    path: '/chatbot/query',
                    description: 'Ask farming-related questions',
                    auth: 'Bearer Token Required',
                    body: {
                        message: 'string (required)',
                        context: 'object (optional)'
                    }
                },
                history: {
                    method: 'GET',
                    path: '/chatbot/history',
                    description: 'Get chat history',
                    auth: 'Bearer Token Required'
                }
            },
            weather: {
                current: {
                    method: 'GET',
                    path: '/weather/current',
                    description: 'Get current weather for location',
                    auth: 'Bearer Token Required',
                    query: {
                        location: 'string (required)'
                    }
                },
                forecast: {
                    method: 'GET',
                    path: '/weather/forecast',
                    description: 'Get weather forecast',
                    auth: 'Bearer Token Required',
                    query: {
                        location: 'string (required)',
                        days: 'number (optional, default: 7)'
                    }
                }
            },
            community: {
                posts: {
                    create: {
                        method: 'POST',
                        path: '/community/posts',
                        description: 'Create a community post',
                        auth: 'Bearer Token Required'
                    },
                    list: {
                        method: 'GET',
                        path: '/community/posts',
                        description: 'Get community posts',
                        auth: 'Bearer Token Required'
                    },
                    like: {
                        method: 'POST',
                        path: '/community/posts/:id/like',
                        description: 'Like a post',
                        auth: 'Bearer Token Required'
                    },
                    comment: {
                        method: 'POST',
                        path: '/community/posts/:id/comment',
                        description: 'Comment on a post',
                        auth: 'Bearer Token Required'
                    }
                }
            },
            notifications: {
                list: {
                    method: 'GET',
                    path: '/notifications',
                    description: 'Get user notifications',
                    auth: 'Bearer Token Required'
                },
                markRead: {
                    method: 'PUT',
                    path: '/notifications/:id/read',
                    description: 'Mark notification as read',
                    auth: 'Bearer Token Required'
                }
            }
        },
        authentication: {
            type: 'Bearer Token',
            header: 'Authorization: Bearer <token>',
            description: 'Include the JWT token received from login in the Authorization header'
        },
        errorCodes: {
            200: 'Success',
            201: 'Created',
            400: 'Bad Request',
            401: 'Unauthorized',
            403: 'Forbidden',
            404: 'Not Found',
            429: 'Too Many Requests',
            500: 'Internal Server Error'
        },
        contact: {
            github: 'https://github.com/PhilipOndieki/agri-ai',
            issues: 'https://github.com/PhilipOndieki/agri-ai/issues'
        }
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
        repository: 'https://github.com/PhilipOndieki/agri-ai.git'
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