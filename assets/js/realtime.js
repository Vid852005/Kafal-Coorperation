// Real-time WebSocket client for Kafal Cooperative Society
// Handles frontend WebSocket connections and real-time updates

class RealtimeClient {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
    }

    // Initialize WebSocket connection
    connect() {
        try {
            const socketURL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
                ? 'http://localhost:3000'
                : window.location.origin;
            
            this.socket = io(socketURL, {
                transports: ['websocket', 'polling']
            });

            this.setupEventListeners();
        } catch (error) {
            console.error('WebSocket connection error:', error);
        }
    }

    // Setup event listeners
    setupEventListeners() {
        this.socket.on('connect', () => {
            this.isConnected = true;
            this.reconnectAttempts = 0;
            console.log('Connected to real-time server');
            
            // Join appropriate room based on user type
            const userType = localStorage.getItem('user_type');
            const userId = localStorage.getItem('user_id');
            
            if (userType === 'member' && userId) {
                this.socket.emit('join-member', userId);
            } else if (userType === 'admin' && userId) {
                this.socket.emit('join-admin', userId);
            }
        });

        this.socket.on('disconnect', () => {
            this.isConnected = false;
            console.log('Disconnected from real-time server');
            this.attemptReconnect();
        });

        // Handle member notifications
        this.socket.on('member-notification', (data) => {
            this.handleMemberNotification(data);
        });

        // Handle admin notifications
        this.socket.on('admin-notification', (data) => {
            this.handleAdminNotification(data);
        });

        // Handle system notifications
        this.socket.on('system-notification', (data) => {
            this.handleSystemNotification(data);
        });

        // Handle dashboard updates
        this.socket.on('dashboard-update', (data) => {
            this.handleDashboardUpdate(data);
        });

        // Handle system heartbeat
        this.socket.on('system-heartbeat', (data) => {
            this.updateSystemStatus(data);
        });
    }

    // Handle member-specific notifications
    handleMemberNotification(data) {
        this.showNotification(data.type, data.data.message, 'info');
        
        // Update UI based on notification type
        switch (data.type) {
            case 'TRANSACTION_UPDATE':
                this.updateTransactionHistory();
                break;
            case 'INTEREST_CREDITED':
                this.updateAccountBalance();
                break;
        }
    }

    // Handle admin-specific notifications
    handleAdminNotification(data) {
        this.showNotification(data.type, data.data.message, 'info');
        
        // Update admin dashboard
        switch (data.type) {
            case 'NEW_MEMBER_REQUEST':
                this.updatePendingRequests();
                break;
            case 'NEW_LOAN_APPLICATION':
                this.updateLoanApplications();
                break;
        }
    }

    // Handle system-wide notifications
    handleSystemNotification(data) {
        this.showNotification(data.type, data.data.message, 'info');
        
        if (data.type === 'NEW_NOTICE') {
            this.updateNoticesList();
            this.incrementNotificationBadge();
        }
    }

    // Handle dashboard updates
    handleDashboardUpdate(data) {
        if (document.getElementById('dashboard-stats')) {
            this.updateDashboardStats(data);
        }
    }

    // Show notification to user
    showNotification(type, message, level = 'info') {
        if (window.kafalAPI) {
            window.kafalAPI.showNotification(message, level);
        } else {
            // Fallback notification
            console.log(`${type}: ${message}`);
        }
    }

    // Update notification badge
    incrementNotificationBadge() {
        const badge = document.querySelector('.notification-bell .badge');
        if (badge) {
            const currentCount = parseInt(badge.textContent) || 0;
            badge.textContent = currentCount + 1;
            badge.style.display = 'flex';
        }
    }

    // Update dashboard stats
    updateDashboardStats(stats) {
        const elements = {
            'active-members': stats.activeMembers,
            'pending-requests': stats.pendingRequests,
            'pending-loans': stats.pendingLoans,
            'active-loan-amount': this.formatCurrency(stats.activeLoanAmount),
            'total-deposits': this.formatCurrency(stats.totalDeposits)
        };

        Object.entries(elements).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) {
                element.textContent = value;
            }
        });
    }

    // Format currency
    formatCurrency(amount) {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR'
        }).format(amount);
    }

    // Update system status indicator
    updateSystemStatus(data) {
        const statusIndicator = document.getElementById('system-status');
        if (statusIndicator) {
            statusIndicator.className = `status ${data.status}`;
            statusIndicator.title = `Last updated: ${new Date(data.timestamp).toLocaleString()}`;
        }
    }

    // Attempt to reconnect
    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            
            setTimeout(() => {
                this.connect();
            }, this.reconnectDelay * this.reconnectAttempts);
        }
    }

    // Disconnect
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }

    // Update functions for different UI components
    updateTransactionHistory() {
        // Refresh transaction history if on transactions page
        if (window.location.pathname.includes('transaction')) {
            location.reload();
        }
    }

    updateAccountBalance() {
        // Refresh account balance display
        if (typeof refreshAccountBalance === 'function') {
            refreshAccountBalance();
        }
    }

    updatePendingRequests() {
        // Refresh pending requests count
        if (typeof refreshPendingRequests === 'function') {
            refreshPendingRequests();
        }
    }

    updateLoanApplications() {
        // Refresh loan applications
        if (typeof refreshLoanApplications === 'function') {
            refreshLoanApplications();
        }
    }

    updateNoticesList() {
        // Refresh notices list
        if (typeof refreshNotices === 'function') {
            refreshNotices();
        }
    }
}

// Initialize real-time client when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (typeof io !== 'undefined') {
        window.realtimeClient = new RealtimeClient();
        window.realtimeClient.connect();
    }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.realtimeClient) {
        window.realtimeClient.disconnect();
    }
});
