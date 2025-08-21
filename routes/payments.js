const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { query, getOne, transaction } = require('../config/database');
const router = express.Router();

// Generate UPI payment request
router.post('/upi/generate', authenticateToken, [
    body('amount').isFloat({ min: 1 }).withMessage('Amount must be greater than 0'),
    body('purpose').isIn(['membership_fee', 'share_purchase', 'loan_repayment', 'deposit', 'other']).withMessage('Invalid payment purpose'),
    body('description').optional().isLength({ max: 500 }).withMessage('Description too long')
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

        const { amount, purpose, description } = req.body;
        const memberId = req.user.id;

        // Generate unique transaction ID
        const transactionId = `KCS${Date.now()}${Math.floor(Math.random() * 1000)}`;
        
        // Set expiry time (30 minutes from now)
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + 30);

        const result = await query(`
            INSERT INTO upi_payment_requests (
                member_id, 
                transaction_id, 
                amount, 
                purpose, 
                description, 
                expires_at
            ) VALUES (?, ?, ?, ?, ?, ?)
        `, [memberId, transactionId, amount, purpose, description || null, expiresAt]);

        // Get member details for UPI request
        const member = await getOne(`
            SELECT account_number, first_name, last_name, phone 
            FROM members WHERE id = ?
        `, [memberId]);

        res.json({
            success: true,
            message: 'UPI payment request generated successfully',
            data: {
                request_id: result.insertId,
                transaction_id: transactionId,
                upi_id: 'meghajoshisut30@oksbi',
                amount: parseFloat(amount),
                purpose,
                description,
                member_name: `${member.first_name} ${member.last_name}`,
                account_number: member.account_number,
                expires_at: expiresAt,
                payment_url: `upi://pay?pa=meghajoshisut30@oksbi&pn=KAFAL%20Cooperative&am=${amount}&cu=INR&tn=${encodeURIComponent(`${purpose} - ${member.account_number}`)}`
            }
        });

    } catch (error) {
        console.error('UPI request generation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate UPI payment request'
        });
    }
});

// Confirm UPI payment (webhook or manual confirmation)
router.post('/upi/confirm', authenticateToken, [
    body('transaction_id').notEmpty().withMessage('Transaction ID is required'),
    body('bank_reference_number').optional().isLength({ min: 5 }).withMessage('Invalid bank reference'),
    body('payment_method').optional().isLength({ max: 50 }).withMessage('Payment method too long')
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

        const { transaction_id, bank_reference_number, payment_method } = req.body;

        await transaction(async (connection) => {
            // Get payment request
            const paymentRequest = await getOne(`
                SELECT * FROM upi_payment_requests 
                WHERE transaction_id = ? AND payment_status = 'pending'
            `, [transaction_id], connection);

            if (!paymentRequest) {
                throw new Error('Payment request not found or already processed');
            }

            // Check if payment has expired
            if (new Date() > new Date(paymentRequest.expires_at)) {
                await query(`
                    UPDATE upi_payment_requests 
                    SET payment_status = 'expired' 
                    WHERE request_id = ?
                `, [paymentRequest.request_id], connection);
                
                throw new Error('Payment request has expired');
            }

            // Update payment request as completed
            await query(`
                UPDATE upi_payment_requests 
                SET 
                    payment_status = 'completed',
                    payment_method = ?,
                    bank_reference_number = ?,
                    paid_at = NOW()
                WHERE request_id = ?
            `, [payment_method || 'UPI', bank_reference_number, paymentRequest.request_id], connection);

            // Update member balance and status based on payment purpose
            await updateMemberForPayment(paymentRequest, connection);

            // Generate receipt
            const receiptNumber = `RCP${Date.now()}${Math.floor(Math.random() * 100)}`;
            const receiptData = {
                society_name: 'KAFAL Co-operative Urban Thrift & Credit Society Ltd.',
                registration_no: '10405(E)',
                registration_date: '03.05.2016',
                upi_id: 'meghajoshisut30@oksbi',
                transaction_id: paymentRequest.transaction_id,
                bank_reference: bank_reference_number,
                payment_method: payment_method || 'UPI'
            };

            await query(`
                INSERT INTO payment_receipts (
                    payment_request_id,
                    member_id,
                    receipt_number,
                    amount,
                    payment_date,
                    purpose,
                    bank_reference,
                    receipt_data
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                paymentRequest.request_id,
                paymentRequest.member_id,
                receiptNumber,
                paymentRequest.amount,
                new Date(),
                paymentRequest.purpose,
                bank_reference_number,
                JSON.stringify(receiptData)
            ], connection);

            // Mark receipt as generated
            await query(`
                UPDATE upi_payment_requests 
                SET receipt_generated = TRUE 
                WHERE request_id = ?
            `, [paymentRequest.request_id], connection);

            return { receiptNumber, paymentRequest };
        });

        res.json({
            success: true,
            message: 'Payment confirmed successfully',
            data: {
                transaction_id,
                status: 'completed',
                receipt_generated: true
            }
        });

    } catch (error) {
        console.error('Payment confirmation error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to confirm payment'
        });
    }
});

// Update member account based on payment purpose
async function updateMemberForPayment(paymentRequest, connection) {
    const { member_id, amount, purpose } = paymentRequest;

    switch (purpose) {
        case 'membership_fee':
            await query(`
                UPDATE members 
                SET 
                    membership_fees_paid = membership_fees_paid + ?,
                    entry_fee_paid = CASE WHEN ? >= 200 THEN TRUE ELSE entry_fee_paid END,
                    welfare_fund_paid = CASE WHEN ? >= 400 THEN TRUE ELSE welfare_fund_paid END,
                    building_fund_paid = CASE WHEN ? >= 2400 THEN TRUE ELSE building_fund_paid END,
                    status = CASE 
                        WHEN ? >= 2400 THEN 'active' 
                        ELSE 'pending_payment' 
                    END
                WHERE id = ?
            `, [amount, amount, amount, amount, amount, member_id], connection);
            break;

        case 'share_purchase':
            const shareCount = Math.floor(amount / 100);
            await query(`
                UPDATE members 
                SET 
                    share_count = share_count + ?,
                    share_value = share_value + ?,
                    balance = balance + ?
                WHERE id = ?
            `, [shareCount, amount, amount, member_id], connection);
            break;

        case 'deposit':
            await query(`
                UPDATE members 
                SET balance = balance + ?
                WHERE id = ?
            `, [amount, member_id], connection);
            break;

        case 'loan_repayment':
            // Handle loan repayment logic here
            await query(`
                UPDATE members 
                SET balance = balance + ?
                WHERE id = ?
            `, [amount, member_id], connection);
            break;

        default:
            await query(`
                UPDATE members 
                SET balance = balance + ?
                WHERE id = ?
            `, [amount, member_id], connection);
    }

    // Record transaction
    await query(`
        INSERT INTO transactions (
            member_id,
            transaction_type,
            amount,
            description,
            balance_after,
            created_at
        ) VALUES (?, 'credit', ?, ?, (SELECT balance FROM members WHERE id = ?), NOW())
    `, [member_id, amount, `${purpose} payment`, member_id], connection);
}

// Get payment history
router.get('/history', authenticateToken, async (req, res) => {
    try {
        const memberId = req.user.id;
        const { page = 1, limit = 10 } = req.query;
        const offset = (page - 1) * limit;

        const payments = await query(`
            SELECT 
                upr.transaction_id,
                upr.amount,
                upr.purpose,
                upr.description,
                upr.payment_status,
                upr.payment_method,
                upr.bank_reference_number,
                upr.paid_at,
                upr.created_at,
                pr.receipt_number
            FROM upi_payment_requests upr
            LEFT JOIN payment_receipts pr ON upr.request_id = pr.payment_request_id
            WHERE upr.member_id = ?
            ORDER BY upr.created_at DESC
            LIMIT ? OFFSET ?
        `, [memberId, parseInt(limit), parseInt(offset)]);

        const total = await getOne(`
            SELECT COUNT(*) as count 
            FROM upi_payment_requests 
            WHERE member_id = ?
        `, [memberId]);

        res.json({
            success: true,
            data: {
                payments,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: total.count,
                    pages: Math.ceil(total.count / limit)
                }
            }
        });

    } catch (error) {
        console.error('Payment history error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve payment history'
        });
    }
});

// Get payment receipt
router.get('/receipt/:receipt_number', authenticateToken, async (req, res) => {
    try {
        const { receipt_number } = req.params;
        const memberId = req.user.id;

        const receipt = await getOne(`
            SELECT 
                pr.*,
                m.first_name,
                m.last_name,
                m.account_number,
                m.phone,
                upr.transaction_id,
                upr.purpose,
                upr.description
            FROM payment_receipts pr
            JOIN members m ON pr.member_id = m.id
            JOIN upi_payment_requests upr ON pr.payment_request_id = upr.request_id
            WHERE pr.receipt_number = ? AND pr.member_id = ?
        `, [receipt_number, memberId]);

        if (!receipt) {
            return res.status(404).json({
                success: false,
                message: 'Receipt not found'
            });
        }

        res.json({
            success: true,
            data: {
                ...receipt,
                receipt_data: JSON.parse(receipt.receipt_data)
            }
        });

    } catch (error) {
        console.error('Receipt retrieval error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve receipt'
        });
    }
});

// Check payment status
router.get('/status/:transaction_id', authenticateToken, async (req, res) => {
    try {
        const { transaction_id } = req.params;
        const memberId = req.user.id;

        const payment = await getOne(`
            SELECT 
                transaction_id,
                amount,
                purpose,
                payment_status,
                expires_at,
                paid_at,
                receipt_generated
            FROM upi_payment_requests
            WHERE transaction_id = ? AND member_id = ?
        `, [transaction_id, memberId]);

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Payment request not found'
            });
        }

        res.json({
            success: true,
            data: payment
        });

    } catch (error) {
        console.error('Payment status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check payment status'
        });
    }
});

module.exports = router;
