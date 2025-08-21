-- Kafal Cooperative Society - System Settings and Configuration
-- This file contains only essential system configuration data

-- =============================================
-- INSERT SYSTEM SETTINGS
-- =============================================
INSERT INTO system_settings (setting_key, setting_value, description, updated_by) VALUES
('min_deposit_amount', '1000', 'Minimum deposit amount for new accounts', 1),
('max_loan_amount', '1000000', 'Maximum loan amount per member', 1),
('default_savings_interest', '4.0', 'Default interest rate for savings accounts', 1),
('default_fd_interest', '8.5', 'Default interest rate for fixed deposits', 1),
('loan_processing_fee', '1.0', 'Loan processing fee percentage', 1),
('member_registration_fee', '500', 'One-time member registration fee', 1),
('cooperative_name', 'Kafal Cooperative Society', 'Official name of the cooperative', 1),
('contact_email', 'info@kafalcoop.com', 'Official contact email', 1),
('contact_phone', '+977-1-4567890', 'Official contact phone number', 1),
('office_address', 'Kathmandu, Nepal', 'Official office address', 1);
