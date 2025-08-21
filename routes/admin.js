const express = require('express');
const { body, validationResult } = require('express-validator');
const { executeQuery, getOne, transaction } = require('../config/database');
const { authenticateAdmin, requireRole } = require('../middleware/auth');

const router = express.Router();

// Get all member requests
router.get('/member-requests', authenticateAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 10, status, search } = req.query;
        const offset = (page - 1) * limit;
        
        let whereClause = '';
        let queryParams = [];
        
        if (status) {
            whereClause = 'WHERE status = ?';
            queryParams.push(status);
        }
        
        const requests = await executeQuery(`
            SELECT request_id, first_name, last_name, email, phone, 
                   date_of_birth, address, account_type, initial_deposit,
                   status, request_date, admin_notes, processed_by, processed_at
            FROM member_requests 
            ${whereClause}
            ORDER BY request_date DESC 
            LIMIT ? OFFSET ?
        `, [...queryParams, parseInt(limit), offset]);
        
        const totalCount = await getOne(`
            SELECT COUNT(*) as count FROM member_requests ${whereClause}
        `, queryParams);
        
        res.json({
            success: true,
            data: {
                requests,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: totalCount.count,
                    pages: Math.ceil(totalCount.count / limit)
                }
            }
        });
    } catch (error) {
        console.error('Get member requests error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch member requests'
        });
    }
});

// Approve member registration request
router.post('/member-requests/:requestId/approve', authenticateAdmin, async (req, res) => {
    try {
        const { requestId } = req.params;
        const { adminNotes } = req.body;
        const adminId = req.admin.admin_id;

        // Get the pending request
        const request = await getOne(`
            SELECT * FROM member_requests 
            WHERE request_id = ? AND status = 'pending'
        `, [requestId]);

        if (!request) {
            return res.status(404).json({
                success: false,
                message: 'Pending request not found'
            });
        }

        // Generate unique account number
        const accountNumber = await generateAccountNumber();

        // Start transaction
        await executeQuery('START TRANSACTION');

        try {
            // Create member account
            const memberResult = await executeQuery(`
                INSERT INTO members 
                (account_number, first_name, last_name, email, phone, date_of_birth, 
                 address, account_type, password_hash, balance, status, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW())
            `, [
                accountNumber,
                request.first_name,
                request.last_name,
                request.email,
                request.phone,
                request.date_of_birth,
                request.address,
                request.account_type,
                request.password_hash,
                request.initial_deposit
            ]);

            // Create initial deposit transaction
            await executeQuery(`
                INSERT INTO transactions 
                (member_id, transaction_type, amount, description, balance_after, created_at)
                VALUES (?, 'deposit', ?, 'Initial deposit', ?, NOW())
            `, [memberResult.insertId, request.initial_deposit, request.initial_deposit]);

            // Update request status
            await executeQuery(`
                UPDATE member_requests 
                SET status = 'approved', processed_by = ?, processed_at = NOW(), admin_notes = ?
                WHERE request_id = ?
            `, [adminId, adminNotes || 'Request approved', requestId]);

            await executeQuery('COMMIT');

            // Send real-time notification to the new member
            const realtimeService = req.app.get('realtime');
            if (realtimeService) {
                await realtimeService.notifyMember(memberResult.insertId, 'account_approved', {
                    accountNumber: accountNumber,
                    memberName: `${request.first_name} ${request.last_name}`,
                    initialDeposit: request.initial_deposit,
                    timestamp: new Date().toISOString()
                });
            }

            res.json({
                success: true,
                message: 'Member registration approved successfully',
                data: {
                    memberId: memberResult.insertId,
                    accountNumber: accountNumber
                }
            });

        } catch (error) {
            await executeQuery('ROLLBACK');
            throw error;
        }

    } catch (error) {
        console.error('Approve member request error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to approve member request'
        });
    }
});

// Reject member registration request
router.post('/member-requests/:requestId/reject', authenticateAdmin, async (req, res) => {
    try {
        const { requestId } = req.params;
        const { adminNotes } = req.body;
        const adminId = req.admin.admin_id;

        // Get the pending request
        const request = await getOne(`
            SELECT * FROM member_requests 
            WHERE request_id = ? AND status = 'pending'
        `, [requestId]);

        if (!request) {
            return res.status(404).json({
                success: false,
                message: 'Pending request not found'
            });
        }

        // Update request status
        await executeQuery(`
            UPDATE member_requests 
            SET status = 'rejected', processed_by = ?, processed_at = NOW(), admin_notes = ?
            WHERE request_id = ?
        `, [adminId, adminNotes || 'Request rejected', requestId]);

        res.json({
            success: true,
            message: 'Member registration rejected',
            data: {
                requestId: requestId,
                status: 'rejected'
            }
        });

    } catch (error) {
        console.error('Reject member request error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reject member request'
        });
    }
});

// Helper function to generate unique account number
async function generateAccountNumber() {
    const prefix = 'KCS';
    const year = new Date().getFullYear();
    
    // Get the last account number for this year
    const lastAccount = await getOne(`
        SELECT account_number FROM members 
        WHERE account_number LIKE ? 
        ORDER BY account_number DESC LIMIT 1
    `, [`${prefix}${year}%`]);
    
    let nextNumber = 1;
    if (lastAccount) {
        const lastNumber = parseInt(lastAccount.account_number.slice(-3));
        nextNumber = lastNumber + 1;
    }
    
    return `${prefix}${year}${nextNumber.toString().padStart(3, '0')}`;
}

// Get member request by ID
router.get('/member-requests/:id', authenticateAdmin, async (req, res) => {
    try {
        const request = await getOne(
            'SELECT * FROM member_requests WHERE request_id = ?',
            [req.params.id]
        );

        if (!request) {
            return res.status(404).json({
                success: false,
                message: 'Member request not found'
            });
        }

        res.json({
            success: true,
            data: request
        });
    } catch (error) {
        console.error('Get member request error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch member request'
        });
    }
});

// Approve member request
router.put('/member-requests/:id/approve', authenticateAdmin, requireRole(['Super Admin', 'Admin']), [
    body('admin_notes').optional().isLength({ max: 500 })
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

        const requestId = req.params.id;
        const { admin_notes } = req.body;

        await transaction(async (connection) => {
            // Get the request details
            const [request] = await connection.execute(
                'SELECT * FROM member_requests WHERE request_id = ? AND status = "Pending"',
                [requestId]
            );

            if (!request.length) {
                throw new Error('Request not found or already processed');
            }

            const requestData = request[0];

            // Generate member number
            const [lastMember] = await connection.execute(
                'SELECT member_number FROM members ORDER BY member_id DESC LIMIT 1'
            );

            let memberNumber = 'MEM001';
            if (lastMember.length > 0) {
                const lastNumber = parseInt(lastMember[0].member_number.substring(3));
                memberNumber = `MEM${String(lastNumber + 1).padStart(3, '0')}`;
            }

            // Create member account
            const [memberResult] = await connection.execute(
                `INSERT INTO members 
                 (member_number, first_name, last_name, email, phone, address, date_of_birth, 
                  gender, occupation, annual_income, member_type, status, join_date)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Regular', 'Active', NOW())`,
                [memberNumber, requestData.first_name, requestData.last_name, requestData.email,
                 requestData.phone, requestData.address, requestData.date_of_birth,
                 requestData.gender, requestData.occupation, requestData.annual_income]
            );

            // Update request status
            await connection.execute(
                'UPDATE member_requests SET status = "Approved", admin_notes = ?, processed_by = ?, processed_at = NOW() WHERE request_id = ?',
                [admin_notes || 'Approved by admin', req.admin.admin_id, requestId]
            );

            // Log the action
            await connection.execute(
                `INSERT INTO audit_logs (user_type, user_id, action, table_name, record_id, 
                 new_values, ip_address, user_agent) 
                 VALUES ('Admin', ?, 'APPROVE_MEMBER_REQUEST', 'member_requests', ?, ?, ?, ?)`,
                [req.admin.admin_id, requestId, JSON.stringify({ 
                    status: 'Approved', 
                    member_id: memberResult.insertId,
                    member_number: memberNumber 
                }), req.ip, req.get('User-Agent')]
            );

            return { member_id: memberResult.insertId, member_number: memberNumber };
        });

        res.json({
            success: true,
            message: 'Member request approved successfully'
        });
    } catch (error) {
        console.error('Approve member request error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to approve member request'

// Reject member registration request
router.put('/member-requests/:id/reject', authenticateAdmin, requireRole(['super_admin', 'admin']), [
    body('admin_notes').isLength({ min: 10, max: 500 })
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

        const requestId = req.params.id;
        const { admin_notes } = req.body;

        const request = await getOne(
            'SELECT request_id FROM member_requests WHERE request_id = ? AND status = "Pending"',
            [requestId]
        );

        if (!request) {
            return res.status(404).json({
                success: false,
                message: 'Request not found or already processed'
            });
        }

        await executeQuery(
            'UPDATE member_requests SET status = "Rejected", admin_notes = ?, processed_by = ?, processed_at = NOW() WHERE request_id = ?',
            [admin_notes, req.admin.admin_id, requestId]
        );

        // Log the action
        await executeQuery(
            `INSERT INTO audit_logs (user_type, user_id, action, table_name, record_id, 
             new_values, ip_address, user_agent) 
             VALUES ('Admin', ?, 'REJECT_MEMBER_REQUEST', 'member_requests', ?, ?, ?, ?)`,
            [req.admin.admin_id, requestId, JSON.stringify({ status: 'Rejected', admin_notes }), req.ip, req.get('User-Agent')]
        );

        res.json({
            success: true,
            message: 'Member request rejected successfully'
        });
    } catch (error) {
        console.error('Reject member request error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reject member request'
        });
    }
});

// Get dashboard statistics
router.get('/dashboard/stats', authenticateAdmin, async (req, res) => {
    try {
        const stats = await Promise.all([
            // Total members
            executeQuery('SELECT COUNT(*) as count FROM members WHERE status = "Active"'),
            // Pending requests
            executeQuery('SELECT COUNT(*) as count FROM member_requests WHERE status = "Pending"'),
            // Approved requests today
            executeQuery('SELECT COUNT(*) as count FROM member_requests WHERE status = "Approved" AND DATE(processed_at) = CURDATE()'),
            // Active notices
            executeQuery('SELECT COUNT(*) as count FROM notices WHERE status = "Active"'),
            // Active loans
            executeQuery('SELECT COUNT(*) as count FROM loans WHERE status IN ("Active", "Disbursed")'),
            // Total deposits
            executeQuery('SELECT SUM(current_balance) as total FROM deposits WHERE status = "Active"')
        ]);

        res.json({
            success: true,
            data: {
                total_members: stats[0][0].count,
                pending_requests: stats[1][0].count,
                approved_today: stats[2][0].count,
                active_notices: stats[3][0].count,
                active_loans: stats[4][0].count,
                total_deposits: stats[5][0].total || 0
            }
        });
    } catch (error) {
        console.error('Get dashboard stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch dashboard statistics'
        });
    }
});

// Get recent activities
router.get('/dashboard/activities', authenticateAdmin, async (req, res) => {
    try {
        const activities = await executeQuery(
            `SELECT al.*, a.username as admin_name 
             FROM audit_logs al
             LEFT JOIN admins a ON al.user_id = a.admin_id AND al.user_type = 'Admin'
             ORDER BY al.timestamp DESC
             LIMIT 20`
        );

        res.json({
            success: true,
            data: activities
        });
    } catch (error) {
        console.error('Get recent activities error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch recent activities'
        });
    }
});

// Export members data (CSV)
router.get('/export/members', authenticateAdmin, requireRole(['Super Admin', 'Admin']), async (req, res) => {
    try {
        const members = await executeQuery(
            `SELECT member_number, first_name, last_name, email, phone, address, 
             date_of_birth, gender, occupation, annual_income, member_type, status, join_date
             FROM members ORDER BY join_date DESC`
        );

        // Convert to CSV format
        const csvHeader = 'Member Number,First Name,Last Name,Email,Phone,Address,Date of Birth,Gender,Occupation,Annual Income,Member Type,Status,Join Date\n';
        const csvData = members.map(member => 
            `"${member.member_number}","${member.first_name}","${member.last_name}","${member.email}","${member.phone}","${member.address}","${member.date_of_birth}","${member.gender}","${member.occupation}","${member.annual_income}","${member.member_type}","${member.status}","${member.join_date}"`
        ).join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=members_export.csv');
        res.send(csvHeader + csvData);

        // Log the export action
        await executeQuery(
            `INSERT INTO audit_logs (user_type, user_id, action, table_name, ip_address, user_agent) 
             VALUES ('Admin', ?, 'EXPORT_MEMBERS', 'members', ?, ?)`,
            [req.admin.admin_id, req.ip, req.get('User-Agent')]
        );
    } catch (error) {
        console.error('Export members error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to export members data'
        });
    }
});

module.exports = router;
