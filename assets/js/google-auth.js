// Google OAuth Integration for Kafal Cooperative Society
// Handles Google Sign-In for both members and admins

class GoogleAuth {
    constructor() {
        this.clientId = ''; // Will be set from environment or config
        this.isInitialized = false;
        this.gapi = null;
    }

    // Initialize Google API
    async init() {
        try {
            // Load Google API script
            await this.loadGoogleAPI();
            
            // Initialize gapi
            await new Promise((resolve) => {
                window.gapi.load('auth2', resolve);
            });

            // Initialize auth2
            this.auth2 = window.gapi.auth2.init({
                client_id: this.clientId || 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com'
            });

            this.isInitialized = true;
            console.log('Google Auth initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Google Auth:', error);
            this.showFallbackMessage();
        }
    }

    // Load Google API script dynamically
    loadGoogleAPI() {
        return new Promise((resolve, reject) => {
            if (window.gapi) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://apis.google.com/js/api.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    // Sign in with Google
    async signIn(userType = 'member') {
        if (!this.isInitialized) {
            await this.init();
        }

        try {
            const authInstance = window.gapi.auth2.getAuthInstance();
            const user = await authInstance.signIn({
                scope: 'profile email'
            });

            const profile = user.getBasicProfile();
            const userData = {
                googleId: profile.getId(),
                email: profile.getEmail(),
                firstName: profile.getGivenName(),
                lastName: profile.getFamilyName(),
                profileImage: profile.getImageUrl(),
                userType: userType
            };

            // Send to backend for verification/registration
            return await this.handleGoogleAuth(userData);

        } catch (error) {
            console.error('Google Sign-In failed:', error);
            throw new Error('Google authentication failed');
        }
    }

    // Handle Google authentication with backend
    async handleGoogleAuth(userData) {
        try {
            const endpoint = userData.userType === 'admin' 
                ? '/api/auth/google/admin' 
                : '/api/auth/google/member';

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(userData)
            });

            const result = await response.json();

            if (result.success) {
                // Store tokens
                localStorage.setItem('auth_token', result.data.token);
                if (result.data.refreshToken) {
                    localStorage.setItem('refresh_token', result.data.refreshToken);
                }

                return result;
            } else {
                throw new Error(result.message || 'Authentication failed');
            }

        } catch (error) {
            console.error('Backend authentication failed:', error);
            throw error;
        }
    }

    // Sign out
    async signOut() {
        try {
            if (this.isInitialized && window.gapi.auth2) {
                const authInstance = window.gapi.auth2.getAuthInstance();
                await authInstance.signOut();
            }

            // Clear local storage
            localStorage.removeItem('auth_token');
            localStorage.removeItem('refresh_token');

        } catch (error) {
            console.error('Google Sign-Out failed:', error);
        }
    }

    // Show fallback message when Google Auth fails
    showFallbackMessage() {
        const message = `
            <div class="google-auth-fallback">
                <p><i class="fas fa-exclamation-triangle"></i> Google Sign-In is currently unavailable.</p>
                <p>Please use email/password authentication or contact support.</p>
            </div>
        `;
        
        // Find Google login buttons and replace with message
        const googleButtons = document.querySelectorAll('.btn-google, [onclick*="loginWithGoogle"]');
        googleButtons.forEach(button => {
            button.style.display = 'none';
            button.insertAdjacentHTML('afterend', message);
        });
    }
}

// Global instance
const googleAuth = new GoogleAuth();

// Global functions for backward compatibility
window.loginWithGoogle = async function(userType = 'member') {
    try {
        kafalAPI.showLoading(true);
        const result = await googleAuth.signIn(userType);
        
        if (result.success) {
            kafalAPI.showNotification('Google authentication successful!', 'success');
            
            // Redirect based on user type
            const redirectUrl = userType === 'admin' 
                ? 'admin-dashboard.html' 
                : 'member-dashboard.html';
            
            setTimeout(() => {
                window.location.href = redirectUrl;
            }, 1000);
        }
    } catch (error) {
        kafalAPI.showNotification('Google authentication failed: ' + error.message, 'error');
    } finally {
        kafalAPI.showLoading(false);
    }
};

window.signInWithGoogle = function() {
    return loginWithGoogle('member');
};

window.adminGoogleLogin = function() {
    return loginWithGoogle('admin');
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Auto-initialize Google Auth
    googleAuth.init().catch(console.error);
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GoogleAuth;
}
