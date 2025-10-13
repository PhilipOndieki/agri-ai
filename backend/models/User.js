// User Model
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
        maxlength: [100, 'Name cannot exceed 100 characters']
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters'],
        select: false
    },
    phone: {
        type: String,
        trim: true,
        match: [/^\+?[\d\s-()]+$/, 'Please enter a valid phone number']
    },
    location: {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number], // [longitude, latitude]
            default: [0, 0]
        },
        address: {
            type: String,
            trim: true
        },
        city: String,
        state: String,
        country: String,
        zipCode: String
    },
    role: {
        type: String,
        enum: ['farmer', 'expert', 'admin'],
        default: 'farmer'
    },
    profile: {
        avatar: String,
        farmSize: String,
        crops: [String],
        experience: Number,
        language: {
            type: String,
            default: 'en'
        }
    },
    preferences: {
        notifications: {
            weather: { type: Boolean, default: true },
            community: { type: Boolean, default: true },
            alerts: { type: Boolean, default: true },
            marketing: { type: Boolean, default: false }
        },
        units: {
            temperature: { type: String, enum: ['celsius', 'fahrenheit'], default: 'celsius' },
            area: { type: String, enum: ['acres', 'hectares'], default: 'hectares' }
        }
    },
    subscription: {
        type: {
            type: String,
            enum: ['free', 'premium', 'enterprise'],
            default: 'free'
        },
        startDate: Date,
        endDate: Date,
        isActive: { type: Boolean, default: true }
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastLogin: Date,
    loginCount: {
        type: Number,
        default: 0
    },
    refreshToken: String,
    passwordResetToken: String,
    passwordResetExpires: Date,
    emailVerificationToken: String,
    emailVerified: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Index for geospatial queries
userSchema.index({ location: '2dsphere' });

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
    try {
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        throw new Error('Password comparison failed');
    }
};

// Update last login
userSchema.methods.updateLastLogin = function() {
    this.lastLogin = new Date();
    this.loginCount += 1;
    return this.save();
};

// Check if subscription is active
userSchema.methods.isSubscriptionActive = function() {
    if (this.subscription.type === 'free') return true;
    return this.subscription.isActive && this.subscription.endDate > new Date();
};

// Get user profile (safe to send to client)
userSchema.methods.getPublicProfile = function() {
    return {
        id: this._id,
        name: this.name,
        email: this.email,
        phone: this.phone,
        location: this.location,
        role: this.role,
        profile: this.profile,
        preferences: this.preferences,
        subscription: {
            type: this.subscription.type,
            isActive: this.isSubscriptionActive()
        },
        isActive: this.isActive,
        createdAt: this.createdAt,
        lastLogin: this.lastLogin
    };
};

module.exports = mongoose.model('User', userSchema);