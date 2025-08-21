// Authentication JavaScript Functions

// Initialize API instance
const kafalAPI = new KafalAPI();

// Toggle password visibility
function togglePassword(fieldId) {
    const passwordField = document.getElementById(fieldId);
    const toggleButton = passwordField.nextElementSibling;
    const icon = toggleButton.querySelector('i');
    
    if (passwordField.type === 'password') {
        passwordField.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        passwordField.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

// Form validation
function validateForm(formId) {
    const form = document.getElementById(formId);
    const inputs = form.querySelectorAll('input[required], select[required], textarea[required]');
    let isValid = true;
    
    inputs.forEach(input => {
        if (!input.value.trim()) {
            input.style.borderColor = '#ef4444';
            isValid = false;
        } else {
            input.style.borderColor = '#e5e7eb';
        }
    });
    
    return isValid;
}

// Password strength checker
function checkPasswordStrength(password) {
    let strength = 0;
    const checks = {
        length: password.length >= 8,
        lowercase: /[a-z]/.test(password),
        uppercase: /[A-Z]/.test(password),
        numbers: /\d/.test(password),
        special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
    };
    
    Object.values(checks).forEach(check => {
        if (check) strength++;
    });
    
    return {
        score: strength,
        checks: checks
    };
}

// Form submissions
document.addEventListener('DOMContentLoaded', function() {
    // Member Login Form
    const memberLoginForm = document.getElementById('memberLoginForm');
    if (memberLoginForm) {
        memberLoginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const accountNumber = document.getElementById('accountNumber').value;
            const password = document.getElementById('password').value;
            
            if (!accountNumber || !password) {
                kafalAPI.showNotification('Please fill in all required fields.', 'error');
                return;
            }

            try {
                kafalAPI.showLoading(true);
                const response = await kafalAPI.memberLogin(accountNumber, password);
                
                if (response.success) {
                    kafalAPI.showNotification('Login successful! Redirecting...', 'success');
                    setTimeout(() => {
                        window.location.href = 'member-dashboard.html';
                    }, 1000);
                } else {
                    kafalAPI.showNotification(response.message || 'Login failed', 'error');
                }
            } catch (error) {
                kafalAPI.showNotification('Login failed: ' + error.message, 'error');
            } finally {
                kafalAPI.showLoading(false);
            }
        });
    }
    
    // Member Register Form
    const memberRegisterForm = document.getElementById('memberRegisterForm');
    if (memberRegisterForm) {
        memberRegisterForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            
            if (password !== confirmPassword) {
                kafalAPI.showNotification('Passwords do not match', 'error');
                return;
            }
            
            if (!validateForm('memberRegisterForm')) {
                kafalAPI.showNotification('Please fill in all required fields.', 'error');
                return;
            }

            const formData = {
                firstName: document.getElementById('firstName').value,
                lastName: document.getElementById('lastName').value,
                email: document.getElementById('email').value,
                phone: document.getElementById('phone').value,
                dateOfBirth: document.getElementById('dateOfBirth').value,
                address: document.getElementById('address').value,
                accountType: document.getElementById('accountType').value,
                initialDeposit: document.getElementById('initialDeposit').value,
                password: password
            };

            try {
                kafalAPI.showLoading(true);
                const response = await kafalAPI.memberRegister(formData);
                
                if (response.success) {
                    kafalAPI.showNotification('Registration successful! Please wait for admin approval.', 'success');
                    setTimeout(() => {
                        window.location.href = 'member-login.html';
                    }, 2000);
                } else {
                    kafalAPI.showNotification(response.message || 'Registration failed', 'error');
                }
            } catch (error) {
                kafalAPI.showNotification('Registration failed: ' + error.message, 'error');
            } finally {
                kafalAPI.showLoading(false);
            }
        });
    }
    
    // Admin Login Form (Enhanced Security)
    const adminLoginForm = document.getElementById('adminLoginForm');
    if (adminLoginForm) {
        adminLoginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const adminId = document.getElementById('adminId').value;
            const password = document.getElementById('password').value;
            
            if (!adminId || !password) {
                kafalAPI.showNotification('Please fill in all required fields.', 'error');
                return;
            }

            // Enhanced admin validation
            if (adminId.length < 6) {
                kafalAPI.showNotification('Admin ID must be at least 6 characters long.', 'error');
                return;
            }

            if (password.length < 8) {
                kafalAPI.showNotification('Admin password must be at least 8 characters long.', 'error');
                return;
            }

            try {
                kafalAPI.showLoading(true);
                const response = await kafalAPI.adminLogin(adminId, password);
                
                if (response.success) {
                    kafalAPI.showNotification('Admin login successful! Redirecting...', 'success');
                    setTimeout(() => {
                        window.location.href = 'admin-dashboard.html';
                    }, 1000);
                } else {
                    kafalAPI.showNotification(response.message || 'Admin login failed', 'error');
                    // Log failed admin login attempts
                    console.warn('Failed admin login attempt:', { adminId, timestamp: new Date().toISOString() });
                }
            } catch (error) {
                kafalAPI.showNotification('Admin login failed: ' + error.message, 'error');
                console.error('Admin login error:', error);
            } finally {
                kafalAPI.showLoading(false);
            }
        });
    }
    
    // Admin Register Form
    const adminRegisterForm = document.getElementById('adminRegisterForm');
    if (adminRegisterForm) {
        adminRegisterForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            
            if (password !== confirmPassword) {
                kafalAPI.showNotification('Passwords do not match', 'error');
                return;
            }
            
            if (!validateForm('adminRegisterForm')) {
                kafalAPI.showNotification('Please fill in all required fields.', 'error');
                return;
            }

            const formData = {
                firstName: document.getElementById('firstName').value,
                lastName: document.getElementById('lastName').value,
                email: document.getElementById('email').value,
                phone: document.getElementById('phone').value,
                department: document.getElementById('department').value,
                position: document.getElementById('position').value,
                password: password
            };

            try {
                kafalAPI.showLoading(true);
                const response = await kafalAPI.adminRegister(formData);
                
                if (response.success) {
                    kafalAPI.showNotification('Admin registration request submitted! Please wait for approval.', 'success');
                    setTimeout(() => {
                        window.location.href = 'admin-login.html';
                    }, 2000);
                } else {
                    kafalAPI.showNotification(response.message || 'Registration failed', 'error');
                }
            } catch (error) {
                kafalAPI.showNotification('Registration failed: ' + error.message, 'error');
            } finally {
                kafalAPI.showLoading(false);
            }
        });
    }
});
