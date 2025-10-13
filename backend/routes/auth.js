// Authentication Routes
const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { auth, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// Generate JWT token
const generateToken = (userId, expiresIn = '7d') => {
    return jwt.sign({ id: userId }, process.env.JWT_SECRET || 'your-secret-key', {
        expiresIn
    });
};

// Generate refresh token
const generateRefreshToken = () => {
    return crypto.randomBytes(40).toString('hex');
};

// @route   POST /api/auth/register
// @desc    Register new user
// @access  Public
router.post('/register', async (req, res, next) => {
    try {
        const { name, email, password, phone, location } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User already exists with this email'
            });
        }

        // Create new user
        const user = await User.create({
            name,
            email,
            password,
            phone,
            location
        });

        // Generate tokens
        const token = generateToken(user._id);
        const refreshToken = generateRefreshToken();

        // Save refresh token
        user.refreshToken = refreshToken;
        await user.save();

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: {
                user: user.getPublicProfile(),
                token,
                refreshToken
            }
        });
    } catch (error) {
        next(error);
    }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', async (req, res, next) => {
    try {
        const { email, password } = req.body;

        // Check if user exists
        const user = await User.findOne({ email }).select('+password');
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Check if account is active
        if (!user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'Account is deactivated'
            });
        }

        // Verify password
        const isPasswordMatch = await user.comparePassword(password);
        if (!isPasswordMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Generate tokens
        const token = generateToken(user._id);
        const refreshToken = generateRefreshToken();

        // Update user
        user.refreshToken = refreshToken;
        await user.updateLastLogin();

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                user: user.getPublicProfile(),
                token,
                refreshToken
            }
        });
    } catch (error) {
        next(error);
    }
});

// @route   POST /api/auth/refresh
// @desc    Refresh access token
// @access  Public
router.post('/refresh', async (req, res, next) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(401).json({
                success: false,
                message: 'Refresh token required'
            });
        }

        const user = await User.findOne({ refreshToken });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid refresh token'
            });
        }

        // Generate new access token
        const token = generateToken(user._id);

        res.json({
            success: true,
            message: 'Token refreshed successfully',
            data: {
                token,
                user: user.getPublicProfile()
            }
        });
    } catch (error) {
        next(error);
    }
});

// @route   POST /api/auth/logout
// @desc    Logout user
// @access  Private
router.post('/logout', auth, async (req, res, next) => {
    try {
        // Clear refresh token
        req.user.refreshToken = undefined;
        await req.user.save();

        res.json({
            success: true,
            message: 'Logged out successfully'
        });
    } catch (error) {
        next(error);
    }
});

// @route   GET /api/auth/profile
// @desc    Get user profile
// @access  Private
router.get('/profile', auth, async (req, res, next) => {
    try {
        res.json({
            success: true,
            data: {
                user: req.user.getPublicProfile()
            }
        });
    } catch (error) {
        next(error);
    }
});

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', auth, async (req, res, next) => {
    try {
        const { name, phone, location, profile, preferences } = req.body;

        // Update allowed fields
        if (name) req.user.name = name;
        if (phone) req.user.phone = phone;
        if (location) req.user.location = location;
        if (profile) req.user.profile = { ...req.user.profile, ...profile };
        if (preferences) req.user.preferences = { ...req.user.preferences, ...preferences };

        await req.user.save();

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: {
                user: req.user.getPublicProfile()
            }
        });
    } catch (error) {
        next(error);
    }
});

// @route   POST /api/auth/change-password
// @desc    Change password
// @access  Private
router.post('/change-password', auth, async (req, res, next) => {
    try {
        const { currentPassword, newPassword } = req.body;

        // Verify current password
        const isCurrentPasswordMatch = await req.user.comparePassword(currentPassword);
        if (!isCurrentPasswordMatch) {
            return res.status(400).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Update password
        req.user.password = newPassword;
        await req.user.save();

        res.json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        next(error);
    }
});

// @route   POST /api/auth/forgot-password
// @desc    Send password reset email
// @access  Public
router.post('/forgot-password', async (req, res, next) => {
    try {
        const { email } = req.body;

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(20).toString('hex');
        
        user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
        
        await user.save();

        // TODO: Send email with reset token
        // For now, return the token in response (development only)
        res.json({
            success: true,
            message: 'Password reset token sent',
            data: {
                resetToken, // Only in development
                resetUrl: `${req.protocol}://${req.get('host')}/api/auth/reset-password/${resetToken}`
            }
        });
    } catch (error) {
        next(error);
    }
});

// @route   POST /api/auth/reset-password/:token
// @desc    Reset password
// @access  Public
router.post('/reset-password/:token', async (req, res, next) => {
    try {
        const { token } = req.params;
        const { password } = req.body;

        // Hash token
        const resetToken = crypto.createHash('sha256').update(token).digest('hex');

        const user = await User.findOne({
            passwordResetToken: resetToken,
            passwordResetExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset token'
            });
        }

        // Update password
        user.password = password;
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        
        await user.save();

        res.json({
            success: true,
            message: 'Password reset successful'
        });
    } catch (error) {
        next(error);
    }
});

// @route   DELETE /api/auth/account
// @desc    Delete account
// @access  Private
router.delete('/account', auth, async (req, res, next) => {
    try {
        await User.findByIdAndDelete(req.user._id);

        res.json({
            success: true,
            message: 'Account deleted successfully'
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;