// API Integration Utility for Kafal Cooperative Society
// Base configuration and helper functions for frontend-backend communication

class KafalAPI {
    constructor() {
        // Auto-detect if running locally or on production
        this.baseURL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
            ? 'http://localhost:3000/api' 
            : `${window.location.origin}/api`;
        this.token = localStorage.getItem('auth_token');
        this.refreshToken = localStorage.getItem('refresh_token');
    }

    // Set authentication token
    setToken(token, refreshToken = null) {
        this.token = token;
        localStorage.setItem('auth_token', token);
        if (refreshToken) {
            this.refreshToken = refreshToken;
            localStorage.setItem('refresh_token', refreshToken);
        }
    }

    // Clear authentication tokens
    clearTokens() {
        this.token = null;
        this.refreshToken = null;
        localStorage.removeItem('auth_token');
        localStorage.removeItem('refresh_token');
    }

    // Get authorization headers
    getAuthHeaders() {
        const headers = {
            'Content-Type': 'application/json'
        };
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        return headers;
    }

    // Generic API request method
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const config = {
            headers: this.getAuthHeaders(),
            ...options
        };

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                if (response.status === 401 && this.refreshToken) {
                    // Try to refresh token
                    const refreshed = await this.refreshAuthToken();
                    if (refreshed) {
                        // Retry the original request
                        config.headers = this.getAuthHeaders();
                        const retryResponse = await fetch(url, config);
                        return await retryResponse.json();
                    }
                }
                throw new Error(data.message || 'API request failed');
            }

            return data;
        } catch (error) {
            console.error('API Request Error:', error);
            throw error;
        }
    }

    // Refresh authentication token
    async refreshAuthToken() {
        try {
            const response = await fetch(`${this.baseURL}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: this.refreshToken })
            });

            if (response.ok) {
                const data = await response.json();
                this.setToken(data.data.token);
                return true;
            }
        } catch (error) {
            console.error('Token refresh failed:', error);
        }
        
        this.clearTokens();
        return false;
    }

    // Authentication methods
    async adminLogin(username, password) {
        const response = await this.request('/auth/admin/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });

        if (response.success) {
            this.setToken(response.data.token, response.data.refreshToken);
        }
        return response;
    }

    async memberLogin(email, password) {
        const response = await this.request('/auth/member/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        if (response.success) {
            this.setToken(response.data.token, response.data.refreshToken);
        }
        return response;
    }

    async logout() {
        const response = await this.request('/auth/logout', {
            method: 'POST'
        });
        this.clearTokens();
        return response;
    }

    // Admin Dashboard APIs
    async getDashboardStats() {
        return await this.request('/admin/dashboard/stats');
    }

    async getMemberRequests(filters = {}) {
        const params = new URLSearchParams(filters);
        return await this.request(`/admin/member-requests?${params}`);
    }

    async getMemberRequest(id) {
        return await this.request(`/admin/member-requests/${id}`);
    }

    async approveMemberRequest(id, adminNotes = '') {
        return await this.request(`/admin/member-requests/${id}/approve`, {
            method: 'PUT',
            body: JSON.stringify({ admin_notes: adminNotes })
        });
    }

    async rejectMemberRequest(id, adminNotes) {
        return await this.request(`/admin/member-requests/${id}/reject`, {
            method: 'PUT',
            body: JSON.stringify({ admin_notes: adminNotes })
        });
    }

    async getMembers(filters = {}) {
        const params = new URLSearchParams(filters);
        return await this.request(`/members?${params}`);
    }

    async getMember(id) {
        return await this.request(`/members/${id}`);
    }

    async updateMemberStatus(id, status) {
        return await this.request(`/members/${id}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status })
        });
    }

    async exportMembers() {
        const response = await fetch(`${this.baseURL}/admin/export/members`, {
            headers: this.getAuthHeaders()
        });
        return response.blob();
    }

    // Notice Management APIs
    async getNotices(filters = {}) {
        const params = new URLSearchParams(filters);
        return await this.request(`/notices?${params}`);
    }

    async getAdminNotices(filters = {}) {
        const params = new URLSearchParams(filters);
        return await this.request(`/notices/admin/all?${params}`);
    }

    async getNotice(id) {
        return await this.request(`/notices/${id}`);
    }

    async createNotice(formData) {
        return await fetch(`${this.baseURL}/notices`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`
            },
            body: formData // FormData for file upload
        }).then(res => res.json());
    }

    async updateNotice(id, formData) {
        return await fetch(`${this.baseURL}/notices/${id}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${this.token}`
            },
            body: formData
        }).then(res => res.json());
    }

    async deleteNotice(id) {
        return await this.request(`/notices/${id}`, {
            method: 'DELETE'
        });
    }

    // Loan Management APIs
    async getLoans(filters = {}) {
        const params = new URLSearchParams(filters);
        return await this.request(`/loans?${params}`);
    }

    async getLoan(id) {
        return await this.request(`/loans/${id}`);
    }

    async approveLoan(id, adminNotes = '') {
        return await this.request(`/loans/${id}/approve`, {
            method: 'PUT',
            body: JSON.stringify({ admin_notes: adminNotes })
        });
    }

    async rejectLoan(id, adminNotes) {
        return await this.request(`/loans/${id}/reject`, {
            method: 'PUT',
            body: JSON.stringify({ admin_notes: adminNotes })
        });
    }

    async disburseLoan(id) {
        return await this.request(`/loans/${id}/disburse`, {
            method: 'PUT'
        });
    }

    // Deposit Management APIs
    async getDeposits(filters = {}) {
        const params = new URLSearchParams(filters);
        return await this.request(`/deposits?${params}`);
    }

    async getDeposit(id) {
        return await this.request(`/deposits/${id}`);
    }

    async creditInterest(id) {
        return await this.request(`/deposits/${id}/credit-interest`, {
            method: 'POST'
        });
    }

    async closeDeposit(id, reason) {
        return await this.request(`/deposits/${id}/close`, {
            method: 'PUT',
            body: JSON.stringify({ closure_reason: reason })
        });
    }

    // Transaction APIs
    async getTransactions(filters = {}) {
        const params = new URLSearchParams(filters);
        return await this.request(`/transactions?${params}`);
    }

    async getTransaction(id) {
        return await this.request(`/transactions/${id}`);
    }

    // Member Registration
    async registerMember(memberData) {
        return await this.request('/members/register', {
            method: 'POST',
            body: JSON.stringify(memberData)
        });
    }

    // Utility methods
    formatCurrency(amount) {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR'
        }).format(amount);
    }

    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('en-IN');
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
            <button onclick="this.parentElement.remove()">×</button>
        `;
        
        // Add to page
        document.body.appendChild(notification);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }

    showLoading(show = true) {
        let loader = document.getElementById('api-loader');
        if (show) {
            if (!loader) {
                loader = document.createElement('div');
                loader.id = 'api-loader';
                loader.className = 'api-loader';
                loader.innerHTML = '<div class="spinner"></div>';
                document.body.appendChild(loader);
            }
            loader.style.display = 'flex';
        } else {
            if (loader) {
                loader.style.display = 'none';
            }
        }
    }
}

// Create global API instance
window.kafalAPI = new KafalAPI();

// Add CSS for notifications and loader
const style = document.createElement('style');
style.textContent = `
    .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        border-radius: 8px;
        padding: 15px 20px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        display: flex;
        align-items: center;
        gap: 10px;
        z-index: 10000;
        max-width: 400px;
        animation: slideIn 0.3s ease;
    }
    
    .notification.success {
        border-left: 4px solid #10b981;
        color: #065f46;
    }
    
    .notification.error {
        border-left: 4px solid #ef4444;
        color: #991b1b;
    }
    
    .notification.info {
        border-left: 4px solid #3b82f6;
        color: #1e40af;
    }
    
    .notification button {
        background: none;
        border: none;
        font-size: 18px;
        cursor: pointer;
        color: #6b7280;
        margin-left: auto;
    }
    
    .api-loader {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 10001;
    }
    
    .spinner {
        width: 40px;
        height: 40px;
        border: 4px solid #f3f4f6;
        border-top: 4px solid #3b82f6;
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }
    
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);
