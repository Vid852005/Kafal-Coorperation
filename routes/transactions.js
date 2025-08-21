const express = require('express');
const { body, validationResult } = require('express-validator');
const { executeQuery, getOne } = require('../config/database');
const { authenticateMember, authenticateAdmin } = require('../middleware/auth');

const router = express.Router();

// Get member's transaction history
router.get('/my-transactions', authenticateMember, async (req, res) => {
    try {
        const { page = 1, limit = 20, type, start_date, end_date } = req.query;
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE member_id = ?';
        let params = [req.member.member_id];

        if (type) {
            whereClause += ' AND transaction_type = ?';
            params.push(type);
        }

        if (start_date) {
            whereClause += ' AND DATE(transaction_date) >= ?';
            params.push(start_date);
        }

        if (end_date) {
            whereClause += ' AND DATE(transaction_date) <= ?';
            params.push(end_date);
        }

        const transactions = await executeQuery(
            `SELECT transaction_id, transaction_number, transaction_type, amount, 
             balance_after, reference_type, reference_id, description, transaction_date
             FROM transactions ${whereClause}
             ORDER BY transaction_date DESC
             LIMIT ? OFFSET ?`,
            [...params, parseInt(limit), parseInt(offset)]
        );

        // Get total count
        const [{ total }] = await executeQuery(
            `SELECT COUNT(*) as total FROM transactions ${whereClause}`,
            params
        );

        res.json({
            success: true,
            data: {
                transactions,
                pagination: {
                    current_page: parseInt(page),
                    per_page: parseInt(limit),
                    total_records: total,
                    total_pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('Get member transactions error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch transactions'
        });
    }
});

// Get all transactions (admin only)
router.get('/', authenticateAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 20, type, member_id, start_date, end_date } = req.query;
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE 1=1';
        let params = [];

        if (type) {
            whereClause += ' AND t.transaction_type = ?';
            params.push(type);
        }

        if (member_id) {
            whereClause += ' AND t.member_id = ?';
            params.push(member_id);
        }

        if (start_date) {
            whereClause += ' AND DATE(t.transaction_date) >= ?';
            params.push(start_date);
        }

        if (end_date) {
            whereClause += ' AND DATE(t.transaction_date) <= ?';
            params.push(end_date);
        }

        const transactions = await executeQuery(
            `SELECT t.*, m.first_name, m.last_name, m.email
             FROM transactions t
             JOIN members m ON t.member_id = m.member_id
             ${whereClause}
             ORDER BY t.transaction_date DESC
             LIMIT ? OFFSET ?`,
            [...params, parseInt(limit), parseInt(offset)]
        );

        // Get total count
        const [{ total }] = await executeQuery(
            `SELECT COUNT(*) as total FROM transactions t ${whereClause}`,
            params
        );

        res.json({
            success: true,
            data: {
                transactions,
                pagination: {
                    current_page: parseInt(page),
                    per_page: parseInt(limit),
                    total_records: total,
                    total_pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch transactions'
        });
    }
});

// Get transaction by ID
router.get('/:id', authenticateAdmin, async (req, res) => {
    try {
        const transaction = await getOne(
            `SELECT t.*, m.first_name, m.last_name, m.email, m.phone
             FROM transactions t
             JOIN members m ON t.member_id = m.member_id
             WHERE t.transaction_id = ?`,
            [req.params.id]
        );

        if (!transaction) {
            return res.status(404).json({
                success: false,
                message: 'Transaction not found'
            });
        }

        res.json({
            success: true,
            data: transaction
        });
    } catch (error) {
        console.error('Get transaction error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch transaction'
        });
    }
});

// Get transaction summary for member
router.get('/summary/member/:id', authenticateAdmin, async (req, res) => {
    try {
        const memberId = req.params.id;

        const summary = await executeQuery(
            `SELECT 
                transaction_type,
                COUNT(*) as count,
                SUM(amount) as total_amount,
                AVG(amount) as avg_amount
             FROM transactions 
             WHERE member_id = ? 
             GROUP BY transaction_type`,
            [memberId]
        );

        // Get recent transactions
        const recentTransactions = await executeQuery(
            `SELECT transaction_id, transaction_number, transaction_type, amount, 
             description, transaction_date
             FROM transactions 
             WHERE member_id = ?
             ORDER BY transaction_date DESC
             LIMIT 10`,
            [memberId]
        );

        res.json({
            success: true,
            data: {
                summary,
                recent_transactions: recentTransactions
            }
        });
    } catch (error) {
        console.error('Get transaction summary error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch transaction summary'
        });
    }
});

// Get monthly transaction report (admin only)
router.get('/reports/monthly', authenticateAdmin, async (req, res) => {
    try {
        const { year = new Date().getFullYear(), month } = req.query;

        let dateFilter = 'WHERE YEAR(transaction_date) = ?';
        let params = [year];

        if (month) {
            dateFilter += ' AND MONTH(transaction_date) = ?';
            params.push(month);
        }

        const monthlyReport = await executeQuery(
            `SELECT 
                MONTH(transaction_date) as month,
                transaction_type,
                COUNT(*) as transaction_count,
                SUM(amount) as total_amount
             FROM transactions 
             ${dateFilter}
             GROUP BY MONTH(transaction_date), transaction_type
             ORDER BY month, transaction_type`,
            params
        );

        // Get daily totals for the period
        const dailyTotals = await executeQuery(
            `SELECT 
                DATE(transaction_date) as date,
                COUNT(*) as transaction_count,
                SUM(CASE WHEN transaction_type IN ('Deposit', 'Interest Credit') THEN amount ELSE 0 END) as total_credits,
                SUM(CASE WHEN transaction_type IN ('Withdrawal', 'Loan Payment', 'Fee') THEN amount ELSE 0 END) as total_debits
             FROM transactions 
             ${dateFilter}
             GROUP BY DATE(transaction_date)
             ORDER BY date`,
            params
        );

        res.json({
            success: true,
            data: {
                monthly_summary: monthlyReport,
                daily_totals: dailyTotals
            }
        });
    } catch (error) {
        console.error('Get monthly report error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch monthly report'
        });
    }
});

module.exports = router;
