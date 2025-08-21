# Kafal Cooperative Society Management System

A comprehensive web-based management system for cooperative societies with real-time data synchronization, secure authentication, and optimized performance.

## 🚀 Features

### Core Functionality
- **Member Management**: Registration, profile management, status tracking
- **Admin Dashboard**: Real-time statistics, member approval, system management
- **Loan Management**: Application processing, approval workflow, payment tracking
- **Deposit Management**: Various deposit types, interest calculation, maturity tracking
- **Notice System**: Announcements, PDF attachments, priority-based notifications
- **Transaction Tracking**: Complete audit trail of all financial operations

### Real-Time Features
- **WebSocket Integration**: Live notifications and updates
- **Dashboard Updates**: Real-time statistics refresh every 5 minutes
- **Instant Notifications**: Member login alerts, new applications, transactions
- **System Heartbeat**: Connection status monitoring

### Security & Performance
- **JWT Authentication**: Secure token-based authentication with refresh tokens
- **Password Hashing**: bcrypt implementation for secure password storage
- **Rate Limiting**: API protection against abuse
- **Query Caching**: Optimized database performance with intelligent caching
- **Connection Pooling**: Efficient database connection management

## 📁 Project Structure

```
cosmos/
├── assets/
│   ├── css/           # Stylesheets
│   └── js/            # Frontend JavaScript
│       ├── api.js     # API integration utilities
│       ├── auth.js    # Authentication helpers
│       ├── main.js    # Core frontend functionality
│       └── realtime.js # WebSocket client
├── config/
│   └── database.js    # Database configuration and utilities
├── database/
│   ├── schema.sql     # Complete database schema
│   └── sample_data.sql # Sample data for testing
├── middleware/
│   └── auth.js        # Authentication middleware
├── routes/
│   ├── admin.js       # Admin-specific routes
│   ├── auth.js        # Authentication routes
│   ├── deposits.js    # Deposit management
│   ├── loans.js       # Loan management
│   ├── members.js     # Member management
│   ├── notices.js     # Notice system
│   └── transactions.js # Transaction handling
├── services/
│   └── realtime.js    # Real-time notification service
├── utils/
│   └── optimization.js # Performance optimization utilities
├── server.js          # Main server file
└── package.json       # Dependencies and scripts
```

## 🛠 Installation & Setup

### Prerequisites
- Node.js (v16.0.0 or higher)
- MySQL (v8.0 or higher)
- npm or yarn package manager

### Installation Steps

1. **Clone and Navigate**
   ```bash
   cd cosmos
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Database Setup**
   ```bash
   # Create database
   mysql -u root -p -e "CREATE DATABASE kafal_cooperative;"
   
   # Import schema
   mysql -u root -p kafal_cooperative < database/schema.sql
   
   # Import sample data (optional)
   mysql -u root -p kafal_cooperative < database/sample_data.sql
   ```

4. **Environment Configuration**
   ```bash
   # Copy environment template
   cp .env.example .env
   
   # Edit .env file with your database credentials
   ```

5. **Start the Server**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

6. **Access the Application**
   - Frontend: http://localhost:8000
   - API: http://localhost:3000
   - Health Check: http://localhost:3000/health

## 🔧 Configuration

### Environment Variables

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_NAME=kafal_cooperative
DB_USER=root
DB_PASSWORD=your_password

# JWT Configuration
JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

# Server Configuration
PORT=3000
NODE_ENV=development

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:8000,http://127.0.0.1:8000
```

## 🌐 API Endpoints

### Authentication
- `POST /api/auth/member/login` - Member login
- `POST /api/auth/admin/login` - Admin login
- `POST /api/auth/refresh` - Refresh token
- `POST /api/auth/logout` - Logout

### Members
- `GET /api/members/profile` - Get member profile
- `PUT /api/members/profile` - Update member profile
- `POST /api/members/register` - Submit registration request
- `GET /api/members` - Get all members (admin only)

### Admin
- `GET /api/admin/dashboard/stats` - Dashboard statistics
- `GET /api/admin/member-requests` - Pending member requests
- `PUT /api/admin/member-requests/:id/approve` - Approve member request

### Loans & Deposits
- `GET /api/loans` - Get loans
- `POST /api/loans` - Apply for loan
- `GET /api/deposits` - Get deposits
- `POST /api/deposits` - Create deposit

## 🔄 Real-Time Features

### WebSocket Events

**Client to Server:**
- `join-member` - Join member-specific room
- `join-admin` - Join admin broadcast room

**Server to Client:**
- `member-notification` - Member-specific notifications
- `admin-notification` - Admin notifications
- `system-notification` - System-wide announcements
- `dashboard-update` - Real-time dashboard statistics
- `system-heartbeat` - Connection status updates

### Notification Types
- New member registrations
- Loan applications
- Transaction updates
- Interest credits
- System announcements
- Login activities

## ⚡ Performance Optimizations

### Caching Strategy
- **Query Caching**: Frequently accessed data cached for 5-10 minutes
- **Dashboard Stats**: Cached for 1 minute with real-time updates
- **Member Data**: Cached for 10 minutes per user

### Database Optimizations
- **Connection Pooling**: Efficient connection management
- **Indexed Queries**: Optimized database indexes
- **Batch Operations**: Bulk updates for better performance
- **Pagination**: Efficient data loading for large datasets

### Memory Management
- **Automatic Cleanup**: Periodic memory optimization
- **Rate Limit Cleanup**: Old rate limit data removal
- **Garbage Collection**: Memory usage optimization

## 🔒 Security Features

### Authentication & Authorization
- **JWT Tokens**: Secure stateless authentication
- **Refresh Tokens**: Extended session management
- **Role-Based Access**: Admin/Member permission levels
- **Account Lockout**: Protection against brute force attacks

### API Security
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **CORS Protection**: Configured allowed origins
- **Helmet.js**: Security headers
- **Input Validation**: Comprehensive request validation
- **SQL Injection Protection**: Parameterized queries

## 📊 Monitoring & Logging

### Performance Monitoring
- **Slow Query Detection**: Queries >1 second logged
- **Connection Pool Status**: Real-time pool monitoring
- **Memory Usage Tracking**: Automatic optimization

### Audit Logging
- **User Actions**: Complete audit trail
- **System Events**: Login attempts, status changes
- **Error Logging**: Comprehensive error tracking

## 🚦 Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage
```

## 🔄 Development Workflow

### Code Structure
- **Modular Architecture**: Separated concerns
- **Error Handling**: Comprehensive error management
- **Validation**: Input validation at all levels
- **Documentation**: Inline code documentation

### Best Practices
- **Async/Await**: Modern JavaScript patterns
- **Transaction Management**: Database consistency
- **Memory Efficiency**: Optimized resource usage
- **Real-Time Updates**: Live data synchronization

## 📈 Scalability Considerations

### Horizontal Scaling
- **Stateless Design**: JWT-based authentication
- **Database Pooling**: Connection management
- **Caching Layer**: Redis-ready architecture
- **Load Balancer Ready**: Session-independent design

### Performance Metrics
- **Response Times**: <200ms for cached queries
- **Concurrent Users**: Supports 100+ simultaneous connections
- **Database Efficiency**: Optimized query performance
- **Memory Usage**: Automatic cleanup and optimization

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 📞 Support

For technical support or questions:
- Email: support@kafalcooperative.com
- Documentation: [Project Wiki]
- Issues: [GitHub Issues]

---

**Built with ❤️ for Kafal Cooperative Society**
