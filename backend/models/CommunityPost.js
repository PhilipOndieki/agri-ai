// Community Post Model
const mongoose = require('mongoose');

const communityPostSchema = new mongoose.Schema({
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    content: {
        title: {
            type: String,
            required: [true, 'Post title is required'],
            maxlength: [200, 'Title cannot exceed 200 characters'],
            trim: true
        },
        body: {
            type: String,
            required: [true, 'Post content is required'],
            maxlength: [2000, 'Content cannot exceed 2000 characters']
        },
        images: [{
            filename: String,
            url: String,
            caption: String
        }],
        location: {
            latitude: Number,
            longitude: Number,
            address: String,
            city: String,
            state: String,
            country: String
        }
    },
    category: {
        type: String,
        enum: ['general', 'pest_alert', 'disease_warning', 'weather_update', 'market_info', 'crop_advice', 'success_story', 'question'],
        default: 'general'
    },
    tags: [String],
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    targetAudience: {
        type: String,
        enum: ['all', 'local', 'regional', 'national'],
        default: 'local'
    },
    engagement: {
        views: {
            type: Number,
            default: 0
        },
        likes: [{
            user: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            createdAt: {
                type: Date,
                default: Date.now
            }
        }],
        comments: [{
            user: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                required: true
            },
            content: {
                type: String,
                required: [true, 'Comment content is required'],
                maxlength: [500, 'Comment cannot exceed 500 characters']
            },
            likes: [{
                user: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User'
                },
                createdAt: {
                    type: Date,
                    default: Date.now
                }
            }],
            replies: [{
                user: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User',
                    required: true
                },
                content: {
                    type: String,
                    required: true,
                    maxlength: [300, 'Reply cannot exceed 300 characters']
                },
                createdAt: {
                    type: Date,
                    default: Date.now
                }
            }],
            createdAt: {
                type: Date,
                default: Date.now
            }
        }],
        shares: {
            type: Number,
            default: 0
        }
    },
    status: {
        type: String,
        enum: ['draft', 'published', 'archived', 'flagged'],
        default: 'published'
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    verifiedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    expiresAt: Date, // For time-sensitive alerts
    relatedAnalysis: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ImageAnalysis'
    }],
    weatherContext: {
        temperature: Number,
        humidity: Number,
        conditions: String,
        forecast: String
    }
}, {
    timestamps: true
});

// Indexes for efficient querying
communityPostSchema.index({ author: 1, createdAt: -1 });
communityPostSchema.index({ category: 1, status: 1 });
communityPostSchema.index({ 'content.location': '2dsphere' });
communityPostSchema.index({ tags: 1 });
communityPostSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual for getting engagement stats
communityPostSchema.virtual('engagementStats').get(function() {
    return {
        views: this.engagement.views,
        likes: this.engagement.likes.length,
        comments: this.engagement.comments.length,
        shares: this.engagement.shares
    };
});

// Method to add like
communityPostSchema.methods.addLike = function(userId) {
    const likeExists = this.engagement.likes.find(like => like.user.toString() === userId.toString());
    
    if (likeExists) {
        // Unlike
        this.engagement.likes = this.engagement.likes.filter(like => like.user.toString() !== userId.toString());
    } else {
        // Like
        this.engagement.likes.push({ user: userId });
    }
    
    return this.save();
};

// Method to add comment
communityPostSchema.methods.addComment = function(userId, content) {
    this.engagement.comments.push({
        user: userId,
        content: content
    });
    
    return this.save();
};

// Method to add reply to comment
communityPostSchema.methods.addReply = function(commentId, userId, content) {
    const comment = this.engagement.comments.id(commentId);
    if (comment) {
        comment.replies.push({
            user: userId,
            content: content
        });
    }
    
    return this.save();
};

// Static method to get posts by location
communityPostSchema.statics.getPostsByLocation = function(latitude, longitude, radius = 50000, limit = 20) {
    return this.find({
        'content.location': {
            $near: {
                $geometry: {
                    type: 'Point',
                    coordinates: [longitude, latitude]
                },
                $maxDistance: radius
            }
        },
        status: 'published'
    })
    .populate('author', 'name profile.avatar profile.experience')
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Static method to get trending posts
communityPostSchema.statics.getTrendingPosts = function(limit = 10) {
    return this.find({ status: 'published' })
        .populate('author', 'name profile.avatar')
        .sort({ 
            'engagement.likes': -1, 
            'engagement.comments': -1, 
            createdAt: -1 
        })
        .limit(limit);
};

// Static method to get posts by category
communityPostSchema.statics.getPostsByCategory = function(category, limit = 20) {
    return this.find({ category, status: 'published' })
        .populate('author', 'name profile.avatar')
        .sort({ createdAt: -1 })
        .limit(limit);
};

module.exports = mongoose.model('CommunityPost', communityPostSchema);