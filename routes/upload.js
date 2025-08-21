const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateToken } = require('../middleware/auth');
const { query, getOne } = require('../config/database');
const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '..', 'uploads', 'documents');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + extension);
    }
});

const fileFilter = (req, file, cb) => {
    // Allow only specific file types
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only JPEG, PNG, and PDF files are allowed.'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

// Upload document endpoint
router.post('/document', authenticateToken, upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        const { document_type, member_id, request_id } = req.body;

        if (!document_type) {
            return res.status(400).json({
                success: false,
                message: 'Document type is required'
            });
        }

        // Insert document record into database
        const result = await query(`
            INSERT INTO document_uploads (
                member_id, 
                admin_id, 
                request_id, 
                document_type, 
                original_filename, 
                stored_filename, 
                file_path, 
                file_size, 
                mime_type, 
                upload_status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `, [
            member_id || null,
            req.user.role === 'admin' || req.user.role === 'super_admin' ? req.user.id : null,
            request_id || null,
            document_type,
            req.file.originalname,
            req.file.filename,
            req.file.path,
            req.file.size,
            req.file.mimetype
        ]);

        res.json({
            success: true,
            message: 'Document uploaded successfully',
            data: {
                upload_id: result.insertId,
                filename: req.file.filename,
                original_name: req.file.originalname,
                size: req.file.size,
                type: req.file.mimetype
            }
        });

    } catch (error) {
        console.error('Document upload error:', error);
        
        // Clean up uploaded file if database insert fails
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            success: false,
            message: error.message || 'Failed to upload document'
        });
    }
});

// Get documents for a user
router.get('/documents', authenticateToken, async (req, res) => {
    try {
        const { member_id, request_id } = req.query;
        
        let whereClause = '';
        let params = [];

        if (member_id) {
            whereClause = 'WHERE member_id = ?';
            params.push(member_id);
        } else if (request_id) {
            whereClause = 'WHERE request_id = ?';
            params.push(request_id);
        } else if (req.user.role === 'member') {
            whereClause = 'WHERE member_id = ?';
            params.push(req.user.id);
        }

        const documents = await query(`
            SELECT 
                upload_id,
                document_type,
                original_filename,
                file_size,
                upload_status,
                verification_notes,
                uploaded_at,
                verified_at
            FROM document_uploads 
            ${whereClause}
            ORDER BY uploaded_at DESC
        `, params);

        res.json({
            success: true,
            data: documents
        });

    } catch (error) {
        console.error('Get documents error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve documents'
        });
    }
});

// Verify document (admin only)
router.put('/document/:id/verify', authenticateToken, async (req, res) => {
    try {
        // Check if user is admin
        if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
            return res.status(403).json({
                success: false,
                message: 'Access denied. Admin privileges required.'
            });
        }

        const { upload_status, verification_notes } = req.body;
        const uploadId = req.params.id;

        if (!upload_status || !['verified', 'rejected'].includes(upload_status)) {
            return res.status(400).json({
                success: false,
                message: 'Valid upload status (verified/rejected) is required'
            });
        }

        await query(`
            UPDATE document_uploads 
            SET 
                upload_status = ?,
                verification_notes = ?,
                verified_by = ?,
                verified_at = NOW()
            WHERE upload_id = ?
        `, [upload_status, verification_notes || null, req.user.admin_id, uploadId]);

        res.json({
            success: true,
            message: `Document ${upload_status} successfully`
        });

    } catch (error) {
        console.error('Document verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to verify document'
        });
    }
});

// Download document
router.get('/document/:id/download', authenticateToken, async (req, res) => {
    try {
        const uploadId = req.params.id;
        
        const document = await getOne(`
            SELECT file_path, original_filename, mime_type 
            FROM document_uploads 
            WHERE upload_id = ?
        `, [uploadId]);

        if (!document) {
            return res.status(404).json({
                success: false,
                message: 'Document not found'
            });
        }

        if (!fs.existsSync(document.file_path)) {
            return res.status(404).json({
                success: false,
                message: 'File not found on server'
            });
        }

        res.setHeader('Content-Type', document.mime_type);
        res.setHeader('Content-Disposition', `attachment; filename="${document.original_filename}"`);
        
        const fileStream = fs.createReadStream(document.file_path);
        fileStream.pipe(res);

    } catch (error) {
        console.error('Document download error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to download document'
        });
    }
});

module.exports = router;
