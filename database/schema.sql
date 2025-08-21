-- Kafal Cooperative Society Database Schema
-- Created: 2025-08-20
-- Description: Complete database schema for member management, loans, deposits, and administration

-- =============================================
-- 1. MEMBERS TABLE
-- =============================================
CREATE TABLE members (
    id INT PRIMARY KEY AUTO_INCREMENT,
    account_number VARCHAR(20) UNIQUE NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(15) NOT NULL,
    address TEXT NOT NULL,
    date_of_birth DATE NOT NULL,
    account_type ENUM('savings', 'current', 'salary') NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    balance DECIMAL(12,2) DEFAULT 0.00,
    share_count INT DEFAULT 2,
    share_value DECIMAL(10,2) DEFAULT 200.00,
    membership_fees_paid DECIMAL(10,2) DEFAULT 0.00,
    entry_fee_paid BOOLEAN DEFAULT FALSE,
    welfare_fund_paid BOOLEAN DEFAULT FALSE,
    building_fund_paid BOOLEAN DEFAULT FALSE,
    status ENUM('active', 'inactive', 'suspended', 'pending_payment') DEFAULT 'pending_payment',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_account_number (account_number),
    INDEX idx_email (email),
    INDEX idx_phone (phone),
    INDEX idx_status (status)
);

-- =============================================
-- 2. MEMBER SIGNUP REQUESTS TABLE
-- =============================================
CREATE TABLE member_requests (
    request_id INT PRIMARY KEY AUTO_INCREMENT,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL,
    phone VARCHAR(15) NOT NULL,
    address TEXT NOT NULL,
    date_of_birth DATE NOT NULL,
    account_type ENUM('savings', 'current', 'salary') NOT NULL,
    initial_deposit DECIMAL(12,2) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    admin_notes TEXT,
    processed_by VARCHAR(20),
    processed_at TIMESTAMP NULL,
    request_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_status (status),
    INDEX idx_email (email),
    INDEX idx_request_date (request_date)
);

-- =============================================
-- 3. ADMINS TABLE
-- =============================================
CREATE TABLE admins (
    id INT PRIMARY KEY AUTO_INCREMENT,
    admin_id VARCHAR(20) UNIQUE NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(15),
    password_hash VARCHAR(255) NOT NULL,
    department VARCHAR(50),
    position VARCHAR(50),
    role ENUM('super_admin', 'admin', 'moderator') DEFAULT 'admin',
    status ENUM('active', 'inactive', 'pending') DEFAULT 'pending',
    last_login TIMESTAMP NULL,
    failed_login_attempts INT DEFAULT 0,
    account_locked_until TIMESTAMP NULL,
    approved_by VARCHAR(20) NULL,
    approved_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_admin_id (admin_id),
    INDEX idx_email (email),
    INDEX idx_status (status),
    INDEX idx_role (role),
    FOREIGN KEY (approved_by) REFERENCES admins(admin_id) ON DELETE SET NULL
);

-- =============================================
-- 4. NOTICES TABLE
-- =============================================
CREATE TABLE notices (
    notice_id INT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    notice_type ENUM('General', 'Important', 'Urgent', 'Event') DEFAULT 'General',
    pdf_document VARCHAR(255), -- File path for PDF attachment
    status ENUM('Active', 'Inactive', 'Archived') DEFAULT 'Active',
    priority ENUM('Low', 'Medium', 'High') DEFAULT 'Medium',
    publish_date DATE NOT NULL,
    expiry_date DATE,
    created_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_status (status),
    INDEX idx_publish_date (publish_date),
    INDEX idx_priority (priority)
);

-- =============================================
-- 5. UPI PAYMENT REQUESTS TABLE
-- =============================================
CREATE TABLE upi_payment_requests (
    request_id INT PRIMARY KEY AUTO_INCREMENT,
    member_id INT NOT NULL,
    transaction_id VARCHAR(50) UNIQUE NOT NULL,
    upi_id VARCHAR(100) DEFAULT 'meghajoshisut30@oksbi',
    amount DECIMAL(12,2) NOT NULL,
    purpose ENUM('membership_fee', 'share_purchase', 'loan_repayment', 'deposit', 'other') NOT NULL,
    description TEXT,
    payment_status ENUM('pending', 'completed', 'failed', 'expired') DEFAULT 'pending',
    payment_method VARCHAR(50),
    bank_reference_number VARCHAR(100),
    receipt_generated BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMP NOT NULL,
    paid_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_member_id (member_id),
    INDEX idx_transaction_id (transaction_id),
    INDEX idx_payment_status (payment_status),
    INDEX idx_expires_at (expires_at),
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

-- =============================================
-- 6. PAYMENT RECEIPTS TABLE
-- =============================================
CREATE TABLE payment_receipts (
    receipt_id INT PRIMARY KEY AUTO_INCREMENT,
    payment_request_id INT NOT NULL,
    member_id INT NOT NULL,
    receipt_number VARCHAR(50) UNIQUE NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    payment_date TIMESTAMP NOT NULL,
    purpose VARCHAR(200) NOT NULL,
    bank_reference VARCHAR(100),
    receipt_data JSON,
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_payment_request_id (payment_request_id),
    INDEX idx_member_id (member_id),
    INDEX idx_receipt_number (receipt_number),
    FOREIGN KEY (payment_request_id) REFERENCES upi_payment_requests(request_id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

-- =============================================
-- 7. DOCUMENT UPLOADS TABLE
-- =============================================
CREATE TABLE document_uploads (
    upload_id INT PRIMARY KEY AUTO_INCREMENT,
    member_id INT NULL,
    admin_id INT NULL,
    request_id INT NULL,
    document_type ENUM('aadhaar', 'pan', 'photo', 'electricity_bill', 'affidavit', 'other') NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    stored_filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size INT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    upload_status ENUM('pending', 'verified', 'rejected') DEFAULT 'pending',
    verification_notes TEXT,
    verified_by VARCHAR(20),
    verified_at TIMESTAMP NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_member_id (member_id),
    INDEX idx_admin_id (admin_id),
    INDEX idx_request_id (request_id),
    INDEX idx_document_type (document_type),
    INDEX idx_upload_status (upload_status),
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY (admin_id) REFERENCES admins(id) ON DELETE CASCADE,
    FOREIGN KEY (request_id) REFERENCES member_requests(request_id) ON DELETE CASCADE
);

-- =============================================
-- 6. LOANS TABLE
-- =============================================
CREATE TABLE loans (
    loan_id INT PRIMARY KEY AUTO_INCREMENT,
    loan_number VARCHAR(20) UNIQUE NOT NULL,
    member_id INT NOT NULL,
    loan_type ENUM('Personal', 'Business', 'Education', 'Home', 'Vehicle', 'Emergency') NOT NULL,
    loan_amount DECIMAL(12,2) NOT NULL,
    interest_rate DECIMAL(5,2) NOT NULL,
    tenure_months INT NOT NULL,
    monthly_emi DECIMAL(10,2) NOT NULL,
    purpose TEXT NOT NULL,
    collateral_details TEXT,
    guarantor_name VARCHAR(100),
    guarantor_phone VARCHAR(15),
    guarantor_address TEXT,
    application_date DATE NOT NULL,
    approval_date DATE,
    disbursement_date DATE,
    status ENUM('Applied', 'Under Review', 'Approved', 'Rejected', 'Disbursed', 'Active', 'Completed', 'Defaulted') DEFAULT 'Applied',
    outstanding_amount DECIMAL(12,2) DEFAULT 0,
    total_paid DECIMAL(12,2) DEFAULT 0,
    next_due_date DATE,
    processed_by INT,
    admin_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_loan_number (loan_number),
    INDEX idx_member_id (member_id),
    INDEX idx_status (status),
    INDEX idx_application_date (application_date),
    FOREIGN KEY (member_id) REFERENCES members(member_id) ON DELETE CASCADE,
    FOREIGN KEY (processed_by) REFERENCES admins(admin_id) ON DELETE SET NULL
);

-- =============================================
-- 6. LOAN DOCUMENTS TABLE
-- =============================================
CREATE TABLE loan_documents (
    document_id INT PRIMARY KEY AUTO_INCREMENT,
    loan_id INT NOT NULL,
    document_type VARCHAR(50) NOT NULL, -- 'income_proof', 'id_proof', 'address_proof', etc.
    document_name VARCHAR(100) NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_loan_id (loan_id),
    FOREIGN KEY (loan_id) REFERENCES loans(loan_id) ON DELETE CASCADE
);

-- =============================================
-- 7. DEPOSITS TABLE
-- =============================================
CREATE TABLE deposits (
    deposit_id INT PRIMARY KEY AUTO_INCREMENT,
    deposit_number VARCHAR(20) UNIQUE NOT NULL,
    member_id INT NOT NULL,
    deposit_type ENUM('Fixed Deposit', 'Recurring Deposit', 'Savings', 'Current') NOT NULL,
    principal_amount DECIMAL(12,2) NOT NULL,
    interest_rate DECIMAL(5,2) NOT NULL,
    tenure_months INT, -- NULL for savings/current accounts
    maturity_amount DECIMAL(12,2),
    deposit_date DATE NOT NULL,
    maturity_date DATE,
    status ENUM('Active', 'Matured', 'Premature Closure', 'Closed') DEFAULT 'Active',
    auto_renewal BOOLEAN DEFAULT FALSE,
    current_balance DECIMAL(12,2) NOT NULL,
    last_interest_credited DATE,
    processed_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_deposit_number (deposit_number),
    INDEX idx_member_id (member_id),
    INDEX idx_status (status),
    INDEX idx_deposit_date (deposit_date),
    FOREIGN KEY (member_id) REFERENCES members(member_id) ON DELETE CASCADE,
    FOREIGN KEY (processed_by) REFERENCES admins(admin_id) ON DELETE SET NULL
);

-- =============================================
-- 8. TRANSACTIONS TABLE
-- =============================================
CREATE TABLE transactions (
    transaction_id INT PRIMARY KEY AUTO_INCREMENT,
    transaction_number VARCHAR(30) UNIQUE NOT NULL,
    member_id INT NOT NULL,
    transaction_type ENUM('Deposit', 'Withdrawal', 'Loan Payment', 'Interest Credit', 'Fee', 'Transfer') NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    balance_after DECIMAL(12,2) NOT NULL,
    reference_type ENUM('Loan', 'Deposit', 'General') NOT NULL,
    reference_id INT, -- loan_id or deposit_id
    description TEXT NOT NULL,
    transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_by INT,
    
    INDEX idx_transaction_number (transaction_number),
    INDEX idx_member_id (member_id),
    INDEX idx_transaction_type (transaction_type),
    INDEX idx_transaction_date (transaction_date),
    FOREIGN KEY (member_id) REFERENCES members(member_id) ON DELETE CASCADE,
    FOREIGN KEY (processed_by) REFERENCES admins(admin_id) ON DELETE SET NULL
);

-- =============================================
-- 9. MEMBER SESSIONS TABLE (for login tracking)
-- =============================================
CREATE TABLE member_sessions (
    session_id INT PRIMARY KEY AUTO_INCREMENT,
    member_id INT NOT NULL,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    
    INDEX idx_session_token (session_token),
    INDEX idx_member_id (member_id),
    FOREIGN KEY (member_id) REFERENCES members(member_id) ON DELETE CASCADE
);

-- =============================================
-- 10. ADMIN SESSIONS TABLE
-- =============================================
CREATE TABLE admin_sessions (
    session_id INT PRIMARY KEY AUTO_INCREMENT,
    admin_id INT NOT NULL,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    
    INDEX idx_session_token (session_token),
    INDEX idx_admin_id (admin_id),
    FOREIGN KEY (admin_id) REFERENCES admins(admin_id) ON DELETE CASCADE
);

-- =============================================
-- 11. SYSTEM SETTINGS TABLE
-- =============================================
CREATE TABLE system_settings (
    setting_id INT PRIMARY KEY AUTO_INCREMENT,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    description TEXT,
    updated_by INT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_setting_key (setting_key),
    FOREIGN KEY (updated_by) REFERENCES admins(admin_id) ON DELETE SET NULL
);

-- =============================================
-- 12. AUDIT LOGS TABLE
-- =============================================
CREATE TABLE audit_logs (
    log_id INT PRIMARY KEY AUTO_INCREMENT,
    user_type ENUM('Admin', 'Member') NOT NULL,
    user_id INT NOT NULL,
    action VARCHAR(100) NOT NULL,
    table_name VARCHAR(50),
    record_id INT,
    old_values JSON,
    new_values JSON,
    ip_address VARCHAR(45),
    user_agent TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    INDEX idx_user_type_id (user_type, user_id),
    INDEX idx_action (action),
    INDEX idx_timestamp (timestamp)
);
