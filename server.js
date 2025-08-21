const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
require('dotenv').config();

const { testConnection } = require('./config/database');
const RealtimeService = require('./services/realtime');

const authRoutes = require('./routes/auth');
const membersRoutes = require('./routes/members');
const adminRoutes = require('./routes/admin');
const uploadRoutes = require('./routes/upload');
const paymentsRoutes = require('./routes/payments');
const depositRoutes = require('./routes/deposits');
const noticeRoutes = require('./routes/notices');
const transactionRoutes = require('./routes/transactions');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:8000'],
        methods: ['GET', 'POST']
    }
});
const PORT = process.env.PORT || 3000;

// Initialize realtime service
const realtimeService = new RealtimeService(io);

// Make io and realtime service available to routes
app.set('io', io);
app.set('realtime', realtimeService);

// Security middleware
app.use(helmet());
app.use(compression());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// CORS configuration
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, etc.)
        if (!origin) return callback(null, true);
        
        const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
            'http://localhost:8000',
            'http://localhost:3000',
            'http://127.0.0.1:8000',
            'http://127.0.0.1:3000'
        ];
        
        // Add current deployment URL dynamically
        if (process.env.VERCEL_URL) {
            allowedOrigins.push(`https://${process.env.VERCEL_URL}`);
        }
        
        if (allowedOrigins.indexOf(origin) !== -1 || origin.includes('vercel.app')) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use(morgan('combined'));

// Static file serving for uploads and frontend
app.use('/uploads', express.static('uploads'));
app.use(express.static('.'));

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/members', membersRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/deposits', depositRoutes);
app.use('/api/notices', noticeRoutes);
app.use('/api/transactions', transactionRoutes);

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'API endpoint not found'
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    
    // Handle specific error types
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: err.errors
        });
    }
    
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            message: 'Invalid token'
        });
    }
    
    if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
            success: false,
            message: 'Duplicate entry found'
        });
    }
    
    // Default error response
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// WebSocket connection handling
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    
    socket.on('join-member', (memberId) => {
        socket.join(`member-${memberId}`);
        console.log(`Member ${memberId} joined their room`);
    });
    
    socket.on('join-admin', (adminId) => {
        socket.join(`admin-${adminId}`);
        socket.join('admin-broadcast');
        console.log(`Admin ${adminId} joined admin rooms`);
    });
    
    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Scheduled tasks for real-time updates
cron.schedule('*/5 * * * *', async () => {
    try {
        // Emit periodic updates to connected clients
        io.emit('system-heartbeat', {
            timestamp: new Date().toISOString(),
            status: 'active'
        });
        
        // Update dashboard stats for admins
        await realtimeService.broadcastDashboardUpdate();
    } catch (error) {
        console.error('Scheduled task error:', error);
    }
});

// Test database connection before starting server
testConnection().then((connected) => {
    if (connected) {
        // Start server
        server.listen(PORT, () => {
            console.log(`🚀 Kafal Cooperative API Server running on port ${PORT}`);
            console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`🔗 Health check: http://localhost:${PORT}/health`);
            console.log(`🔌 WebSocket server ready for real-time connections`);
        });
    } else {
        console.error('❌ Failed to connect to database. Server not started.');
        process.exit(1);
    }
}).catch((error) => {
    console.error('❌ Database connection error:', error);
    process.exit(1);
});
