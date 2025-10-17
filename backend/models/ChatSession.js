// Chat Session Model
const mongoose = require('mongoose');

const chatSessionSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        default: 'New Chat',
        trim: true,
        maxlength: [100, 'Title cannot exceed 100 characters']
    },
    messages: [{
        role: {
            type: String,
            enum: ['user', 'assistant', 'system'],
            required: true
        },
        content: {
            type: String,
            required: true,
            maxlength: [2000, 'Message content cannot exceed 2000 characters']
        },
        timestamp: {
            type: Date,
            default: Date.now
        },
        metadata: {
            source: {
                type: String,
                enum: ['gemini', 'local', 'openai', 'other', 'local-knowledge', 'system'],
                default: 'system'
            },
            model: String,
            tokensUsed: Number,
            processingTime: Number
        }
    }],
    settings: {
        language: {
            type: String,
            default: 'en',
            enum: ['en', 'hi', 'es', 'fr', 'ar', 'zh']
        },
        tone: {
            type: String,
            default: 'professional',
            enum: ['professional', 'friendly', 'technical', 'simple']
        },
        context: {
            type: String,
            default: 'general',
            enum: ['general', 'crop-specific', 'soil-focused', 'pest-focused', 'weather-focused']
        }
    },
    status: {
        type: String,
        enum: ['active', 'archived', 'deleted'],
        default: 'active'
    },
    messageCount: {
        type: Number,
        default: 0
    },
    totalTokensUsed: {
        type: Number,
        default: 0
    },
    lastActivity: {
        type: Date,
        default: Date.now
    },
    tags: [String],
    feedback: {
        rating: {
            type: Number,
            min: 1,
            max: 5
        },
        comments: String,
        submittedAt: Date
    }
}, {
    timestamps: true
});

// Indexes for efficient querying
chatSessionSchema.index({ user: 1, updatedAt: -1 });
chatSessionSchema.index({ status: 1 });
chatSessionSchema.index({ tags: 1 });

// Virtual for getting session summary
chatSessionSchema.virtual('summary').get(function() {
    return {
        id: this._id,
        title: this.title,
        messageCount: this.messageCount,
        lastActivity: this.updatedAt,
        status: this.status,
        settings: this.settings
    };
});

// Pre-save middleware to update message count
chatSessionSchema.pre('save', function(next) {
    if (this.isModified('messages')) {
        this.messageCount = this.messages.length;
        this.lastActivity = new Date();
        
        // Auto-generate title if it's the default and we have content
        if (this.title === 'New Chat' && this.messages.length > 0) {
            const firstUserMessage = this.messages.find(m => m.role === 'user');
            if (firstUserMessage) {
                const words = firstUserMessage.content.split(' ').slice(0, 5).join(' ');
                this.title = words.length > 20 ? words.substring(0, 20) + '...' : words;
            }
        }
    }
    next();
});

// Method to add message
chatSessionSchema.methods.addMessage = function(role, content, metadata = {}) {
    this.messages.push({
        role,
        content,
        metadata
    });
    
    return this.save();
};

// Method to get recent messages
chatSessionSchema.methods.getRecentMessages = function(limit = 10) {
    return this.messages.slice(-limit);
};

// Method to search messages
chatSessionSchema.methods.searchMessages = function(searchTerm) {
    return this.messages.filter(message => 
        message.content.toLowerCase().includes(searchTerm.toLowerCase())
    );
};

// Method to export session
chatSessionSchema.methods.exportSession = function(format = 'json') {
    const exportData = {
        id: this._id,
        title: this.title,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt,
        messages: this.messages.map(msg => ({
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp
        })),
        settings: this.settings,
        messageCount: this.messageCount
    };

    if (format === 'json') {
        return JSON.stringify(exportData, null, 2);
    } else if (format === 'csv') {
        const headers = ['Timestamp', 'Role', 'Content'];
        const rows = this.messages.map(msg => [
            msg.timestamp.toISOString(),
            msg.role,
            `"${msg.content.replace(/"/g, '""')}"`
        ]);
        return [headers, ...rows].map(row => row.join(',')).join('\n');
    }

    return exportData;
};

// Static method to get user's active sessions
chatSessionSchema.statics.getActiveSessions = function(userId, limit = 10) {
    return this.find({ 
        user: userId, 
        status: 'active' 
    })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .select('title updatedAt messageCount settings');
};

// Static method to get analytics
chatSessionSchema.statics.getUserAnalytics = function(userId, period = '30d') {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - parseInt(period.replace('d', '')));

    return this.aggregate([
        {
            $match: {
                user: userId,
                createdAt: { $gte: startDate, $lte: endDate }
            }
        },
        {
            $group: {
                _id: null,
                totalSessions: { $sum: 1 },
                totalMessages: { $sum: '$messageCount' },
                averageMessagesPerSession: { $avg: '$messageCount' },
                mostUsedLanguage: { $addToSet: '$settings.language' },
                commonContexts: { $addToSet: '$settings.context' }
            }
        }
    ]);
};

module.exports = mongoose.model('ChatSession', chatSessionSchema);