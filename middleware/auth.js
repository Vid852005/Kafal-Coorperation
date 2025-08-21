const jwt = require('jsonwebtoken');
const { getOne } = require('../config/database');

// Generate JWT token
const generateToken = (payload) => {
    return jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '24h'
    });
};

// Generate refresh token
const generateRefreshToken = (payload) => {
    return jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
    });
};

// Verify JWT token
const verifyToken = (token) => {
    return jwt.verify(token, process.env.JWT_SECRET);
};

// Authentication middleware for members
const authenticateMember = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Access token required'
            });
        }

        const token = authHeader.substring(7);
        const decoded = verifyToken(token);

        if (decoded.type !== 'member') {
            return res.status(403).json({
                success: false,
                message: 'Invalid token type'
            });
        }

        // Check if member exists and is active
        const member = await getOne(
            'SELECT member_id, email, status FROM members WHERE member_id = ?',
            [decoded.id]
        );

        if (!member) {
            return res.status(401).json({
                success: false,
                message: 'Member not found'
            });
        }

        if (member.status !== 'Active') {
            return res.status(403).json({
                success: false,
                message: 'Account is not active'
            });
        }

        req.member = member;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired'
            });
        }
        
        return res.status(401).json({
            success: false,
            message: 'Invalid token'
        });
    }
};

// Authentication middleware for admins
const authenticateAdmin = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Access token required'
            });
        }

        const token = authHeader.substring(7);
        const decoded = verifyToken(token);

        if (decoded.type !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Invalid token type'
            });
        }

        // Check if admin exists and is active
        const admin = await getOne(
            'SELECT admin_id, username, email, role, status FROM admins WHERE admin_id = ?',
            [decoded.id]
        );

        if (!admin) {
            return res.status(401).json({
                success: false,
                message: 'Admin not found'
            });
        }

        if (admin.status !== 'Active') {
            return res.status(403).json({
                success: false,
                message: 'Account is not active'
            });
        }

        req.admin = admin;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired'
            });
        }
        
        return res.status(401).json({
            success: false,
            message: 'Invalid token'
        });
    }
};

// Role-based authorization for admins
const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.admin) {
            return res.status(401).json({
                success: false,
                message: 'Admin authentication required'
            });
        }

        const allowedRoles = Array.isArray(roles) ? roles : [roles];
        if (!allowedRoles.includes(req.admin.role)) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions'
            });
        }

        next();
    };
};

// Optional authentication (for public endpoints that can benefit from user context)
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next();
        }

        const token = authHeader.substring(7);
        const decoded = verifyToken(token);

        if (decoded.type === 'member') {
            const member = await getOne(
                'SELECT member_id, email, status FROM members WHERE member_id = ?',
                [decoded.id]
            );
            if (member && member.status === 'Active') {
                req.member = member;
            }
        } else if (decoded.type === 'admin') {
            const admin = await getOne(
                'SELECT admin_id, username, email, role, status FROM admins WHERE admin_id = ?',
                [decoded.id]
            );
            if (admin && admin.status === 'Active') {
                req.admin = admin;
            }
        }

        next();
    } catch (error) {
        // Ignore token errors for optional auth
        next();
    }
};

module.exports = {
    generateToken,
    generateRefreshToken,
    verifyToken,
    authenticateMember,
    authenticateAdmin,
    requireRole,
    optionalAuth
};
