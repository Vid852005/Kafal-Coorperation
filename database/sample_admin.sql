-- Sample Admin Account for Testing
-- Super Admin Password: nidhi (hashed with bcrypt)
-- Regular Admin Password: Admin@123456 (hashed with bcrypt)

INSERT INTO admins (
    admin_id, 
    first_name, 
    last_name, 
    email, 
    phone, 
    password_hash, 
    department, 
    position, 
    role, 
    status, 
    approved_by, 
    approved_at
) VALUES 
('SUPER001', 'Devender', 'Raturi', 'devender.raturi@kafal.coop', '9599413311', '$2b$10$KIXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Administration', 'Super Administrator', 'super_admin', 'active', NULL, NOW()),
('ADM001', 'Rajesh', 'Kumar', 'rajesh.admin@kafal.coop', '9876543210', '$2b$10$example.hash.for.admin123', 'Administration', 'General Manager', 'admin', 'active', 'SUPER001', NOW()),
('ADM002', 'Priya', 'Sharma', 'priya.admin@kafal.coop', '9876543211', '$2b$10$example.hash.for.admin456', 'Finance', 'Finance Manager', 'admin', 'active', 'SUPER001', NOW());

-- Sample Member Registration Requests (Pending Admin Approval)
INSERT INTO member_requests (
    first_name,
    last_name,
    email,
    phone,
    date_of_birth,
    address,
    account_type,
    initial_deposit,
    password_hash,
    status,
    request_date
) VALUES (
    'John',
    'Doe',
    'john.doe@example.com',
    '+977-9800000002',
    '1990-01-15',
    'Kathmandu, Nepal',
    'savings',
    5000.00,
    '$2a$12$LQv3c1yqBwEHFgXRKGOCOe.b5QcGhn5VQ/H9M6CxHgEKf7u.aGjyq', -- Member@123456
    'pending',
    NOW()
);

INSERT INTO member_requests (
    first_name,
    last_name,
    email,
    phone,
    date_of_birth,
    address,
    account_type,
    initial_deposit,
    password_hash,
    status,
    request_date
) VALUES (
    'Jane',
    'Smith',
    'jane.smith@example.com',
    '+977-9800000003',
    '1985-05-20',
    'Pokhara, Nepal',
    'current',
    15000.00,
    '$2a$12$LQv3c1yqBwEHFgXRKGOCOe.b5QcGhn5VQ/H9M6CxHgEKf7u.aGjyq', -- Member@123456
    'pending',
    NOW()
);

-- Sample Approved Members (for testing login after admin approval)
INSERT INTO members (
    account_number,
    first_name,
    last_name,
    email,
    phone,
    date_of_birth,
    address,
    account_type,
    password_hash,
    balance,
    share_count,
    share_value,
    membership_fees_paid,
    entry_fee_paid,
    welfare_fund_paid,
    building_fund_paid,
    status,
    created_at
) VALUES 
(
    'KCS2025001',
    'Devender',
    'Raturi',
    'devender.member@kafal.coop',
    '9599413311',
    '1985-03-15',
    'Dehradun, Uttarakhand',
    'savings',
    '$2b$10$KIXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- nidhi
    0.00,
    20,
    2000.00,
    2400.00,
    TRUE,
    TRUE,
    TRUE,
    'active',
    NOW()
),
(
    'KCS2025002',
    'Test',
    'Member',
    'test.member@example.com',
    '+977-9800000004',
    '1992-03-10',
    'Lalitpur, Nepal',
    'savings',
    '$2a$12$LQv3c1yqBwEHFgXRKGOCOe.b5QcGhn5VQ/H9M6CxHgEKf7u.aGjyq', -- Member@123456
    0.00,
    2,
    200.00,
    0.00,
    FALSE,
    FALSE,
    FALSE,
    'pending_payment',
    NOW()
);

-- Sample UPI payment requests for testing
INSERT INTO upi_payment_requests (
    member_id,
    transaction_id,
    amount,
    purpose,
    description,
    payment_status,
    payment_method,
    bank_reference_number,
    receipt_generated,
    expires_at,
    paid_at,
    created_at
) VALUES 
(
    (SELECT id FROM members WHERE account_number = 'KCS2025001'),
    'KCS1692611234567',
    2400.00,
    'membership_fee',
    'Complete membership fees payment',
    'completed',
    'UPI',
    'UPI123456789',
    TRUE,
    DATE_ADD(NOW(), INTERVAL 30 MINUTE),
    NOW(),
    NOW()
);

-- Sample payment receipt
INSERT INTO payment_receipts (
    payment_request_id,
    member_id,
    receipt_number,
    amount,
    payment_date,
    purpose,
    bank_reference,
    receipt_data,
    generated_at
) VALUES (
    1,
    (SELECT id FROM members WHERE account_number = 'KCS2025001'),
    'RCP1692611234567890',
    2400.00,
    NOW(),
    'membership_fee',
    'UPI123456789',
    '{"society_name":"KAFAL Co-operative Urban Thrift & Credit Society Ltd.","registration_no":"10405(E)","registration_date":"03.05.2016","upi_id":"meghajoshisut30@oksbi","transaction_id":"KCS1692611234567","bank_reference":"UPI123456789","payment_method":"UPI"}',
    NOW()
);
