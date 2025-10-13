// Community Routes
const express = require('express');
const CommunityPost = require('../models/CommunityPost');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/community/posts
// @desc    Get community posts
// @access  Private
router.get('/posts', auth, async (req, res, next) => {
    try {
        const { 
            page = 1, 
            limit = 20, 
            category, 
            latitude, 
            longitude, 
            radius = 50000,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        const skip = (page - 1) * limit;
        const sortObj = {};
        sortObj[sortBy] = sortOrder === 'desc' ? -1 : 1;

        let filter = { status: 'published' };

        // Filter by category
        if (category) {
            filter.category = category;
        }

        // Filter by location if provided
        if (latitude && longitude) {
            filter['content.location'] = {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [parseFloat(longitude), parseFloat(latitude)]
                    },
                    $maxDistance: parseInt(radius)
                }
            };
        }

        const posts = await CommunityPost.find(filter)
            .populate('author', 'name profile.avatar profile.experience')
            .sort(sortObj)
            .skip(skip)
            .limit(parseInt(limit));

        const total = await CommunityPost.countDocuments(filter);

        res.json({
            success: true,
            data: {
                posts,
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

// @route   POST /api/community/posts
// @desc    Create new community post
// @access  Private
router.post('/posts', auth, async (req, res, next) => {
    try {
        const {
            title,
            body,
            category = 'general',
            tags = [],
            priority = 'medium',
            targetAudience = 'local',
            location,
            images = []
        } = req.body;

        if (!title || !body) {
            return res.status(400).json({
                success: false,
                message: 'Title and body are required'
            });
        }

        const post = await CommunityPost.create({
            author: req.user._id,
            content: {
                title,
                body,
                images,
                location: location || req.user.location
            },
            category,
            tags: Array.isArray(tags) ? tags : [tags],
            priority,
            targetAudience
        });

        // Populate author data
        await post.populate('author', 'name profile.avatar profile.experience');

        res.status(201).json({
            success: true,
            message: 'Post created successfully',
            data: { post }
        });

    } catch (error) {
        next(error);
    }
});

// @route   GET /api/community/posts/:postId
// @desc    Get specific post
// @access  Private
router.get('/posts/:postId', auth, async (req, res, next) => {
    try {
        const post = await CommunityPost.findById(req.params.postId)
            .populate('author', 'name profile.avatar profile.experience')
            .populate('engagement.comments.user', 'name profile.avatar')
            .populate('engagement.comments.replies.user', 'name profile.avatar');

        if (!post) {
            return res.status(404).json({
                success: false,
                message: 'Post not found'
            });
        }

        // Increment view count
        post.engagement.views += 1;
        await post.save();

        res.json({
            success: true,
            data: { post }
        });

    } catch (error) {
        next(error);
    }
});

// @route   PUT /api/community/posts/:postId
// @desc    Update post
// @access  Private
router.put('/posts/:postId', auth, async (req, res, next) => {
    try {
        const post = await CommunityPost.findOne({
            _id: req.params.postId,
            author: req.user._id
        });

        if (!post) {
            return res.status(404).json({
                success: false,
                message: 'Post not found or not authorized'
            });
        }

        const { title, body, category, tags, priority, targetAudience } = req.body;

        if (title) post.content.title = title;
        if (body) post.content.body = body;
        if (category) post.category = category;
        if (tags) post.tags = Array.isArray(tags) ? tags : [tags];
        if (priority) post.priority = priority;
        if (targetAudience) post.targetAudience = targetAudience;

        await post.save();
        await post.populate('author', 'name profile.avatar profile.experience');

        res.json({
            success: true,
            message: 'Post updated successfully',
            data: { post }
        });

    } catch (error) {
        next(error);
    }
});

// @route   DELETE /api/community/posts/:postId
// @desc    Delete post
// @access  Private
router.delete('/posts/:postId', auth, async (req, res, next) => {
    try {
        const post = await CommunityPost.findOne({
            _id: req.params.postId,
            author: req.user._id
        });

        if (!post) {
            return res.status(404).json({
                success: false,
                message: 'Post not found or not authorized'
            });
        }

        await post.deleteOne();

        res.json({
            success: true,
            message: 'Post deleted successfully'
        });

    } catch (error) {
        next(error);
    }
});

// @route   POST /api/community/posts/:postId/like
// @desc    Like/unlike post
// @access  Private
router.post('/posts/:postId/like', auth, async (req, res, next) => {
    try {
        const post = await CommunityPost.findById(req.params.postId);

        if (!post) {
            return res.status(404).json({
                success: false,
                message: 'Post not found'
            });
        }

        await post.addLike(req.user._id);

        res.json({
            success: true,
            message: 'Post liked status updated',
            data: {
                likes: post.engagement.likes.length,
                isLiked: post.engagement.likes.some(like => like.user.toString() === req.user._id.toString())
            }
        });

    } catch (error) {
        next(error);
    }
});

// @route   POST /api/community/posts/:postId/comments
// @desc    Add comment to post
// @access  Private
router.post('/posts/:postId/comments', auth, async (req, res, next) => {
    try {
        const { content } = req.body;

        if (!content) {
            return res.status(400).json({
                success: false,
                message: 'Comment content is required'
            });
        }

        const post = await CommunityPost.findById(req.params.postId);

        if (!post) {
            return res.status(404).json({
                success: false,
                message: 'Post not found'
            });
        }

        await post.addComment(req.user._id, content);

        res.status(201).json({
            success: true,
            message: 'Comment added successfully'
        });

    } catch (error) {
        next(error);
    }
});

// @route   POST /api/community/posts/:postId/comments/:commentId/reply
// @desc    Reply to comment
// @access  Private
router.post('/posts/:postId/comments/:commentId/reply', auth, async (req, res, next) => {
    try {
        const { content } = req.body;

        if (!content) {
            return res.status(400).json({
                success: false,
                message: 'Reply content is required'
            });
        }

        const post = await CommunityPost.findById(req.params.postId);

        if (!post) {
            return res.status(404).json({
                success: false,
                message: 'Post not found'
            });
        }

        await post.addReply(req.params.commentId, req.user._id, content);

        res.status(201).json({
            success: true,
            message: 'Reply added successfully'
        });

    } catch (error) {
        next(error);
    }
});

// @route   DELETE /api/community/posts/:postId/comments/:commentId
// @desc    Delete comment
// @access  Private
router.delete('/posts/:postId/comments/:commentId', auth, async (req, res, next) => {
    try {
        const post = await CommunityPost.findById(req.params.postId);

        if (!post) {
            return res.status(404).json({
                success: false,
                message: 'Post not found'
            });
        }

        const comment = post.engagement.comments.id(req.params.commentId);

        if (!comment) {
            return res.status(404).json({
                success: false,
                message: 'Comment not found'
            });
        }

        // Check if user is authorized to delete comment
        if (comment.user.toString() !== req.user._id.toString() && 
            post.author.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to delete this comment'
            });
        }

        comment.remove();
        await post.save();

        res.json({
            success: true,
            message: 'Comment deleted successfully'
        });

    } catch (error) {
        next(error);
    }
});

// @route   GET /api/community/categories
// @desc    Get community post categories
// @access  Private
router.get('/categories', auth, async (req, res, next) => {
    try {
        const categories = [
            { id: 'general', name: 'General', description: 'General farming discussions' },
            { id: 'pest_alert', name: 'Pest Alert', description: 'Pest and disease warnings' },
            { id: 'disease_warning', name: 'Disease Warning', description: 'Plant disease alerts' },
            { id: 'weather_update', name: 'Weather Update', description: 'Local weather information' },
            { id: 'market_info', name: 'Market Info', description: 'Market prices and trends' },
            { id: 'crop_advice', name: 'Crop Advice', description: 'Planting and growing tips' },
            { id: 'success_story', name: 'Success Story', description: 'Share your achievements' },
            { id: 'question', name: 'Question', description: 'Ask the community' }
        ];

        res.json({
            success: true,
            data: { categories }
        });

    } catch (error) {
        next(error);
    }
});

// @route   GET /api/community/trending
// @desc    Get trending posts
// @access  Private
router.get('/trending', auth, async (req, res, next) => {
    try {
        const { limit = 10 } = req.query;

        const trendingPosts = await CommunityPost.getTrendingPosts(parseInt(limit));

        res.json({
            success: true,
            data: { posts: trendingPosts }
        });

    } catch (error) {
        next(error);
    }
});

// @route   GET /api/community/search
// @desc    Search community posts
// @access  Private
router.get('/search', auth, async (req, res, next) => {
    try {
        const { q, category, page = 1, limit = 20 } = req.query;

        if (!q) {
            return res.status(400).json({
                success: false,
                message: 'Search query is required'
            });
        }

        const skip = (page - 1) * limit;

        // Create search filter
        const searchFilter = {
            status: 'published',
            $or: [
                { 'content.title': { $regex: q, $options: 'i' } },
                { 'content.body': { $regex: q, $options: 'i' } },
                { tags: { $in: [new RegExp(q, 'i')] } }
            ]
        };

        if (category) {
            searchFilter.category = category;
        }

        const posts = await CommunityPost.find(searchFilter)
            .populate('author', 'name profile.avatar profile.experience')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await CommunityPost.countDocuments(searchFilter);

        res.json({
            success: true,
            data: {
                posts,
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

// @route   GET /api/community/my-posts
// @desc    Get user's own posts
// @access  Private
router.get('/my-posts', auth, async (req, res, next) => {
    try {
        const { page = 1, limit = 20, status = 'published' } = req.query;
        const skip = (page - 1) * limit;

        const filter = { author: req.user._id };
        if (status !== 'all') {
            filter.status = status;
        }

        const posts = await CommunityPost.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('author', 'name profile.avatar profile.experience');

        const total = await CommunityPost.countDocuments(filter);

        res.json({
            success: true,
            data: {
                posts,
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

// @route   GET /api/community/analytics
// @desc    Get community analytics
// @access  Private
router.get('/analytics', auth, async (req, res, next) => {
    try {
        const { period = '30d' } = req.query;

        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - parseInt(period.replace('d', '')));

        const analytics = await CommunityPost.aggregate([
            {
                $match: {
                    status: 'published',
                    createdAt: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: null,
                    totalPosts: { $sum: 1 },
                    totalViews: { $sum: '$engagement.views' },
                    totalLikes: { $sum: { $size: '$engagement.likes' } },
                    totalComments: { $sum: { $size: '$engagement.comments' } },
                    totalShares: { $sum: '$engagement.shares' },
                    categories: { $addToSet: '$category' },
                    popularTags: { $push: '$tags' }
                }
            }
        ]);

        const categoryStats = await CommunityPost.aggregate([
            {
                $match: {
                    status: 'published',
                    createdAt: { $gte: startDate, $lte: endDate }
                }
            },
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 },
                    avgLikes: { $avg: { $size: '$engagement.likes' } },
                    avgComments: { $avg: { $size: '$engagement.comments' } }
                }
            },
            { $sort: { count: -1 } }
        ]);

        res.json({
            success: true,
            data: {
                summary: analytics[0] || {
                    totalPosts: 0,
                    totalViews: 0,
                    totalLikes: 0,
                    totalComments: 0,
                    totalShares: 0,
                    categories: [],
                    popularTags: []
                },
                categories: categoryStats
            }
        });

    } catch (error) {
        next(error);
    }
});

module.exports = router;