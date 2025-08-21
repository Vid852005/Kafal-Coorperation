const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const { executeQuery, getOne } = require('../config/database');
const { authenticateAdmin, optionalAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Configure multer for PDF uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = 'uploads/notices/pdfs';
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'notice-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'));
        }
    }
});

// Get all active notices (public endpoint)
router.get('/', optionalAuth, async (req, res) => {
    try {
        const { page = 1, limit = 10, type } = req.query;
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE status = "Active" AND (expiry_date IS NULL OR expiry_date >= CURDATE())';
        let params = [];

        if (type) {
            whereClause += ' AND notice_type = ?';
            params.push(type);
        }

        const notices = await executeQuery(
            `SELECT notice_id, title, content, notice_type, priority, publish_date, 
             expiry_date, pdf_document, created_at
             FROM notices ${whereClause}
             ORDER BY priority DESC, publish_date DESC
             LIMIT ? OFFSET ?`,
            [...params, parseInt(limit), parseInt(offset)]
        );

        // Get total count
        const [{ total }] = await executeQuery(
            `SELECT COUNT(*) as total FROM notices ${whereClause}`,
            params
        );

        res.json({
            success: true,
            data: {
                notices,
                pagination: {
                    current_page: parseInt(page),
                    per_page: parseInt(limit),
                    total_records: total,
                    total_pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('Get notices error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch notices'
        });
    }
});

// Get notice by ID
router.get('/:id', optionalAuth, async (req, res) => {
    try {
        const notice = await getOne(
            `SELECT notice_id, title, content, notice_type, priority, publish_date, 
             expiry_date, pdf_document, created_at
             FROM notices 
             WHERE notice_id = ? AND status = "Active" 
             AND (expiry_date IS NULL OR expiry_date >= CURDATE())`,
            [req.params.id]
        );

        if (!notice) {
            return res.status(404).json({
                success: false,
                message: 'Notice not found'
            });
        }

        res.json({
            success: true,
            data: notice
        });
    } catch (error) {
        console.error('Get notice error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch notice'
        });
    }
});

// Create new notice (admin only)
router.post('/', authenticateAdmin, requireRole(['Super Admin', 'Admin']), upload.single('pdf'), [
    body('title').isLength({ min: 5, max: 200 }),
    body('content').isLength({ min: 10, max: 2000 }),
    body('notice_type').isIn(['General', 'Important', 'Urgent', 'Event']),
    body('priority').isIn(['Low', 'Medium', 'High']),
    body('publish_date').isISO8601(),
    body('expiry_date').optional().isISO8601()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            // Clean up uploaded file if validation fails
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        const { title, content, notice_type, priority, publish_date, expiry_date } = req.body;
        const pdf_document = req.file ? req.file.filename : null;

        const result = await executeQuery(
            `INSERT INTO notices 
             (title, content, notice_type, pdf_document, status, priority, 
              publish_date, expiry_date, created_by)
             VALUES (?, ?, ?, ?, 'Active', ?, ?, ?, ?)`,
            [title, content, notice_type, pdf_document, priority, publish_date, expiry_date || null, req.admin.admin_id]
        );

        // Log the action
        await executeQuery(
            `INSERT INTO audit_logs (user_type, user_id, action, table_name, record_id, 
             new_values, ip_address, user_agent) 
             VALUES ('Admin', ?, 'CREATE_NOTICE', 'notices', ?, ?, ?, ?)`,
            [req.admin.admin_id, result.insertId, JSON.stringify({ title, notice_type, priority }), req.ip, req.get('User-Agent')]
        );

        res.status(201).json({
            success: true,
            message: 'Notice created successfully',
            data: {
                notice_id: result.insertId
            }
        });
    } catch (error) {
        console.error('Create notice error:', error);
        // Clean up uploaded file on error
        if (req.file) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({
            success: false,
            message: 'Failed to create notice'
        });
    }
});

// Update notice (admin only)
router.put('/:id', authenticateAdmin, requireRole(['Super Admin', 'Admin']), upload.single('pdf'), [
    body('title').optional().isLength({ min: 5, max: 200 }),
    body('content').optional().isLength({ min: 10, max: 2000 }),
    body('notice_type').optional().isIn(['General', 'Important', 'Urgent', 'Event']),
    body('priority').optional().isIn(['Low', 'Medium', 'High']),
    body('publish_date').optional().isISO8601(),
    body('expiry_date').optional().isISO8601()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        const noticeId = req.params.id;
        
        // Check if notice exists
        const existingNotice = await getOne(
            'SELECT notice_id, pdf_document FROM notices WHERE notice_id = ?',
            [noticeId]
        );

        if (!existingNotice) {
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            return res.status(404).json({
                success: false,
                message: 'Notice not found'
            });
        }

        const allowedFields = ['title', 'content', 'notice_type', 'priority', 'publish_date', 'expiry_date'];
        const updates = {};
        
        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        });

        // Handle PDF update
        if (req.file) {
            // Delete old PDF if exists
            if (existingNotice.pdf_document) {
                const oldPdfPath = path.join('uploads/notices/pdfs', existingNotice.pdf_document);
                if (fs.existsSync(oldPdfPath)) {
                    fs.unlinkSync(oldPdfPath);
                }
            }
            updates.pdf_document = req.file.filename;
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid fields to update'
            });
        }

        const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
        const values = [...Object.values(updates), noticeId];

        await executeQuery(
            `UPDATE notices SET ${setClause}, updated_at = NOW() WHERE notice_id = ?`,
            values
        );

        // Log the action
        await executeQuery(
            `INSERT INTO audit_logs (user_type, user_id, action, table_name, record_id, 
             new_values, ip_address, user_agent) 
             VALUES ('Admin', ?, 'UPDATE_NOTICE', 'notices', ?, ?, ?, ?)`,
            [req.admin.admin_id, noticeId, JSON.stringify(updates), req.ip, req.get('User-Agent')]
        );

        res.json({
            success: true,
            message: 'Notice updated successfully'
        });
    } catch (error) {
        console.error('Update notice error:', error);
        if (req.file) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({
            success: false,
            message: 'Failed to update notice'
        });
    }
});

// Delete notice (admin only)
router.delete('/:id', authenticateAdmin, requireRole(['Super Admin', 'Admin']), async (req, res) => {
    try {
        const noticeId = req.params.id;
        
        // Get notice details before deletion
        const notice = await getOne(
            'SELECT notice_id, title, pdf_document FROM notices WHERE notice_id = ?',
            [noticeId]
        );

        if (!notice) {
            return res.status(404).json({
                success: false,
                message: 'Notice not found'
            });
        }

        // Delete PDF file if exists
        if (notice.pdf_document) {
            const pdfPath = path.join('uploads/notices/pdfs', notice.pdf_document);
            if (fs.existsSync(pdfPath)) {
                fs.unlinkSync(pdfPath);
            }
        }

        // Soft delete - update status to archived
        await executeQuery(
            'UPDATE notices SET status = "Archived", updated_at = NOW() WHERE notice_id = ?',
            [noticeId]
        );

        // Log the action
        await executeQuery(
            `INSERT INTO audit_logs (user_type, user_id, action, table_name, record_id, 
             old_values, ip_address, user_agent) 
             VALUES ('Admin', ?, 'DELETE_NOTICE', 'notices', ?, ?, ?, ?)`,
            [req.admin.admin_id, noticeId, JSON.stringify({ title: notice.title }), req.ip, req.get('User-Agent')]
        );

        res.json({
            success: true,
            message: 'Notice deleted successfully'
        });
    } catch (error) {
        console.error('Delete notice error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete notice'
        });
    }
});

// Download notice PDF
router.get('/:id/download', async (req, res) => {
    try {
        const notice = await getOne(
            'SELECT pdf_document, title FROM notices WHERE notice_id = ? AND pdf_document IS NOT NULL',
            [req.params.id]
        );

        if (!notice) {
            return res.status(404).json({
                success: false,
                message: 'Notice or PDF not found'
            });
        }

        const filePath = path.join('uploads/notices/pdfs', notice.pdf_document);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'PDF file not found'
            });
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${notice.title}.pdf"`);
        res.sendFile(path.resolve(filePath));
    } catch (error) {
        console.error('Download notice PDF error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to download PDF'
        });
    }
});

// Get all notices for admin (including inactive)
router.get('/admin/all', authenticateAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 10, status, type } = req.query;
        const offset = (page - 1) * limit;

        let whereClause = 'WHERE 1=1';
        let params = [];

        if (status) {
            whereClause += ' AND status = ?';
            params.push(status);
        }

        if (type) {
            whereClause += ' AND notice_type = ?';
            params.push(type);
        }

        const notices = await executeQuery(
            `SELECT n.*, a.username as created_by_name
             FROM notices n
             LEFT JOIN admins a ON n.created_by = a.admin_id
             ${whereClause}
             ORDER BY n.created_at DESC
             LIMIT ? OFFSET ?`,
            [...params, parseInt(limit), parseInt(offset)]
        );

        // Get total count
        const [{ total }] = await executeQuery(
            `SELECT COUNT(*) as total FROM notices ${whereClause}`,
            params
        );

        res.json({
            success: true,
            data: {
                notices,
                pagination: {
                    current_page: parseInt(page),
                    per_page: parseInt(limit),
                    total_records: total,
                    total_pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('Get admin notices error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch notices'
        });
    }
});

module.exports = router;
