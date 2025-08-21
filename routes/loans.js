const express = require('express');
const { body, validationResult } = require('express-validator');
const { executeQuery, getOne, transaction } = require('../config/database');
const { authenticateMember, authenticateAdmin, requireRole } = require('../middleware/auth');

const router = express.Router();

// Apply for loan (member only)
router.post('/apply', authenticateMember, [
    body('loan_type').isIn(['Personal', 'Business', 'Education', 'Home', 'Vehicle', 'Emergency']),
    body('loan_amount').isFloat({ min: 1000, max: 1000000 }),
    body('tenure_months').isInt({ min: 6, max: 240 }),
    body('purpose').isLength({ min: 10, max: 500 }),
    body('guarantor_name').optional().isLength({ min: 2, max: 100 }),
    body('guarantor_phone').optional().matches(/^\+?[1-9]\d{1,14}$/),
    body('guarantor_address').optional().isLength({ min: 10, max: 500 })
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

        const {
            loan_type, loan_amount, tenure_months, purpose,
            guarantor_name, guarantor_phone, guarantor_address, collateral_details
        } = req.body;

        // Calculate interest rate based on loan type
        const interestRates = {
            'Personal': 12.5,
            'Business': 11.0,
            'Education': 10.5,
            'Home': 9.5,
            'Vehicle': 11.5,
            'Emergency': 13.0
        };

        const interest_rate = interestRates[loan_type];
        
        // Calculate EMI (simple calculation)
        const monthlyRate = interest_rate / 100 / 12;
        const monthly_emi = (loan_amount * monthlyRate * Math.pow(1 + monthlyRate, tenure_months)) / 
                           (Math.pow(1 + monthlyRate, tenure_months) - 1);

        // Generate loan number
        const [lastLoan] = await executeQuery(
            'SELECT loan_number FROM loans ORDER BY loan_id DESC LIMIT 1'
        );

        let loanNumber = 'LN001';
        if (lastLoan.length > 0) {
            const lastNumber = parseInt(lastLoan[0].loan_number.substring(2));
            loanNumber = `LN${String(lastNumber + 1).padStart(3, '0')}`;
        }

        const result = await executeQuery(
            `INSERT INTO loans 
             (loan_number, member_id, loan_type, loan_amount, interest_rate, tenure_months, 
              monthly_emi, purpose, collateral_details, guarantor_name, guarantor_phone, 
              guarantor_address, application_date, status, outstanding_amount)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE(), 'Applied', ?)`,
            [loanNumber, req.member.member_id, loan_type, loan_amount, interest_rate, 
             tenure_months, Math.round(monthly_emi * 100) / 100, purpose, collateral_details,
             guarantor_name, guarantor_phone, guarantor_address, loan_amount]
        );

        res.status(201).json({
            success: true,
            message: 'Loan application submitted successfully',
            data: {
                loan_id: result.insertId,
                loan_number: loanNumber,
                monthly_emi: Math.round(monthly_emi * 100) / 100
            }
        });
    } catch (error) {
        console.error('Loan application error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit loan application'
        });
    }
});

// Get member's loans
router.get('/my-loans', authenticateMember, async (req, res) => {
    try {
        const loans = await executeQuery(
            `SELECT loan_id, loan_number, loan_type, loan_amount, interest_rate, 
             tenure_months, monthly_emi, application_date, approval_date, 
             disbursement_date, status, outstanding_amount, total_paid, next_due_date
             FROM loans WHERE member_id = ?
             ORDER BY application_date DESC`,
            [req.member.member_id]
        );

        res.json({
            success: true,
            data: loans
        });
    } catch (error) {
        console.error('Get member loans error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch loans'
        });
    }
});

// Get all loans (admin only)
router.get('/', authenticateAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 10, status, loan_type, member_id } = req.query;
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE 1=1';
        let params = [];

        if (status) {
            whereClause += ' AND l.status = ?';
            params.push(status);
        }

        if (loan_type) {
            whereClause += ' AND l.loan_type = ?';
            params.push(loan_type);
        }

        if (member_id) {
            whereClause += ' AND l.member_id = ?';
            params.push(member_id);
        }

        const loans = await executeQuery(
            `SELECT l.*, m.first_name, m.last_name, m.email, m.phone
             FROM loans l
             JOIN members m ON l.member_id = m.member_id
             ${whereClause}
             ORDER BY l.application_date DESC
             LIMIT ? OFFSET ?`,
            [...params, parseInt(limit), parseInt(offset)]
        );

        // Get total count
        const [{ total }] = await executeQuery(
            `SELECT COUNT(*) as total FROM loans l ${whereClause}`,
            params
        );

        res.json({
            success: true,
            data: {
                loans,
                pagination: {
                    current_page: parseInt(page),
                    per_page: parseInt(limit),
                    total_records: total,
                    total_pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('Get loans error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch loans'
        });
    }
});

// Get loan by ID
router.get('/:id', authenticateAdmin, async (req, res) => {
    try {
        const loan = await getOne(
            `SELECT l.*, m.first_name, m.last_name, m.email, m.phone, m.address
             FROM loans l
             JOIN members m ON l.member_id = m.member_id
             WHERE l.loan_id = ?`,
            [req.params.id]
        );

        if (!loan) {
            return res.status(404).json({
                success: false,
                message: 'Loan not found'
            });
        }

        res.json({
            success: true,
            data: loan
        });
    } catch (error) {
        console.error('Get loan error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch loan'
        });
    }
});

// Approve loan (admin only)
router.put('/:id/approve', authenticateAdmin, requireRole(['Super Admin', 'Admin']), [
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

        const loanId = req.params.id;
        const { admin_notes } = req.body;

        const loan = await getOne(
            'SELECT loan_id, status FROM loans WHERE loan_id = ?',
            [loanId]
        );

        if (!loan) {
            return res.status(404).json({
                success: false,
                message: 'Loan not found'
            });
        }

        if (loan.status !== 'Applied' && loan.status !== 'Under Review') {
            return res.status(400).json({
                success: false,
                message: 'Loan cannot be approved in current status'
            });
        }

        await executeQuery(
            `UPDATE loans SET status = 'Approved', approval_date = CURDATE(), 
             processed_by = ?, admin_notes = ?, updated_at = NOW() 
             WHERE loan_id = ?`,
            [req.admin.admin_id, admin_notes || 'Approved by admin', loanId]
        );

        // Log the action
        await executeQuery(
            `INSERT INTO audit_logs (user_type, user_id, action, table_name, record_id, 
             new_values, ip_address, user_agent) 
             VALUES ('Admin', ?, 'APPROVE_LOAN', 'loans', ?, ?, ?, ?)`,
            [req.admin.admin_id, loanId, JSON.stringify({ status: 'Approved' }), req.ip, req.get('User-Agent')]
        );

        res.json({
            success: true,
            message: 'Loan approved successfully'
        });
    } catch (error) {
        console.error('Approve loan error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to approve loan'
        });
    }
});

// Reject loan (admin only)
router.put('/:id/reject', authenticateAdmin, requireRole(['Super Admin', 'Admin']), [
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

        const loanId = req.params.id;
        const { admin_notes } = req.body;

        const loan = await getOne(
            'SELECT loan_id, status FROM loans WHERE loan_id = ?',
            [loanId]
        );

        if (!loan) {
            return res.status(404).json({
                success: false,
                message: 'Loan not found'
            });
        }

        if (loan.status !== 'Applied' && loan.status !== 'Under Review') {
            return res.status(400).json({
                success: false,
                message: 'Loan cannot be rejected in current status'
            });
        }

        await executeQuery(
            `UPDATE loans SET status = 'Rejected', processed_by = ?, 
             admin_notes = ?, updated_at = NOW() WHERE loan_id = ?`,
            [req.admin.admin_id, admin_notes, loanId]
        );

        // Log the action
        await executeQuery(
            `INSERT INTO audit_logs (user_type, user_id, action, table_name, record_id, 
             new_values, ip_address, user_agent) 
             VALUES ('Admin', ?, 'REJECT_LOAN', 'loans', ?, ?, ?, ?)`,
            [req.admin.admin_id, loanId, JSON.stringify({ status: 'Rejected', admin_notes }), req.ip, req.get('User-Agent')]
        );

        res.json({
            success: true,
            message: 'Loan rejected successfully'
        });
    } catch (error) {
        console.error('Reject loan error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reject loan'
        });
    }
});

// Disburse loan (admin only)
router.put('/:id/disburse', authenticateAdmin, requireRole(['Super Admin', 'Admin']), async (req, res) => {
    try {
        const loanId = req.params.id;

        await transaction(async (connection) => {
            // Get loan details
            const [loan] = await connection.execute(
                'SELECT * FROM loans WHERE loan_id = ? AND status = "Approved"',
                [loanId]
            );

            if (!loan.length) {
                throw new Error('Loan not found or not approved');
            }

            const loanData = loan[0];

            // Update loan status
            await connection.execute(
                `UPDATE loans SET status = 'Disbursed', disbursement_date = CURDATE(), 
                 next_due_date = DATE_ADD(CURDATE(), INTERVAL 1 MONTH), updated_at = NOW() 
                 WHERE loan_id = ?`,
                [loanId]
            );

            // Create transaction record
            await connection.execute(
                `INSERT INTO transactions 
                 (transaction_number, member_id, transaction_type, amount, balance_after, 
                  reference_type, reference_id, description, processed_by)
                 VALUES (?, ?, 'Deposit', ?, ?, 'Loan', ?, ?, ?)`,
                [`TXN${Date.now()}`, loanData.member_id, loanData.loan_amount, 
                 loanData.loan_amount, loanId, `Loan disbursement - ${loanData.loan_number}`, req.admin.admin_id]
            );
        });

        // Log the action
        await executeQuery(
            `INSERT INTO audit_logs (user_type, user_id, action, table_name, record_id, 
             new_values, ip_address, user_agent) 
             VALUES ('Admin', ?, 'DISBURSE_LOAN', 'loans', ?, ?, ?, ?)`,
            [req.admin.admin_id, loanId, JSON.stringify({ status: 'Disbursed' }), req.ip, req.get('User-Agent')]
        );

        res.json({
            success: true,
            message: 'Loan disbursed successfully'
        });
    } catch (error) {
        console.error('Disburse loan error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to disburse loan'
        });
    }
});

module.exports = router;
