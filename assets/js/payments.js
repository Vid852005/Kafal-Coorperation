// UPI Payment System for KAFAL Cooperative Society
class PaymentSystem {
    constructor() {
        this.api = new API();
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadPaymentHistory();
    }

    bindEvents() {
        // Payment request form
        const paymentForm = document.getElementById('paymentForm');
        if (paymentForm) {
            paymentForm.addEventListener('submit', (e) => this.handlePaymentRequest(e));
        }

        // Payment confirmation
        const confirmPaymentBtn = document.getElementById('confirmPayment');
        if (confirmPaymentBtn) {
            confirmPaymentBtn.addEventListener('click', () => this.confirmPayment());
        }

        // Refresh payment status
        const refreshStatusBtn = document.getElementById('refreshStatus');
        if (refreshStatusBtn) {
            refreshStatusBtn.addEventListener('click', () => this.refreshPaymentStatus());
        }
    }

    async handlePaymentRequest(event) {
        event.preventDefault();
        
        const formData = new FormData(event.target);
        const paymentData = {
            amount: parseFloat(formData.get('amount')),
            purpose: formData.get('purpose'),
            description: formData.get('description')
        };

        try {
            this.showLoading('Generating UPI payment request...');
            
            const response = await this.api.post('/payments/upi/generate', paymentData);
            
            if (response.success) {
                this.displayPaymentRequest(response.data);
                this.hideLoading();
                this.showSuccess('UPI payment request generated successfully!');
            } else {
                throw new Error(response.message);
            }
        } catch (error) {
            this.hideLoading();
            this.showError('Failed to generate payment request: ' + error.message);
        }
    }

    displayPaymentRequest(data) {
        const paymentDetails = document.getElementById('paymentDetails');
        if (!paymentDetails) return;

        const expiryTime = new Date(data.expires_at);
        const timeRemaining = this.getTimeRemaining(expiryTime);

        paymentDetails.innerHTML = `
            <div class="payment-request-card">
                <div class="payment-header">
                    <h3>UPI Payment Request</h3>
                    <span class="transaction-id">${data.transaction_id}</span>
                </div>
                
                <div class="payment-info">
                    <div class="amount-display">
                        <span class="currency">₹</span>
                        <span class="amount">${data.amount.toLocaleString()}</span>
                    </div>
                    
                    <div class="payment-details">
                        <p><strong>Pay to:</strong> KAFAL Cooperative Society</p>
                        <p><strong>UPI ID:</strong> ${data.upi_id}</p>
                        <p><strong>Purpose:</strong> ${this.formatPurpose(data.purpose)}</p>
                        <p><strong>Member:</strong> ${data.member_name}</p>
                        <p><strong>Account:</strong> ${data.account_number}</p>
                        ${data.description ? `<p><strong>Description:</strong> ${data.description}</p>` : ''}
                    </div>
                </div>

                <div class="payment-timer">
                    <p class="timer-text">Time remaining: <span id="countdown">${timeRemaining}</span></p>
                </div>

                <div class="payment-actions">
                    <button class="btn-primary" onclick="window.open('${data.payment_url}', '_blank')">
                        <i class="fas fa-mobile-alt"></i> Pay with UPI App
                    </button>
                    <button class="btn-secondary" onclick="this.copyUPIId('${data.upi_id}')">
                        <i class="fas fa-copy"></i> Copy UPI ID
                    </button>
                </div>

                <div class="qr-code-section">
                    <div id="qrcode-${data.transaction_id}"></div>
                    <p>Scan QR code with any UPI app</p>
                </div>

                <div class="payment-instructions">
                    <h4>Payment Instructions:</h4>
                    <ol>
                        <li>Open any UPI app (PhonePe, Google Pay, Paytm, etc.)</li>
                        <li>Scan the QR code or use UPI ID: <strong>${data.upi_id}</strong></li>
                        <li>Enter amount: <strong>₹${data.amount}</strong></li>
                        <li>Add note: <strong>${data.purpose} - ${data.account_number}</strong></li>
                        <li>Complete the payment</li>
                        <li>Click "I've Paid" button below after payment</li>
                    </ol>
                </div>

                <div class="confirmation-section">
                    <button id="confirmPayment" class="btn-success" data-transaction-id="${data.transaction_id}">
                        <i class="fas fa-check"></i> I've Paid
                    </button>
                    <button id="refreshStatus" class="btn-outline" data-transaction-id="${data.transaction_id}">
                        <i class="fas fa-refresh"></i> Check Status
                    </button>
                </div>
            </div>
        `;

        // Generate QR code
        this.generateQRCode(data.payment_url, `qrcode-${data.transaction_id}`);
        
        // Start countdown timer
        this.startCountdown(expiryTime);
        
        // Store transaction ID for status checking
        this.currentTransactionId = data.transaction_id;
    }

    generateQRCode(paymentUrl, elementId) {
        const qrContainer = document.getElementById(elementId);
        if (qrContainer && typeof QRCode !== 'undefined') {
            new QRCode(qrContainer, {
                text: paymentUrl,
                width: 200,
                height: 200,
                colorDark: "#000000",
                colorLight: "#ffffff"
            });
        }
    }

    startCountdown(expiryTime) {
        const countdownElement = document.getElementById('countdown');
        if (!countdownElement) return;

        const timer = setInterval(() => {
            const timeRemaining = this.getTimeRemaining(expiryTime);
            countdownElement.textContent = timeRemaining;

            if (new Date() >= expiryTime) {
                clearInterval(timer);
                countdownElement.textContent = 'EXPIRED';
                this.handlePaymentExpiry();
            }
        }, 1000);
    }

    getTimeRemaining(expiryTime) {
        const now = new Date();
        const diff = expiryTime - now;

        if (diff <= 0) return 'EXPIRED';

        const minutes = Math.floor(diff / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    async confirmPayment() {
        const transactionId = this.currentTransactionId;
        if (!transactionId) {
            this.showError('No active payment request found');
            return;
        }

        try {
            this.showLoading('Confirming payment...');
            
            const response = await this.api.post('/payments/upi/confirm', {
                transaction_id: transactionId
            });

            if (response.success) {
                this.hideLoading();
                this.showPaymentSuccess(response.data);
                this.loadPaymentHistory(); // Refresh history
            } else {
                throw new Error(response.message);
            }
        } catch (error) {
            this.hideLoading();
            this.showError('Payment confirmation failed: ' + error.message);
        }
    }

    async refreshPaymentStatus() {
        const transactionId = this.currentTransactionId;
        if (!transactionId) return;

        try {
            const response = await this.api.get(`/payments/status/${transactionId}`);
            
            if (response.success) {
                const status = response.data.payment_status;
                this.updatePaymentStatus(status);
                
                if (status === 'completed') {
                    this.showPaymentSuccess(response.data);
                    this.loadPaymentHistory();
                }
            }
        } catch (error) {
            console.error('Status check failed:', error);
        }
    }

    showPaymentSuccess(data) {
        const paymentDetails = document.getElementById('paymentDetails');
        if (!paymentDetails) return;

        paymentDetails.innerHTML = `
            <div class="payment-success">
                <div class="success-icon">
                    <i class="fas fa-check-circle"></i>
                </div>
                <h3>Payment Successful!</h3>
                <p>Your payment has been confirmed and processed.</p>
                <div class="success-details">
                    <p><strong>Transaction ID:</strong> ${data.transaction_id}</p>
                    <p><strong>Status:</strong> <span class="status-completed">Completed</span></p>
                    ${data.receipt_generated ? '<p><strong>Receipt:</strong> Generated</p>' : ''}
                </div>
                <div class="success-actions">
                    <button class="btn-primary" onclick="window.location.reload()">
                        Make Another Payment
                    </button>
                    <button class="btn-outline" onclick="this.viewReceipt('${data.transaction_id}')">
                        View Receipt
                    </button>
                </div>
            </div>
        `;
    }

    async loadPaymentHistory() {
        const historyContainer = document.getElementById('paymentHistory');
        if (!historyContainer) return;

        try {
            const response = await this.api.get('/payments/history?limit=10');
            
            if (response.success) {
                this.displayPaymentHistory(response.data.payments);
            }
        } catch (error) {
            console.error('Failed to load payment history:', error);
        }
    }

    displayPaymentHistory(payments) {
        const historyContainer = document.getElementById('paymentHistory');
        if (!historyContainer) return;

        if (payments.length === 0) {
            historyContainer.innerHTML = '<p class="no-data">No payment history found.</p>';
            return;
        }

        const historyHTML = payments.map(payment => `
            <div class="payment-history-item">
                <div class="payment-info">
                    <div class="payment-amount">₹${parseFloat(payment.amount).toLocaleString()}</div>
                    <div class="payment-purpose">${this.formatPurpose(payment.purpose)}</div>
                    <div class="payment-date">${new Date(payment.created_at).toLocaleDateString()}</div>
                </div>
                <div class="payment-status">
                    <span class="status-${payment.payment_status}">${payment.payment_status.toUpperCase()}</span>
                    ${payment.receipt_number ? `<button class="btn-small" onclick="this.viewReceipt('${payment.receipt_number}')">Receipt</button>` : ''}
                </div>
            </div>
        `).join('');

        historyContainer.innerHTML = `
            <div class="payment-history">
                <h3>Payment History</h3>
                ${historyHTML}
            </div>
        `;
    }

    formatPurpose(purpose) {
        const purposes = {
            'membership_fee': 'Membership Fee',
            'share_purchase': 'Share Purchase',
            'loan_repayment': 'Loan Repayment',
            'deposit': 'Deposit',
            'other': 'Other'
        };
        return purposes[purpose] || purpose;
    }

    copyUPIId(upiId) {
        navigator.clipboard.writeText(upiId).then(() => {
            this.showSuccess('UPI ID copied to clipboard!');
        }).catch(() => {
            this.showError('Failed to copy UPI ID');
        });
    }

    updatePaymentStatus(status) {
        const statusElements = document.querySelectorAll('.payment-status');
        statusElements.forEach(el => {
            el.className = `payment-status status-${status}`;
            el.textContent = status.toUpperCase();
        });
    }

    handlePaymentExpiry() {
        const paymentActions = document.querySelector('.payment-actions');
        if (paymentActions) {
            paymentActions.innerHTML = `
                <div class="payment-expired">
                    <p>This payment request has expired.</p>
                    <button class="btn-primary" onclick="window.location.reload()">
                        Generate New Request
                    </button>
                </div>
            `;
        }
    }

    showLoading(message) {
        const loader = document.getElementById('loadingIndicator');
        if (loader) {
            loader.style.display = 'block';
            loader.textContent = message;
        }
    }

    hideLoading() {
        const loader = document.getElementById('loadingIndicator');
        if (loader) {
            loader.style.display = 'none';
        }
    }

    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    showNotification(message, type) {
        // Use existing notification system from main.js
        if (typeof showNotification === 'function') {
            showNotification(message, type);
        } else {
            alert(message);
        }
    }

    async viewReceipt(receiptNumber) {
        try {
            const response = await this.api.get(`/payments/receipt/${receiptNumber}`);
            
            if (response.success) {
                this.displayReceipt(response.data);
            } else {
                throw new Error(response.message);
            }
        } catch (error) {
            this.showError('Failed to load receipt: ' + error.message);
        }
    }

    displayReceipt(receiptData) {
        const modal = document.createElement('div');
        modal.className = 'receipt-modal';
        modal.innerHTML = `
            <div class="receipt-content">
                <div class="receipt-header">
                    <button class="close-btn" onclick="this.parentElement.parentElement.parentElement.remove()">×</button>
                    <h2>Payment Receipt</h2>
                </div>
                <div class="receipt-body">
                    <div class="society-info">
                        <h3>KAFAL Co-operative Urban Thrift & Credit Society Ltd.</h3>
                        <p>Registration No: 10405(E) | Date: 03.05.2016</p>
                    </div>
                    <div class="receipt-details">
                        <p><strong>Receipt No:</strong> ${receiptData.receipt_number}</p>
                        <p><strong>Date:</strong> ${new Date(receiptData.payment_date).toLocaleString()}</p>
                        <p><strong>Member:</strong> ${receiptData.first_name} ${receiptData.last_name}</p>
                        <p><strong>Account:</strong> ${receiptData.account_number}</p>
                        <p><strong>Amount:</strong> ₹${parseFloat(receiptData.amount).toLocaleString()}</p>
                        <p><strong>Purpose:</strong> ${this.formatPurpose(receiptData.purpose)}</p>
                        <p><strong>Transaction ID:</strong> ${receiptData.transaction_id}</p>
                        <p><strong>Bank Reference:</strong> ${receiptData.bank_reference}</p>
                    </div>
                </div>
                <div class="receipt-footer">
                    <button class="btn-primary" onclick="window.print()">Print Receipt</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }
}

// Initialize payment system when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('paymentForm') || document.getElementById('paymentHistory')) {
        window.paymentSystem = new PaymentSystem();
    }
});

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PaymentSystem;
}
