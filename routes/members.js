const express = require('express');
const { body, validationResult } = require('express-validator');
const { executeQuery, getOne } = require('../config/database');
const { authenticateMember, authenticateAdmin, requireRole } = require('../middleware/auth');

const router = express.Router();

// Get member profile (for logged-in member)
router.get('/profile', authenticateMember, async (req, res) => {
    try {
        const member = await getOne(
            `SELECT member_id, member_number, first_name, last_name, email, phone, 
             address, date_of_birth, gender, occupation, annual_income, member_type, 
             status, join_date FROM members WHERE member_id = ?`,
            [req.member.member_id]
        );

        if (!member) {
            return res.status(404).json({
                success: false,
                message: 'Member not found'
            });
        }

        res.json({
            success: true,
            data: member
        });
    } catch (error) {
        console.error('Get member profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch member profile'
        });
    }
});

// Update member profile
router.put('/profile', authenticateMember, [
    body('first_name').optional().isLength({ min: 2, max: 50 }),
    body('last_name').optional().isLength({ min: 2, max: 50 }),
    body('phone').optional().matches(/^\+?[1-9]\d{1,14}$/),
    body('address').optional().isLength({ min: 10, max: 500 }),
    body('occupation').optional().isLength({ max: 100 }),
    body('annual_income').optional().isFloat({ min: 0 })
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

        const allowedFields = ['first_name', 'last_name', 'phone', 'address', 'occupation', 'annual_income'];
        const updates = {};
        
        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        });

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid fields to update'
            });
        }

        const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
        const values = [...Object.values(updates), req.member.member_id];

        await executeQuery(
            `UPDATE members SET ${setClause}, updated_at = NOW() WHERE member_id = ?`,
            values
        );

        res.json({
            success: true,
            message: 'Profile updated successfully'
        });
    } catch (error) {
        console.error('Update member profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update profile'
        });
    }
});

// Submit member registration request
router.post('/register', [
    body('firstName').isLength({ min: 2 }).withMessage('First name must be at least 2 characters'),
    body('lastName').isLength({ min: 2 }).withMessage('Last name must be at least 2 characters'),
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('phone').isMobilePhone().withMessage('Please provide a valid phone number'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
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

        const { firstName, lastName, email, phone, dateOfBirth, address, accountType, initialDeposit, password } = req.body;

        // Check if email already exists in members or pending requests
        const existingMember = await getOne('SELECT member_id FROM members WHERE email = ?', [email]);
        const existingRequest = await getOne('SELECT request_id FROM member_requests WHERE email = ? AND status = "pending"', [email]);

        if (existingMember) {
            return res.status(409).json({
                success: false,
                message: 'Email already registered as a member'
            });
        }

        if (existingRequest) {
            return res.status(409).json({
                success: false,
                message: 'Registration request already pending for this email'
            });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 12);

        // Create member registration request (NOT a member yet)
        const result = await executeQuery(`
            INSERT INTO member_requests 
            (first_name, last_name, email, phone, date_of_birth, address, account_type, initial_deposit, password_hash, status, request_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NOW())
        `, [firstName, lastName, email, phone, dateOfBirth, address, accountType, initialDeposit, passwordHash]);

        // Send real-time notification to admins
        const realtimeService = req.app.get('realtime');
        if (realtimeService) {
            await realtimeService.notifyAdmins('new_member_request', {
                requestId: result.insertId,
                memberName: `${firstName} ${lastName}`,
                email: email,
                accountType: accountType,
                initialDeposit: initialDeposit,
                timestamp: new Date().toISOString()
            });
        }

        res.status(201).json({
            success: true,
            message: 'Registration request submitted successfully. Please wait for admin approval.',
            data: {
                requestId: result.insertId,
                status: 'pending'
            }
        });

    } catch (error) {
        console.error('Member registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed'
        });
    }
});

// Get all members (admin only)
router.get('/', authenticateAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 10, status, member_type, search } = req.query;
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE 1=1';
        let params = [];

        if (status) {
            whereClause += ' AND status = ?';
            params.push(status);
        }

        if (member_type) {
            whereClause += ' AND member_type = ?';
            params.push(member_type);
        }

        if (search) {
            whereClause += ' AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone LIKE ?)';
            const searchTerm = `%${search}%`;
            params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        const members = await executeQuery(
            `SELECT member_id, member_number, first_name, last_name, email, phone, 
             member_type, status, join_date, created_at
             FROM members ${whereClause}
             ORDER BY created_at DESC
             LIMIT ? OFFSET ?`,
            [...params, parseInt(limit), parseInt(offset)]
        );

        // Get total count
        const [{ total }] = await executeQuery(
            `SELECT COUNT(*) as total FROM members ${whereClause}`,
            params
        );

        res.json({
            success: true,
            data: {
                members,
                pagination: {
                    current_page: parseInt(page),
                    per_page: parseInt(limit),
                    total_records: total,
                    total_pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('Get members error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch members'
        });
    }
});

// Get member by ID (admin only)
router.get('/:id', authenticateAdmin, async (req, res) => {
    try {
        const member = await getOne(
            `SELECT * FROM members WHERE member_id = ?`,
            [req.params.id]
        );

        if (!member) {
            return res.status(404).json({
                success: false,
                message: 'Member not found'
            });
        }

        res.json({
            success: true,
            data: member
        });
    } catch (error) {
        console.error('Get member error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch member'
        });
    }
});

// Update member status (admin only)
router.put('/:id/status', authenticateAdmin, requireRole(['Super Admin', 'Admin']), [
    body('status').isIn(['Active', 'Inactive', 'Suspended'])
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

        const { status } = req.body;
        const memberId = req.params.id;

        const member = await getOne('SELECT member_id FROM members WHERE member_id = ?', [memberId]);
        if (!member) {
            return res.status(404).json({
                success: false,
                message: 'Member not found'
            });
        }

        await executeQuery(
            'UPDATE members SET status = ?, updated_at = NOW() WHERE member_id = ?',
            [status, memberId]
        );

        // Log the action
        await executeQuery(
            `INSERT INTO audit_logs (user_type, user_id, action, table_name, record_id, 
             new_values, ip_address, user_agent) 
             VALUES ('Admin', ?, 'UPDATE_MEMBER_STATUS', 'members', ?, ?, ?, ?)`,
            [req.admin.admin_id, memberId, JSON.stringify({ status }), req.ip, req.get('User-Agent')]
        );

        res.json({
            success: true,
            message: 'Member status updated successfully'
        });
    } catch (error) {
        console.error('Update member status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update member status'
        });
    }
});

module.exports = router;
