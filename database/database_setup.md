# Kafal Cooperative Society Database Setup Guide

## Overview
This database schema is designed for a complete cooperative society management system with member management, loan processing, deposit handling, and administrative features.

## Database Structure

### Core Tables
1. **members** - Member information and profiles
2. **member_requests** - Signup requests awaiting approval
3. **admins** - Administrative users and roles
4. **notices** - System notices and announcements
5. **loans** - Loan applications and management
6. **deposits** - Deposit accounts and transactions
7. **transactions** - All financial transactions
8. **audit_logs** - System activity tracking

### Supporting Tables
- **loan_documents** - Document attachments for loans
- **member_sessions** - Member login tracking
- **admin_sessions** - Admin login tracking
- **system_settings** - Configurable system parameters

## Setup Instructions

### 1. MySQL/MariaDB Setup
```bash
# Create database
mysql -u root -p
CREATE DATABASE kafal_cooperative;
USE kafal_cooperative;

# Import schema
SOURCE /path/to/schema.sql;

# Import sample data
SOURCE /path/to/sample_data.sql;
```

### 2. PostgreSQL Setup
```bash
# Create database
createdb kafal_cooperative

# Import schema (modify AUTO_INCREMENT to SERIAL)
psql kafal_cooperative < schema_postgresql.sql
```

### 3. SQLite Setup (Development)
```bash
# Create database file
sqlite3 kafal_cooperative.db < schema.sql
sqlite3 kafal_cooperative.db < sample_data.sql
```

## Key Features

### Member Management
- Complete member profiles with KYC documents
- Membership types (Regular, Premium, Senior)
- Status tracking (Active, Inactive, Suspended)
- Signup request workflow with admin approval

### Loan Management
- Multiple loan types (Personal, Business, Education, etc.)
- EMI calculations and tracking
- Document management
- Approval workflow
- Outstanding balance tracking

### Deposit Management
- Fixed Deposits with maturity calculations
- Recurring Deposits with monthly tracking
- Savings accounts with interest credits
- Auto-renewal options

### Administrative Features
- Role-based admin access (Super Admin, Admin, Manager)
- Notice management with PDF attachments
- Comprehensive audit logging
- Session management and security

### Financial Tracking
- Complete transaction history
- Balance calculations
- Interest calculations
- Fee management

## Security Features

### Authentication
- Password hashing (bcrypt recommended)
- Session token management
- Failed login attempt tracking
- Account lockout mechanism

### Data Protection
- Audit logging for all changes
- IP address tracking
- User agent logging
- Soft deletes for critical data

### Access Control
- Role-based permissions
- Admin approval workflows
- Document access controls

## Sample Data Included

### Test Accounts
- **Admin**: username: `admin`, password: `admin123`
- **Manager**: username: `manager1`, password: `manager123`

### Sample Members
- 5 active members with different profiles
- Various loan and deposit accounts
- Transaction history

### Test Scenarios
- Pending member requests for approval testing
- Active loans with different statuses
- Various deposit types and maturities
- System notices and announcements

## API Endpoints Needed

### Authentication
- `POST /api/auth/login` - Member/Admin login
- `POST /api/auth/logout` - Logout
- `POST /api/auth/refresh` - Token refresh

### Member Management
- `GET /api/members` - List members (admin only)
- `POST /api/members/register` - New member request
- `PUT /api/members/{id}` - Update member profile
- `GET /api/members/{id}` - Get member details

### Loan Management
- `POST /api/loans/apply` - Submit loan application
- `GET /api/loans` - List loans (filtered by member/admin)
- `PUT /api/loans/{id}/approve` - Approve loan (admin only)
- `POST /api/loans/{id}/payment` - Record EMI payment

### Deposit Management
- `POST /api/deposits` - Create new deposit
- `GET /api/deposits` - List deposits
- `PUT /api/deposits/{id}` - Update deposit
- `POST /api/deposits/{id}/interest` - Credit interest

### Notice Management
- `GET /api/notices` - List active notices
- `POST /api/notices` - Create notice (admin only)
- `PUT /api/notices/{id}` - Update notice (admin only)
- `DELETE /api/notices/{id}` - Delete notice (admin only)

## File Storage Structure
```
uploads/
├── member_documents/
│   ├── id_proofs/
│   ├── address_proofs/
│   ├── photos/
│   └── signatures/
├── loan_documents/
│   ├── income_proofs/
│   ├── collateral_docs/
│   └── agreements/
└── notices/
    └── pdfs/
```

## Backup Strategy
- Daily automated backups
- Transaction log backups
- Document file backups
- Offsite backup storage

## Performance Optimization
- Indexed columns for fast queries
- Partitioning for large transaction tables
- Connection pooling
- Query optimization for reports

## Compliance & Regulations
- Data retention policies
- Privacy protection (GDPR compliance)
- Financial regulations compliance
- Audit trail requirements
