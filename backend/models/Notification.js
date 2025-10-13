// Notification Model
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        required: [true, 'Notification title is required'],
        trim: true,
        maxlength: [200, 'Title cannot exceed 200 characters']
    },
    message: {
        type: String,
        required: [true, 'Notification message is required'],
        maxlength: [500, 'Message cannot exceed 500 characters']
    },
    type: {
        type: String,
        enum: ['general', 'weather', 'community', 'alert', 'reminder', 'achievement', 'system'],
        default: 'general'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    data: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    isRead: {
        type: Boolean,
        default: false
    },
    readAt: Date,
    isDeleted: {
        type: Boolean,
        default: false
    },
    expiresAt: Date,
    scheduledFor: Date,
    metadata: {
        source: {
            type: String,
            enum: ['system', 'user', 'api', 'cron'],
            default: 'system'
        },
        relatedId: mongoose.Schema.Types.ObjectId,
        relatedType: String,
        campaignId: String,
        trackingId: String
    },
    actions: [{
        label: String,
        action: String,
        url: String,
        data: mongoose.Schema.Types.Mixed
    }]
}, {
    timestamps: true
});

// Indexes for efficient querying
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, isRead: 1 });
notificationSchema.index({ type: 1, priority: 1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
notificationSchema.index({ scheduledFor: 1 });

// Virtual for checking if notification is expired
notificationSchema.virtual('isExpired').get(function() {
    return this.expiresAt && this.expiresAt < new Date();
});

// Virtual for checking if notification is scheduled
notificationSchema.virtual('isScheduled').get(function() {
    return this.scheduledFor && this.scheduledFor > new Date();
});

// Pre-save middleware
notificationSchema.pre('save', function(next) {
    // Auto-expire notifications after 30 days if not set
    if (!this.expiresAt && !this.isDeleted) {
        this.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }
    next();
});

// Method to mark as read
notificationSchema.methods.markAsRead = function() {
    this.isRead = true;
    this.readAt = new Date();
    return this.save();
};

// Method to mark as unread
notificationSchema.methods.markAsUnread = function() {
    this.isRead = false;
    this.readAt = undefined;
    return this.save();
};

// Method to soft delete
notificationSchema.methods.softDelete = function() {
    this.isDeleted = true;
    return this.save();
};

// Static method to create notification
notificationSchema.statics.createNotification = function(userId, notificationData) {
    return this.create({
        user: userId,
        ...notificationData
    });
};

// Static method to create bulk notifications
notificationSchema.statics.createBulkNotifications = function(userIds, notificationData) {
    const notifications = userIds.map(userId => ({
        user: userId,
        ...notificationData
    }));
    
    return this.insertMany(notifications);
};

// Static method to get unread count
notificationSchema.statics.getUnreadCount = function(userId) {
    return this.countDocuments({
        user: userId,
        isRead: false,
        isDeleted: false,
        $or: [
            { expiresAt: { $exists: false } },
            { expiresAt: { $gt: new Date() } }
        ]
    });
};

// Static method to get notifications by type
notificationSchema.statics.getByType = function(userId, type, limit = 20) {
    return this.find({
        user: userId,
        type: type,
        isDeleted: false,
        $or: [
            { expiresAt: { $exists: false } },
            { expiresAt: { $gt: new Date() } }
        ]
    })
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Static method to cleanup old notifications
notificationSchema.statics.cleanupOldNotifications = function(days = 90) {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    return this.deleteMany({
        $or: [
            { createdAt: { $lt: cutoffDate } },
            { isDeleted: true }
        ]
    });
};

// Static method to schedule notification
notificationSchema.statics.scheduleNotification = function(userId, notificationData, scheduledTime) {
    return this.create({
        user: userId,
        ...notificationData,
        scheduledFor: scheduledTime,
        status: 'scheduled'
    });
};

module.exports = mongoose.model('Notification', notificationSchema);