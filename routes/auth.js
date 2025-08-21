const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { executeQuery, getOne } = require('../config/database');
const { generateToken, generateRefreshToken, verifyToken } = require('../middleware/auth');

const router = express.Router();

// Google OAuth endpoints
router.post('/google/member', async (req, res) => {
    try {
        const { googleId, email, firstName, lastName, profileImage } = req.body;

        // Check if member exists with this email
        let member = await getOne('SELECT * FROM members WHERE email = ?', [email]);

        if (!member) {
            // Create new member registration request
            const result = await executeQuery(`
                INSERT INTO member_requests 
                (first_name, last_name, email, phone, date_of_birth, address, account_type, initial_deposit, password_hash, status, request_date)
                VALUES (?, ?, ?, '', '1990-01-01', 'Google OAuth User', 'savings', 1000, '', 'pending', NOW())
            `, [firstName, lastName, email]);

            return res.json({
                success: false,
                message: 'Account registration request created. Please wait for admin approval.',
                requiresApproval: true,
                requestId: result.insertId
            });
        }

        // Generate JWT token for existing member
        const token = jwt.sign(
            { 
                id: member.id, 
                email: member.email, 
                type: 'member',
                accountNumber: member.account_number 
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
        );

        res.json({
            success: true,
            message: 'Google authentication successful',
            data: {
                token,
                member: {
                    id: member.id,
                    accountNumber: member.account_number,
                    firstName: member.first_name,
                    lastName: member.last_name,
                    email: member.email
                }
            }
        });

    } catch (error) {
        console.error('Google member auth error:', error);
        res.status(500).json({
            success: false,
            message: 'Google authentication failed'
        });
    }
});

router.post('/google/admin', async (req, res) => {
    try {
        const { googleId, email, firstName, lastName } = req.body;

        // Check if admin exists with this email
        const admin = await getOne('SELECT * FROM admins WHERE email = ?', [email]);

        if (!admin) {
            return res.status(403).json({
                success: false,
                message: 'Admin account not found. Please contact system administrator.'
            });
        }

        // Generate JWT token
        const token = jwt.sign(
            { 
                id: admin.id, 
                email: admin.email, 
                type: 'admin',
                adminId: admin.admin_id 
            },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
        );

        // Update last login
        await executeQuery('UPDATE admins SET last_login = NOW() WHERE id = ?', [admin.id]);

        res.json({
            success: true,
            message: 'Google admin authentication successful',
            data: {
                token,
                admin: {
                    id: admin.id,
                    adminId: admin.admin_id,
                    firstName: admin.first_name,
                    lastName: admin.last_name,
                    email: admin.email
                }
            }
        });

    } catch (error) {
        console.error('Google admin auth error:', error);
        res.status(500).json({
            success: false,
            message: 'Google admin authentication failed'
        });
    }
});

// Member login
router.post('/member/login', [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 })
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        const { email, password } = req.body;

        // Find member
        const member = await getOne(
            'SELECT member_id, email, password_hash, status, first_name, last_name FROM members WHERE email = ?',
            [email]
        );

        if (!member) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        if (member.status !== 'Active') {
            return res.status(403).json({
                success: false,
                message: 'Account is not active'
            });
        }

        // Verify password with bcrypt
        const isValidPassword = await bcrypt.compare(password, member.password_hash);

        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Generate tokens
        const token = generateToken({
            id: member.member_id,
            email: member.email,
            type: 'member'
        });

        const refreshToken = generateRefreshToken({
            id: member.member_id,
            type: 'member'
        });

        // Create session record
        await executeQuery(
            'INSERT INTO member_sessions (member_id, session_token, ip_address, user_agent) VALUES (?, ?, ?, ?)',
            [member.member_id, token, req.ip, req.get('User-Agent')]
        );

        // Notify admins about member login
        const realtimeService = req.app.get('realtime');
        if (realtimeService) {
            realtimeService.handleMemberLogin({
                id: member.member_id,
                email: member.email,
                name: `${member.first_name} ${member.last_name}`
            });
        }

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                token,
                refreshToken,
                member: {
                    id: member.member_id,
                    email: member.email,
                    name: `${member.first_name} ${member.last_name}`,
                    status: member.status
                }
            }
        });
    } catch (error) {
        console.error('Member login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed'
        });
    }
});

// Enhanced admin authentication with stricter validation
router.post('/admin/login', [
    body('adminId').isLength({ min: 6 }).withMessage('Admin ID must be at least 6 characters'),
    body('password').isLength({ min: 8 }).withMessage('Admin password must be at least 8 characters')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        const { username, password } = req.body;

        // Find admin
        const admin = await getOne(
            'SELECT admin_id, username, email, password_hash, role, status, first_name, last_name, failed_login_attempts, account_locked_until FROM admins WHERE username = ?',
            [username]
        );

        if (!admin) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Check if account is locked
        if (admin.account_locked_until && new Date() < admin.account_locked_until) {
            return res.status(423).json({
                success: false,
                message: 'Account is temporarily locked due to multiple failed login attempts'
            });
        }

        if (admin.status !== 'Active') {
            return res.status(403).json({
                success: false,
                message: 'Account is not active'
            });
        }

        // Verify password with bcrypt
        const isValidPassword = await bcrypt.compare(password, admin.password_hash);

        if (!isValidPassword) {
            // Increment failed login attempts
            const failedAttempts = admin.failed_login_attempts + 1;
            const lockoutTime = failedAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;

            await executeQuery(
                'UPDATE admins SET failed_login_attempts = ?, account_locked_until = ? WHERE admin_id = ?',
                [failedAttempts, lockoutTime, admin.admin_id]
            );

            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Reset failed login attempts on successful login
        await executeQuery(
            'UPDATE admins SET failed_login_attempts = 0, account_locked_until = NULL, last_login = NOW() WHERE admin_id = ?',
            [admin.admin_id]
        );

        // Generate tokens
        const token = generateToken({
            id: admin.admin_id,
            username: admin.username,
            role: admin.role,
            type: 'admin'
        });

        const refreshToken = generateRefreshToken({
            id: admin.admin_id,
            type: 'admin'
        });

        // Create session record
        await executeQuery(
            'INSERT INTO admin_sessions (admin_id, session_token, ip_address, user_agent) VALUES (?, ?, ?, ?)',
            [admin.admin_id, token, req.ip, req.get('User-Agent')]
        );

        // Notify other admins about admin login
        const realtimeService = req.app.get('realtime');
        if (realtimeService) {
            realtimeService.handleAdminLogin({
                id: admin.admin_id,
                username: admin.username,
                name: `${admin.first_name} ${admin.last_name}`,
                role: admin.role
            });
        }

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                token,
                refreshToken,
                admin: {
                    id: admin.admin_id,
                    username: admin.username,
                    email: admin.email,
                    name: `${admin.first_name} ${admin.last_name}`,
                    role: admin.role,
                    status: admin.status
                }
            }
        });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed'
        });
    }
});

// Refresh token
router.post('/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                message: 'Refresh token required'
            });
        }

        const decoded = verifyToken(refreshToken);
        
        let user;
        if (decoded.type === 'member') {
            user = await getOne(
                'SELECT member_id, email, status FROM members WHERE member_id = ?',
                [decoded.id]
            );
        } else if (decoded.type === 'admin') {
            user = await getOne(
                'SELECT admin_id, username, email, role, status FROM admins WHERE admin_id = ?',
                [decoded.id]
            );
        }

        if (!user || user.status !== 'Active') {
            return res.status(401).json({
                success: false,
                message: 'Invalid refresh token'
            });
        }

        // Generate new access token
        const newToken = generateToken({
            id: decoded.type === 'member' ? user.member_id : user.admin_id,
            ...(decoded.type === 'member' ? { email: user.email } : { username: user.username, role: user.role }),
            type: decoded.type
        });

        res.json({
            success: true,
            data: {
                token: newToken
            }
        });
    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(401).json({
            success: false,
            message: 'Invalid refresh token'
        });
    }
});

// Logout
router.post('/logout', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            
            try {
                const decoded = verifyToken(token);
                
                // Deactivate session
                if (decoded.type === 'member') {
                    await executeQuery(
                        'UPDATE member_sessions SET is_active = FALSE WHERE session_token = ?',
                        [token]
                    );
                } else if (decoded.type === 'admin') {
                    await executeQuery(
                        'UPDATE admin_sessions SET is_active = FALSE WHERE session_token = ?',
                        [token]
                    );
                }
            } catch (error) {
                // Token might be invalid, but we still want to respond with success
            }
        }

        res.json({
            success: true,
            message: 'Logout successful'
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Logout failed'
        });
    }
});

module.exports = router;
