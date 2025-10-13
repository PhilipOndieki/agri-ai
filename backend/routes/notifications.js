// Notification Routes
const express = require('express');
const webpush = require('web-push');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Configure web-push
webpush.setVapidDetails(
    'mailto:your-email@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

// @route   GET /api/notifications
// @desc    Get user's notifications
// @access  Private
router.get('/', auth, async (req, res, next) => {
    try {
        const { page = 1, limit = 20, unreadOnly = false } = req.query;
        const skip = (page - 1) * limit;

        const filter = { user: req.user._id };
        if (unreadOnly === 'true') {
            filter.isRead = false;
        }

        const notifications = await Notification.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Notification.countDocuments(filter);
        const unreadCount = await Notification.countDocuments({
            user: req.user._id,
            isRead: false
        });

        res.json({
            success: true,
            data: {
                notifications,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / limit)
                },
                unreadCount
            }
        });

    } catch (error) {
        next(error);
    }
});

// @route   POST /api/notifications
// @desc    Create notification
// @access  Private
router.post('/', auth, async (req, res, next) => {
    try {
        const { title, message, type, data, priority = 'medium' } = req.body;

        if (!title || !message) {
            return res.status(400).json({
                success: false,
                message: 'Title and message are required'
            });
        }

        const notification = await Notification.create({
            user: req.user._id,
            title,
            message,
            type: type || 'general',
            data: data || {},
            priority
        });

        // Send push notification if user has subscription
        const user = await User.findById(req.user._id);
        if (user.pushNotificationSubscription) {
            try {
                await sendPushNotification(
                    user.pushNotificationSubscription,
                    {
                        title,
                        body: message,
                        icon: '/icons/icon-192x192.png',
                        badge: '/icons/badge-72x72.png',
                        data: {
                            notificationId: notification._id,
                            type: notification.type,
                            ...data
                        }
                    }
                );
            } catch (pushError) {
                console.error('Push notification error:', pushError);
            }
        }

        res.status(201).json({
            success: true,
            message: 'Notification created successfully',
            data: { notification }
        });

    } catch (error) {
        next(error);
    }
});

// @route   PUT /api/notifications/:notificationId/read
// @desc    Mark notification as read
// @access  Private
router.put('/:notificationId/read', auth, async (req, res, next) => {
    try {
        const notification = await Notification.findOne({
            _id: req.params.notificationId,
            user: req.user._id
        });

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }

        notification.isRead = true;
        notification.readAt = new Date();
        await notification.save();

        res.json({
            success: true,
            message: 'Notification marked as read'
        });

    } catch (error) {
        next(error);
    }
});

// @route   PUT /api/notifications/mark-all-read
// @desc    Mark all notifications as read
// @access  Private
router.put('/mark-all-read', auth, async (req, res, next) => {
    try {
        await Notification.updateMany(
            { user: req.user._id, isRead: false },
            { 
                isRead: true, 
                readAt: new Date() 
            }
        );

        res.json({
            success: true,
            message: 'All notifications marked as read'
        });

    } catch (error) {
        next(error);
    }
});

// @route   DELETE /api/notifications/:notificationId
// @desc    Delete notification
// @access  Private
router.delete('/:notificationId', auth, async (req, res, next) => {
    try {
        const notification = await Notification.findOne({
            _id: req.params.notificationId,
            user: req.user._id
        });

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }

        await notification.deleteOne();

        res.json({
            success: true,
            message: 'Notification deleted successfully'
        });

    } catch (error) {
        next(error);
    }
});

// @route   POST /api/notifications/subscribe
// @desc    Subscribe to push notifications
// @access  Private
router.post('/subscribe', auth, async (req, res, next) => {
    try {
        const { subscription } = req.body;

        if (!subscription || !subscription.endpoint || !subscription.keys) {
            return res.status(400).json({
                success: false,
                message: 'Invalid subscription data'
            });
        }

        // Update user with push notification subscription
        await User.findByIdAndUpdate(req.user._id, {
            pushNotificationSubscription: subscription
        });

        res.json({
            success: true,
            message: 'Subscribed to push notifications successfully'
        });

    } catch (error) {
        next(error);
    }
});

// @route   POST /api/notifications/unsubscribe
// @desc    Unsubscribe from push notifications
// @access  Private
router.post('/unsubscribe', auth, async (req, res, next) => {
    try {
        await User.findByIdAndUpdate(req.user._id, {
            pushNotificationSubscription: null
        });

        res.json({
            success: true,
            message: 'Unsubscribed from push notifications successfully'
        });

    } catch (error) {
        next(error);
    }
});

// @route   POST /api/notifications/test-push
// @desc    Test push notification
// @access  Private
router.post('/test-push', auth, async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id);

        if (!user.pushNotificationSubscription) {
            return res.status(400).json({
                success: false,
                message: 'No push notification subscription found'
            });
        }

        const payload = {
            title: 'Test Notification',
            body: 'This is a test push notification from AgriAI!',
            icon: '/icons/icon-192x192.png',
            badge: '/icons/badge-72x72.png',
            data: {
                type: 'test',
                timestamp: new Date().toISOString()
            }
        };

        await sendPushNotification(user.pushNotificationSubscription, payload);

        res.json({
            success: true,
            message: 'Test push notification sent successfully'
        });

    } catch (error) {
        next(error);
    }
});

// @route   GET /api/notifications/preferences
// @desc    Get notification preferences
// @access  Private
router.get('/preferences', auth, async (req, res, next) => {
    try {
        const user = await User.findById(req.user._id).select('preferences.notifications');

        res.json({
            success: true,
            data: { preferences: user.preferences.notifications }
        });

    } catch (error) {
        next(error);
    }
});

// @route   PUT /api/notifications/preferences
// @desc    Update notification preferences
// @access  Private
router.put('/preferences', auth, async (req, res, next) => {
    try {
        const { weather, community, alerts, marketing } = req.body;

        const user = await User.findById(req.user._id);
        
        if (weather !== undefined) user.preferences.notifications.weather = weather;
        if (community !== undefined) user.preferences.notifications.community = community;
        if (alerts !== undefined) user.preferences.notifications.alerts = alerts;
        if (marketing !== undefined) user.preferences.notifications.marketing = marketing;

        await user.save();

        res.json({
            success: true,
            message: 'Notification preferences updated successfully'
        });

    } catch (error) {
        next(error);
    }
});

// @route   GET /api/notifications/analytics
// @desc    Get notification analytics
// @access  Private
router.get('/analytics', auth, async (req, res, next) => {
    try {
        const { period = '30d' } = req.query;

        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - parseInt(period.replace('d', '')));

        const analytics = await Notification.aggregate([
            {
                $match: {
                    user: req.user._id,
                    createdAt: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: null,
                    totalNotifications: { $sum: 1 },
                    readNotifications: {
                        $sum: { $cond: ['$isRead', 1, 0] }
                    },
                    unreadNotifications: {
                        $sum: { $cond: ['$isRead', 0, 1] }
                    },
                    notificationTypes: { $addToSet: '$type' }
                }
            }
        ]);

        const typeStats = await Notification.aggregate([
            {
                $match: {
                    user: req.user._id,
                    createdAt: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: '$type',
                    count: { $sum: 1 },
                    readCount: {
                        $sum: { $cond: ['$isRead', 1, 0] }
                    }
                }
            },
            { $sort: { count: -1 } }
        ]);

        const monthlyStats = await Notification.aggregate([
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
                    total: { $sum: 1 },
                    read: {
                        $sum: { $cond: ['$isRead', 1, 0] }
                    },
                    unread: {
                        $sum: { $cond: ['$isRead', 0, 1] }
                    }
                }
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        res.json({
            success: true,
            data: {
                summary: analytics[0] || {
                    totalNotifications: 0,
                    readNotifications: 0,
                    unreadNotifications: 0,
                    notificationTypes: []
                },
                types: typeStats,
                monthly: monthlyStats
            }
        });

    } catch (error) {
        next(error);
    }
});

// Helper function to send push notification
const sendPushNotification = async (subscription, payload) => {
    try {
        await webpush.sendNotification(
            subscription,
            JSON.stringify(payload)
        );
    } catch (error) {
        console.error('Push notification error:', error);
        throw error;
    }
};

module.exports = router;