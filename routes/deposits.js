const express = require('express');
const { body, validationResult } = require('express-validator');
const { executeQuery, getOne, transaction } = require('../config/database');
const { authenticateMember, authenticateAdmin, requireRole } = require('../middleware/auth');

const router = express.Router();

// Create new deposit (member only)
router.post('/create', authenticateMember, [
    body('deposit_type').isIn(['Fixed Deposit', 'Recurring Deposit', 'Savings', 'Current']),
    body('principal_amount').isFloat({ min: 1000 }),
    body('tenure_months').optional().isInt({ min: 6, max: 120 }),
    body('auto_renewal').optional().isBoolean()
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

        const { deposit_type, principal_amount, tenure_months, auto_renewal } = req.body;

        // Validate tenure for deposit types that require it
        if ((deposit_type === 'Fixed Deposit' || deposit_type === 'Recurring Deposit') && !tenure_months) {
            return res.status(400).json({
                success: false,
                message: 'Tenure is required for Fixed and Recurring deposits'
            });
        }

        // Set interest rates based on deposit type
        const interestRates = {
            'Fixed Deposit': 8.5,
            'Recurring Deposit': 8.0,
            'Savings': 4.0,
            'Current': 0.0
        };

        const interest_rate = interestRates[deposit_type];
        
        // Calculate maturity amount for fixed deposits
        let maturity_amount = null;
        let maturity_date = null;
        
        if (deposit_type === 'Fixed Deposit' && tenure_months) {
            const rate = interest_rate / 100;
            maturity_amount = principal_amount * Math.pow(1 + rate / 12, tenure_months);
            maturity_date = new Date();
            maturity_date.setMonth(maturity_date.getMonth() + tenure_months);
        } else if (deposit_type === 'Recurring Deposit' && tenure_months) {
            // RD maturity calculation: P * n * (n+1) * r / (2 * 12) + P * n
            const monthlyRate = interest_rate / 100 / 12;
            maturity_amount = principal_amount * tenure_months + 
                             (principal_amount * tenure_months * (tenure_months + 1) * monthlyRate / 2);
            maturity_date = new Date();
            maturity_date.setMonth(maturity_date.getMonth() + tenure_months);
        }

        // Generate deposit number
        const [lastDeposit] = await executeQuery(
            'SELECT deposit_number FROM deposits ORDER BY deposit_id DESC LIMIT 1'
        );

        let depositNumber = 'FD001';
        if (lastDeposit.length > 0) {
            const lastNumber = parseInt(lastDeposit[0].deposit_number.substring(2));
            const prefix = deposit_type === 'Fixed Deposit' ? 'FD' : 
                          deposit_type === 'Recurring Deposit' ? 'RD' : 
                          deposit_type === 'Savings' ? 'SAV' : 'CUR';
            depositNumber = `${prefix}${String(lastNumber + 1).padStart(3, '0')}`;
        }

        const result = await executeQuery(
            `INSERT INTO deposits 
             (deposit_number, member_id, deposit_type, principal_amount, interest_rate, 
              tenure_months, maturity_amount, deposit_date, maturity_date, status, 
              auto_renewal, current_balance, processed_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE(), ?, 'Active', ?, ?, ?)`,
            [depositNumber, req.member.member_id, deposit_type, principal_amount, 
             interest_rate, tenure_months, maturity_amount, maturity_date, 
             auto_renewal || false, principal_amount, null]
        );

        // Create transaction record
        await executeQuery(
            `INSERT INTO transactions 
             (transaction_number, member_id, transaction_type, amount, balance_after, 
              reference_type, reference_id, description)
             VALUES (?, ?, 'Deposit', ?, ?, 'Deposit', ?, ?)`,
            [`TXN${Date.now()}`, req.member.member_id, principal_amount, 
             principal_amount, result.insertId, `${deposit_type} - Initial deposit`]
        );

        res.status(201).json({
            success: true,
            message: 'Deposit created successfully',
            data: {
                deposit_id: result.insertId,
                deposit_number: depositNumber,
                maturity_amount: maturity_amount ? Math.round(maturity_amount * 100) / 100 : null,
                maturity_date
            }
        });
    } catch (error) {
        console.error('Create deposit error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create deposit'
        });
    }
});

// Get member's deposits
router.get('/my-deposits', authenticateMember, async (req, res) => {
    try {
        const deposits = await executeQuery(
            `SELECT deposit_id, deposit_number, deposit_type, principal_amount, 
             interest_rate, tenure_months, maturity_amount, deposit_date, 
             maturity_date, status, current_balance, auto_renewal
             FROM deposits WHERE member_id = ?
             ORDER BY deposit_date DESC`,
            [req.member.member_id]
        );

        res.json({
            success: true,
            data: deposits
        });
    } catch (error) {
        console.error('Get member deposits error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch deposits'
        });
    }
});

// Get all deposits (admin only)
router.get('/', authenticateAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 10, status, deposit_type, member_id } = req.query;
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE 1=1';
        let params = [];

        if (status) {
            whereClause += ' AND d.status = ?';
            params.push(status);
        }

        if (deposit_type) {
            whereClause += ' AND d.deposit_type = ?';
            params.push(deposit_type);
        }

        if (member_id) {
            whereClause += ' AND d.member_id = ?';
            params.push(member_id);
        }

        const deposits = await executeQuery(
            `SELECT d.*, m.first_name, m.last_name, m.email, m.phone
             FROM deposits d
             JOIN members m ON d.member_id = m.member_id
             ${whereClause}
             ORDER BY d.deposit_date DESC
             LIMIT ? OFFSET ?`,
            [...params, parseInt(limit), parseInt(offset)]
        );

        // Get total count
        const [{ total }] = await executeQuery(
            `SELECT COUNT(*) as total FROM deposits d ${whereClause}`,
            params
        );

        res.json({
            success: true,
            data: {
                deposits,
                pagination: {
                    current_page: parseInt(page),
                    per_page: parseInt(limit),
                    total_records: total,
                    total_pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('Get deposits error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch deposits'
        });
    }
});

// Get deposit by ID
router.get('/:id', authenticateAdmin, async (req, res) => {
    try {
        const deposit = await getOne(
            `SELECT d.*, m.first_name, m.last_name, m.email, m.phone, m.address
             FROM deposits d
             JOIN members m ON d.member_id = m.member_id
             WHERE d.deposit_id = ?`,
            [req.params.id]
        );

        if (!deposit) {
            return res.status(404).json({
                success: false,
                message: 'Deposit not found'
            });
        }

        res.json({
            success: true,
            data: deposit
        });
    } catch (error) {
        console.error('Get deposit error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch deposit'
        });
    }
});

// Credit interest (admin only)
router.post('/:id/credit-interest', authenticateAdmin, requireRole(['Super Admin', 'Admin']), async (req, res) => {
    try {
        const depositId = req.params.id;

        await transaction(async (connection) => {
            // Get deposit details
            const [deposit] = await connection.execute(
                'SELECT * FROM deposits WHERE deposit_id = ? AND status = "Active"',
                [depositId]
            );

            if (!deposit.length) {
                throw new Error('Deposit not found or not active');
            }

            const depositData = deposit[0];
            
            // Calculate interest based on deposit type
            let interestAmount = 0;
            const monthlyRate = depositData.interest_rate / 100 / 12;
            
            if (depositData.deposit_type === 'Savings' || depositData.deposit_type === 'Current') {
                // Quarterly interest for savings
                interestAmount = depositData.current_balance * (depositData.interest_rate / 100 / 4);
            } else if (depositData.deposit_type === 'Fixed Deposit') {
                // Monthly interest for FD
                interestAmount = depositData.principal_amount * monthlyRate;
            }

            if (interestAmount > 0) {
                const newBalance = parseFloat(depositData.current_balance) + interestAmount;

                // Update deposit balance
                await connection.execute(
                    'UPDATE deposits SET current_balance = ?, last_interest_credited = CURDATE(), updated_at = NOW() WHERE deposit_id = ?',
                    [newBalance, depositId]
                );

                // Create transaction record
                await connection.execute(
                    `INSERT INTO transactions 
                     (transaction_number, member_id, transaction_type, amount, balance_after, 
                      reference_type, reference_id, description, processed_by)
                     VALUES (?, ?, 'Interest Credit', ?, ?, 'Deposit', ?, ?, ?)`,
                    [`TXN${Date.now()}`, depositData.member_id, interestAmount, 
                     newBalance, depositId, `Interest credit for ${depositData.deposit_number}`, req.admin.admin_id]
                );
            }
        });

        // Log the action
        await executeQuery(
            `INSERT INTO audit_logs (user_type, user_id, action, table_name, record_id, 
             ip_address, user_agent) 
             VALUES ('Admin', ?, 'CREDIT_INTEREST', 'deposits', ?, ?, ?)`,
            [req.admin.admin_id, depositId, req.ip, req.get('User-Agent')]
        );

        res.json({
            success: true,
            message: 'Interest credited successfully'
        });
    } catch (error) {
        console.error('Credit interest error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to credit interest'
        });
    }
});

// Close deposit (premature closure)
router.put('/:id/close', authenticateAdmin, requireRole(['Super Admin', 'Admin']), [
    body('closure_reason').isLength({ min: 10, max: 500 })
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

        const depositId = req.params.id;
        const { closure_reason } = req.body;

        await transaction(async (connection) => {
            // Get deposit details
            const [deposit] = await connection.execute(
                'SELECT * FROM deposits WHERE deposit_id = ? AND status = "Active"',
                [depositId]
            );

            if (!deposit.length) {
                throw new Error('Deposit not found or not active');
            }

            const depositData = deposit[0];

            // Update deposit status
            await connection.execute(
                'UPDATE deposits SET status = "Premature Closure", updated_at = NOW() WHERE deposit_id = ?',
                [depositId]
            );

            // Create withdrawal transaction for current balance
            await connection.execute(
                `INSERT INTO transactions 
                 (transaction_number, member_id, transaction_type, amount, balance_after, 
                  reference_type, reference_id, description, processed_by)
                 VALUES (?, ?, 'Withdrawal', ?, 0, 'Deposit', ?, ?, ?)`,
                [`TXN${Date.now()}`, depositData.member_id, depositData.current_balance, 
                 depositId, `Premature closure - ${closure_reason}`, req.admin.admin_id]
            );
        });

        // Log the action
        await executeQuery(
            `INSERT INTO audit_logs (user_type, user_id, action, table_name, record_id, 
             new_values, ip_address, user_agent) 
             VALUES ('Admin', ?, 'CLOSE_DEPOSIT', 'deposits', ?, ?, ?, ?)`,
            [req.admin.admin_id, depositId, JSON.stringify({ status: 'Premature Closure', closure_reason }), req.ip, req.get('User-Agent')]
        );

        res.json({
            success: true,
            message: 'Deposit closed successfully'
        });
    } catch (error) {
        console.error('Close deposit error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to close deposit'
        });
    }
});

module.exports = router;
