// Real-time notification service for Kafal Cooperative Society
// Handles WebSocket events and real-time data synchronization

const { executeQuery } = require('../config/database');

class RealtimeService {
    constructor(io) {
        this.io = io;
    }

    // Notify member about account updates
    notifyMember(memberId, type, data) {
        this.io.to(`member-${memberId}`).emit('member-notification', {
            type,
            data,
            timestamp: new Date().toISOString()
        });
    }

    // Notify all admins about new requests or updates
    notifyAdmins(type, data) {
        this.io.to('admin-broadcast').emit('admin-notification', {
            type,
            data,
            timestamp: new Date().toISOString()
        });
    }

    // Notify specific admin
    notifyAdmin(adminId, type, data) {
        this.io.to(`admin-${adminId}`).emit('admin-notification', {
            type,
            data,
            timestamp: new Date().toISOString()
        });
    }

    // Broadcast system-wide notifications
    broadcastNotification(type, data) {
        this.io.emit('system-notification', {
            type,
            data,
            timestamp: new Date().toISOString()
        });
    }

    // Handle new member registration request
    async handleNewMemberRequest(requestData) {
        // Notify all admins about new member request
        this.notifyAdmins('NEW_MEMBER_REQUEST', {
            message: `New member registration request from ${requestData.first_name} ${requestData.last_name}`,
            requestId: requestData.request_id,
            email: requestData.email
        });
    }

    // Handle loan application
    async handleNewLoanApplication(loanData) {
        // Notify admins about new loan application
        this.notifyAdmins('NEW_LOAN_APPLICATION', {
            message: `New loan application for ${loanData.loan_type}`,
            loanId: loanData.loan_id,
            amount: loanData.loan_amount,
            memberId: loanData.member_id
        });
    }

    // Handle transaction updates
    async handleTransactionUpdate(transactionData) {
        // Notify the member about their transaction
        this.notifyMember(transactionData.member_id, 'TRANSACTION_UPDATE', {
            message: `Transaction ${transactionData.transaction_type} of ₹${transactionData.amount}`,
            transactionId: transactionData.transaction_id,
            amount: transactionData.amount,
            type: transactionData.transaction_type
        });
    }

    // Handle notice publication
    async handleNewNotice(noticeData) {
        // Broadcast new notice to all connected clients
        this.broadcastNotification('NEW_NOTICE', {
            message: `New notice: ${noticeData.title}`,
            noticeId: noticeData.notice_id,
            title: noticeData.title,
            type: noticeData.notice_type,
            priority: noticeData.priority
        });
    }

    // Handle interest credit
    async handleInterestCredit(depositData) {
        this.notifyMember(depositData.member_id, 'INTEREST_CREDITED', {
            message: `Interest credited to your ${depositData.deposit_type}`,
            depositId: depositData.deposit_id,
            amount: depositData.interest_amount
        });
    }

    // Get real-time dashboard stats for admins
    async getDashboardStats() {
        try {
            const stats = await Promise.all([
                executeQuery('SELECT COUNT(*) as total FROM members WHERE status = "Active"'),
                executeQuery('SELECT COUNT(*) as total FROM member_requests WHERE status = "Pending"'),
                executeQuery('SELECT COUNT(*) as total FROM loans WHERE status IN ("Applied", "Under Review")'),
                executeQuery('SELECT SUM(loan_amount) as total FROM loans WHERE status = "Active"'),
                executeQuery('SELECT SUM(current_balance) as total FROM deposits WHERE status = "Active"')
            ]);

            return {
                activeMembers: stats[0][0].total,
                pendingRequests: stats[1][0].total,
                pendingLoans: stats[2][0].total,
                activeLoanAmount: stats[3][0].total || 0,
                totalDeposits: stats[4][0].total || 0,
                lastUpdated: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error fetching dashboard stats:', error);
            return null;
        }
    }

    // Periodically update dashboard stats for connected admins
    async broadcastDashboardUpdate() {
        const stats = await this.getDashboardStats();
        if (stats) {
            this.io.to('admin-broadcast').emit('dashboard-update', stats);
        }
    }

    // Handle member login notification
    handleMemberLogin(memberData) {
        this.notifyAdmins('MEMBER_LOGIN', {
            message: `Member ${memberData.name} logged in`,
            memberId: memberData.id,
            email: memberData.email,
            loginTime: new Date().toISOString()
        });
    }

    // Handle admin login notification
    handleAdminLogin(adminData) {
        this.notifyAdmins('ADMIN_LOGIN', {
            message: `Admin ${adminData.name} logged in`,
            adminId: adminData.id,
            username: adminData.username,
            role: adminData.role,
            loginTime: new Date().toISOString()
        });
    }
}

module.exports = RealtimeService;
