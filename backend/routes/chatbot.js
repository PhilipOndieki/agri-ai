// Chatbot Routes with Google Gemini Integration
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const ChatSession = require('../models/ChatSession');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Initialize Google Gemini client
let genAI = null;
if (process.env.GOOGLE_GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY);
}

// Agricultural knowledge base for fallback responses
const AGRICULTURAL_KNOWLEDGE = {
    'soil_health': {
        keywords: ['soil', 'fertilizer', 'nutrients', 'ph', 'compost', 'manure'],
        responses: [
            'Healthy soil should have a pH between 6.0-7.0 for most crops. Test your soil annually and add organic matter regularly.',
            'For nutrient deficiencies, consider balanced NPK fertilizers. Nitrogen for leaf growth, Phosphorus for roots, Potassium for overall health.',
            'Compost improves soil structure, water retention, and microbial activity. Apply 2-4 inches of compost annually.',
            'Crop rotation helps maintain soil health and reduces pest buildup. Rotate between different plant families each season.'
        ]
    },
    'pest_control': {
        keywords: ['pest', 'insect', 'bug', 'worm', 'disease', 'fungus', 'bacteria'],
        responses: [
            'Integrated Pest Management (IPM) combines cultural, biological, and chemical controls. Start with prevention and monitoring.',
            'Beneficial insects like ladybugs, lacewings, and parasitic wasps help control pests naturally. Plant flowers to attract them.',
            'For fungal diseases, ensure proper air circulation, avoid overhead watering, and apply copper-based fungicides if needed.',
            'Neem oil is effective against many pests and diseases. Mix 2 tablespoons per gallon of water and spray weekly.'
        ]
    },
    'water_management': {
        keywords: ['water', 'irrigation', 'drainage', 'moisture', 'drought', 'flood'],
        responses: [
            'Water deeply but infrequently to encourage deep root growth. Most crops need 1-2 inches of water per week.',
            'Drip irrigation saves water and reduces disease risk by keeping foliage dry. Install during dry periods.',
            'Mulching conserves moisture, suppresses weeds, and regulates soil temperature. Apply 2-4 inches around plants.',
            'Good drainage is crucial. Raised beds or contour planting can help prevent waterlogging in heavy soils.'
        ]
    },
    'crop_selection': {
        keywords: ['crop', 'plant', 'variety', 'seed', 'sowing', 'planting', 'harvest'],
        responses: [
            'Choose crop varieties suited to your climate, soil type, and market demand. Check local growing calendars.',
            'Heirloom varieties offer unique flavors and genetic diversity, while hybrids provide uniformity and disease resistance.',
            'Direct seeding works for crops like beans, carrots, and lettuce. Transplants give a head start for tomatoes and peppers.',
            'Succession planting every 2-3 weeks ensures continuous harvest of crops like lettuce, radishes, and beans.'
        ]
    },
    'weather_climate': {
        keywords: ['weather', 'climate', 'season', 'temperature', 'rain', 'frost'],
        responses: [
            'Monitor weather forecasts regularly. Prepare for extreme conditions with protective covers or irrigation.',
            'Frost-sensitive crops need protection when temperatures drop below 32°F (0°C). Use row covers or cold frames.',
            'High temperatures above 90°F (32°C) can stress plants. Provide shade and increase watering frequency.',
            'Season extension techniques like greenhouses, cold frames, and row covers allow year-round production.'
        ]
    }
};

// Function to get fallback response based on user query
const getFallbackResponse = (query) => {
    const lowerQuery = query.toLowerCase();
    
    for (const [category, data] of Object.entries(AGRICULTURAL_KNOWLEDGE)) {
        const match = data.keywords.some(keyword => lowerQuery.includes(keyword));
        if (match) {
            const responses = data.responses;
            return responses[Math.floor(Math.random() * responses.length)];
        }
    }
    
    // Default fallback response
    return "I'm here to help with farming questions! You can ask me about soil health, pest control, water management, crop selection, or weather conditions. What would you like to know?";
};

// @route   GET /api/chatbot/test
// @desc    Test chatbot endpoint
// @access  Private
router.get('/test', auth, async (req, res) => {
    res.json({
        success: true,
        message: 'Chatbot route is working!',
        user: req.user._id,
        geminiEnabled: !!genAI,
        timestamp: new Date().toISOString()
    });
});

// @route   POST /api/chatbot/chat
// @desc    Send message to chatbot
// @access  Private
router.post('/chat', auth, async (req, res, next) => {
    try {
        console.log('📨 Received chat request from user:', req.user._id);
        console.log('📝 Request body:', req.body);

        const { message, sessionId, language = 'en' } = req.body;

        if (!message) {
            console.log('❌ No message provided');
            return res.status(400).json({
                success: false,
                message: 'Message is required'
            });
        }

        // Find or create chat session
        let session;
        if (sessionId) {
            console.log('🔍 Looking for session:', sessionId);
            session = await ChatSession.findOne({
                _id: sessionId,
                user: req.user._id
            });
            console.log('📦 Found session:', session ? 'Yes' : 'No');
        }
        
        if (!session) {
            console.log('🆕 Creating new session');
            session = await ChatSession.create({
                user: req.user._id,
                messages: [],
                settings: {
                    language: language
                }
            });
            console.log('✅ New session created:', session._id);
        }

        // Add user message to session
        session.messages.push({
            role: 'user',
            content: message,
            timestamp: new Date()
        });

        let botResponse;
        let responseSource = 'gemini';

        try {
            // Try Google Gemini first
            if (genAI) {
                console.log('🤖 Calling Google Gemini API...');
                
                const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
                
                // Build conversation history
                const history = session.messages.slice(-10).map(msg => ({
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: msg.content }]
                }));

                // Create system prompt
                const systemPrompt = `You are an agricultural expert assistant. Provide helpful, accurate farming advice in ${language}. Be concise but informative (max 200 words). Focus on practical solutions that farmers can implement.`;

                // Start chat with history
                const chat = model.startChat({
                    history: [
                        {
                            role: 'user',
                            parts: [{ text: systemPrompt }]
                        },
                        {
                            role: 'model',
                            parts: [{ text: 'Understood. I will provide practical farming advice.' }]
                        },
                        ...history.slice(0, -1) // Exclude the last message we just added
                    ],
                    generationConfig: {
                        maxOutputTokens: 300,
                        temperature: 0.7,
                    }
                });

                const result = await chat.sendMessage(message);
                const response = await result.response;
                botResponse = response.text();
                console.log('✅ Gemini response received');
            } else {
                console.log('⚠️ No Gemini API key, using fallback');
                // Fallback to local knowledge base
                botResponse = getFallbackResponse(message);
                responseSource = 'local';
            }
        } catch (geminiError) {
            console.error('❌ Gemini error:', geminiError.message);
            // Fallback to local knowledge base
            botResponse = getFallbackResponse(message);
            responseSource = 'local';
        }

        // Add bot response to session
        session.messages.push({
            role: 'assistant',
            content: botResponse,
            timestamp: new Date(),
            metadata: {
                source: responseSource,
                model: responseSource === 'gemini' ? 'gemini-2.0-flash' : 'local-knowledge'
            }
        });

        await session.save();
        console.log('💾 Session saved successfully');

        res.json({
            success: true,
            data: {
                response: botResponse,
                sessionId: session._id,
                messageCount: session.messages.length,
                responseSource
            }
        });

    } catch (error) {
        console.error('❌ Chat error:', error);
        next(error);
    }
});

// @route   POST /api/chatbot/query (Alternative endpoint)
// @desc    Send message to chatbot (alternative route name)
// @access  Private
router.post('/query', auth, async (req, res, next) => {
    // Just redirect to /chat endpoint
    req.url = '/chat';
    return router.handle(req, res, next);
});

// @route   GET /api/chatbot/sessions
// @desc    Get user's chat sessions
// @access  Private
router.get('/sessions', auth, async (req, res, next) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const skip = (page - 1) * limit;

        const sessions = await ChatSession.find({ user: req.user._id })
            .sort({ updatedAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .select('title createdAt updatedAt messageCount');

        const total = await ChatSession.countDocuments({ user: req.user._id });

        res.json({
            success: true,
            data: {
                sessions,
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

// @route   GET /api/chatbot/sessions/:sessionId
// @desc    Get specific chat session
// @access  Private
router.get('/sessions/:sessionId', auth, async (req, res, next) => {
    try {
        const session = await ChatSession.findOne({
            _id: req.params.sessionId,
            user: req.user._id
        });

        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Chat session not found'
            });
        }

        res.json({
            success: true,
            data: { session }
        });

    } catch (error) {
        next(error);
    }
});

// @route   DELETE /api/chatbot/sessions/:sessionId
// @desc    Delete chat session
// @access  Private
router.delete('/sessions/:sessionId', auth, async (req, res, next) => {
    try {
        const session = await ChatSession.findOne({
            _id: req.params.sessionId,
            user: req.user._id
        });

        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Chat session not found'
            });
        }

        await session.deleteOne();

        res.json({
            success: true,
            message: 'Chat session deleted successfully'
        });

    } catch (error) {
        next(error);
    }
});

// @route   PUT /api/chatbot/sessions/:sessionId/title
// @desc    Update chat session title
// @access  Private
router.put('/sessions/:sessionId/title', auth, async (req, res, next) => {
    try {
        const { title } = req.body;

        if (!title) {
            return res.status(400).json({
                success: false,
                message: 'Title is required'
            });
        }

        const session = await ChatSession.findOne({
            _id: req.params.sessionId,
            user: req.user._id
        });

        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Chat session not found'
            });
        }

        session.title = title;
        await session.save();

        res.json({
            success: true,
            message: 'Session title updated successfully'
        });

    } catch (error) {
        next(error);
    }
});

// @route   GET /api/chatbot/quick-responses
// @desc    Get quick response templates
// @access  Private
router.get('/quick-responses', auth, async (req, res, next) => {
    try {
        const responses = [
            {
                category: 'Soil Health',
                questions: [
                    'How can I improve my soil quality?',
                    'What is the ideal pH for vegetables?',
                    'How often should I test my soil?'
                ]
            },
            {
                category: 'Pest Control',
                questions: [
                    'How do I identify common garden pests?',
                    'What are organic pest control methods?',
                    'How can I prevent fungal diseases?'
                ]
            },
            {
                category: 'Water Management',
                questions: [
                    'How much should I water my plants?',
                    'What is the best irrigation method?',
                    'How can I conserve water in farming?'
                ]
            },
            {
                category: 'Crop Selection',
                questions: [
                    'What crops grow best in my area?',
                    'When should I plant vegetables?',
                    'How do I choose the right seeds?'
                ]
            },
            {
                category: 'Weather & Climate',
                questions: [
                    'How does weather affect crop growth?',
                    'What crops are drought resistant?',
                    'How can I protect crops from frost?'
                ]
            }
        ];

        res.json({
            success: true,
            data: { responses }
        });

    } catch (error) {
        next(error);
    }
});

// @route   GET /api/chatbot/analytics
// @desc    Get chatbot usage analytics
// @access  Private
router.get('/analytics', auth, async (req, res, next) => {
    try {
        const { period = '30d' } = req.query;

        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - parseInt(period.replace('d', '')));

        const analytics = await ChatSession.aggregate([
            {
                $match: {
                    user: req.user._id,
                    createdAt: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: null,
                    totalSessions: { $sum: 1 },
                    totalMessages: { $sum: '$messageCount' },
                    averageMessagesPerSession: { $avg: '$messageCount' }
                }
            }
        ]);

        const monthlyAnalytics = await ChatSession.aggregate([
            {
                $match: {
                    user: req.user._id,
                    createdAt: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' }
                    },
                    sessions: { $sum: 1 },
                    messages: { $sum: '$messageCount' }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        res.json({
            success: true,
            data: {
                summary: analytics[0] || {
                    totalSessions: 0,
                    totalMessages: 0,
                    averageMessagesPerSession: 0
                },
                monthly: monthlyAnalytics
            }
        });

    } catch (error) {
        next(error);
    }
});

console.log('✅ Chatbot routes loaded');
console.log('🤖 Google Gemini:', genAI ? 'Enabled' : 'Disabled (using local fallback)');

module.exports = router;