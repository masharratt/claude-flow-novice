/**
 * Secure Authentication Client
 * Handles login, token management, and secure API communication
 */

class SecureAuthClient {
    constructor() {
        this.baseURL = window.location.origin;
        this.token = localStorage.getItem('dashboard_access_token');
        this.refreshToken = localStorage.getItem('dashboard_refresh_token');
        this.user = JSON.parse(localStorage.getItem('dashboard_user') || 'null');
        this.tokenRefreshTimer = null;
        this.init();
    }

    init() {
        // Auto-refresh token before expiry
        if (this.token) {
            this.scheduleTokenRefresh();
        }

        // Setup global fetch interceptor
        this.setupFetchInterceptor();

        // Check authentication status on load
        this.checkAuthStatus();
    }

    setupFetchInterceptor() {
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            let [url, options = {}] = args;

            // Add authentication header for API requests
            if (url.startsWith('/api') || url.startsWith(this.baseURL + '/api')) {
                options.headers = {
                    ...options.headers,
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                };
            }

            try {
                const response = await originalFetch(url, options);

                // Handle 401 unauthorized
                if (response.status === 401) {
                    await this.handleUnauthorized();
                    throw new Error('Authentication required');
                }

                // Handle 403 forbidden
                if (response.status === 403) {
                    this.showSecurityMessage('Access denied. Insufficient permissions.');
                    throw new Error('Access forbidden');
                }

                // Handle rate limiting
                if (response.status === 429) {
                    const retryAfter = response.headers.get('Retry-After');
                    this.showSecurityMessage(`Rate limit exceeded. Try again in ${retryAfter || 'a few'} seconds.`);
                    throw new Error('Rate limit exceeded');
                }

                return response;
            } catch (error) {
                console.error('Secure fetch error:', error);
                throw error;
            }
        };
    }

    async login(username, password) {
        try {
            this.showLoading(true);

            const response = await fetch(`${this.baseURL}/api/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Login failed');
            }

            // Store tokens securely
            this.token = data.token || data.accessToken;
            this.refreshToken = data.refreshToken;
            this.user = data.user;

            localStorage.setItem('dashboard_access_token', this.token);
            localStorage.setItem('dashboard_refresh_token', this.refreshToken);
            localStorage.setItem('dashboard_user', JSON.stringify(this.user));

            // Schedule token refresh
            this.scheduleTokenRefresh();

            // Update UI
            this.updateAuthUI();
            this.hideLoginModal();
            this.showSecurityMessage('Login successful', 'success');

            return data;

        } catch (error) {
            console.error('Login error:', error);
            this.showSecurityMessage(error.message || 'Login failed', 'error');
            throw error;
        } finally {
            this.showLoading(false);
        }
    }

    async logout() {
        try {
            if (this.token) {
                await fetch(`${this.baseURL}/api/auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.token}`
                    }
                });
            }
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            // Clear local storage regardless of server response
            this.clearAuthData();
            this.updateAuthUI();
            this.showLoginModal();
            this.showSecurityMessage('Logged out successfully', 'info');
        }
    }

    async refreshAccessToken() {
        try {
            if (!this.refreshToken) {
                throw new Error('No refresh token available');
            }

            const response = await fetch(`${this.baseURL}/api/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ refreshToken: this.refreshToken })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Token refresh failed');
            }

            this.token = data.accessToken;
            localStorage.setItem('dashboard_access_token', this.token);

            // Schedule next refresh
            this.scheduleTokenRefresh();

            return this.token;

        } catch (error) {
            console.error('Token refresh error:', error);
            // If refresh fails, clear auth and redirect to login
            this.clearAuthData();
            this.showLoginModal();
            throw error;
        }
    }

    scheduleTokenRefresh() {
        if (this.tokenRefreshTimer) {
            clearTimeout(this.tokenRefreshTimer);
        }

        // Refresh token 5 minutes before expiry
        const refreshTime = 10 * 60 * 1000; // 10 minutes
        this.tokenRefreshTimer = setTimeout(async () => {
            try {
                await this.refreshAccessToken();
            } catch (error) {
                console.error('Auto token refresh failed:', error);
            }
        }, refreshTime);
    }

    async handleUnauthorized() {
        try {
            // Try to refresh token
            await this.refreshAccessToken();
        } catch (error) {
            // If refresh fails, clear auth and show login
            this.clearAuthData();
            this.showLoginModal();
        }
    }

    clearAuthData() {
        this.token = null;
        this.refreshToken = null;
        this.user = null;

        localStorage.removeItem('dashboard_access_token');
        localStorage.removeItem('dashboard_refresh_token');
        localStorage.removeItem('dashboard_user');

        if (this.tokenRefreshTimer) {
            clearTimeout(this.tokenRefreshTimer);
            this.tokenRefreshTimer = null;
        }
    }

    checkAuthStatus() {
        if (!this.token || !this.user) {
            this.showLoginModal();
            return;
        }

        this.updateAuthUI();
    }

    updateAuthUI() {
        // Update header with user info
        const userInfo = document.getElementById('user-info');
        if (userInfo && this.user) {
            userInfo.innerHTML = `
                <div class="user-details">
                    <span class="user-name">${this.user.username}</span>
                    <span class="user-role">${this.user.role}</span>
                </div>
                <button class="logout-btn" onclick="authClient.logout()">Logout</button>
            `;
        }

        // Update visibility of protected elements
        const protectedElements = document.querySelectorAll('[data-require-permission]');
        protectedElements.forEach(element => {
            const requiredPermission = element.dataset.requirePermission;
            if (this.hasPermission(requiredPermission)) {
                element.style.display = '';
            } else {
                element.style.display = 'none';
            }
        });
    }

    hasPermission(permission) {
        return this.user && this.user.permissions && this.user.permissions.includes(permission);
    }

    showLoginModal() {
        const modal = document.getElementById('login-modal');
        if (modal) {
            modal.style.display = 'flex';
            document.body.classList.add('modal-open');
        } else {
            // Create login modal if it doesn't exist
            this.createLoginModal();
        }
    }

    hideLoginModal() {
        const modal = document.getElementById('login-modal');
        if (modal) {
            modal.style.display = 'none';
            document.body.classList.remove('modal-open');
        }
    }

    createLoginModal() {
        const modalHTML = `
            <div id="login-modal" class="login-modal">
                <div class="login-card">
                    <div class="login-header">
                        <h2>🔐 Secure Dashboard Login</h2>
                        <p>Authentication required to access the performance monitor</p>
                    </div>
                    <form id="login-form" class="login-form">
                        <div class="form-group">
                            <label for="username">Username:</label>
                            <input type="text" id="username" name="username" required autocomplete="username">
                        </div>
                        <div class="form-group">
                            <label for="password">Password:</label>
                            <input type="password" id="password" name="password" required autocomplete="current-password">
                        </div>
                        <button type="submit" class="login-btn">Login</button>
                    </form>
                    <div id="login-message" class="login-message"></div>
                    <div class="security-info">
                        <h3>🔒 Security Notice</h3>
                        <ul>
                            <li>All access is logged and monitored</li>
                            <li>Rate limiting is enforced</li>
                            <li>Sessions automatically expire</li>
                            <li>Use strong, unique passwords</li>
                        </ul>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);

        // Add event listeners
        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;

            try {
                await this.login(username, password);
            } catch (error) {
                // Error already handled in login method
            }
        });

        // Add styles
        this.addLoginStyles();
    }

    addLoginStyles() {
        const styles = `
            <style id="login-styles">
                .login-modal {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.8);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10000;
                    backdrop-filter: blur(5px);
                }

                .login-card {
                    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                    border: 1px solid rgba(0, 212, 255, 0.3);
                    border-radius: 12px;
                    padding: 2rem;
                    width: 100%;
                    max-width: 400px;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
                    color: #ffffff;
                }

                .login-header {
                    text-align: center;
                    margin-bottom: 2rem;
                }

                .login-header h2 {
                    color: #00d4ff;
                    margin-bottom: 0.5rem;
                }

                .login-header p {
                    color: #aaaaaa;
                    font-size: 0.9rem;
                }

                .form-group {
                    margin-bottom: 1.5rem;
                }

                .form-group label {
                    display: block;
                    margin-bottom: 0.5rem;
                    color: #ffffff;
                    font-weight: 500;
                }

                .form-group input {
                    width: 100%;
                    padding: 0.75rem;
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 6px;
                    color: #ffffff;
                    font-size: 1rem;
                    transition: all 0.3s ease;
                }

                .form-group input:focus {
                    outline: none;
                    border-color: #00d4ff;
                    background: rgba(255, 255, 255, 0.15);
                    box-shadow: 0 0 10px rgba(0, 212, 255, 0.3);
                }

                .login-btn {
                    width: 100%;
                    padding: 0.75rem;
                    background: linear-gradient(135deg, #00d4ff 0%, #0099cc 100%);
                    border: none;
                    border-radius: 6px;
                    color: #ffffff;
                    font-size: 1rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.3s ease;
                }

                .login-btn:hover {
                    background: linear-gradient(135deg, #00b8e6 0%, #0088bb 100%);
                    transform: translateY(-1px);
                    box-shadow: 0 5px 15px rgba(0, 212, 255, 0.4);
                }

                .login-btn:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                    transform: none;
                }

                .login-message {
                    margin-top: 1rem;
                    padding: 0.75rem;
                    border-radius: 6px;
                    text-align: center;
                    font-size: 0.9rem;
                }

                .login-message.error {
                    background: rgba(255, 59, 48, 0.2);
                    border: 1px solid rgba(255, 59, 48, 0.5);
                    color: #ff3b30;
                }

                .login-message.success {
                    background: rgba(52, 199, 89, 0.2);
                    border: 1px solid rgba(52, 199, 89, 0.5);
                    color: #34c759;
                }

                .login-message.info {
                    background: rgba(0, 122, 255, 0.2);
                    border: 1px solid rgba(0, 122, 255, 0.5);
                    color: #007aff;
                }

                .security-info {
                    margin-top: 2rem;
                    padding-top: 1.5rem;
                    border-top: 1px solid rgba(255, 255, 255, 0.1);
                }

                .security-info h3 {
                    color: #00d4ff;
                    font-size: 0.9rem;
                    margin-bottom: 0.5rem;
                }

                .security-info ul {
                    list-style: none;
                    padding: 0;
                }

                .security-info li {
                    font-size: 0.8rem;
                    color: #aaaaaa;
                    margin-bottom: 0.25rem;
                    padding-left: 1rem;
                    position: relative;
                }

                .security-info li:before {
                    content: "•";
                    position: absolute;
                    left: 0;
                    color: #00d4ff;
                }

                .modal-open {
                    overflow: hidden;
                }

                .user-info {
                    display: flex;
                    align-items: center;
                    gap: 1rem;
                    padding: 0.5rem 1rem;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 8px;
                }

                .user-details {
                    display: flex;
                    flex-direction: column;
                }

                .user-name {
                    font-weight: 600;
                    color: #ffffff;
                }

                .user-role {
                    font-size: 0.8rem;
                    color: #00d4ff;
                }

                .logout-btn {
                    padding: 0.5rem 1rem;
                    background: rgba(255, 59, 48, 0.2);
                    border: 1px solid rgba(255, 59, 48, 0.5);
                    border-radius: 6px;
                    color: #ff3b30;
                    cursor: pointer;
                    transition: all 0.3s ease;
                }

                .logout-btn:hover {
                    background: rgba(255, 59, 48, 0.3);
                }

                .loading-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10001;
                    backdrop-filter: blur(3px);
                }

                .loading-spinner {
                    width: 40px;
                    height: 40px;
                    border: 3px solid rgba(255, 255, 255, 0.3);
                    border-top: 3px solid #00d4ff;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }

                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        `;

        document.head.insertAdjacentHTML('beforeend', styles);
    }

    showSecurityMessage(message, type = 'info') {
        const messageElement = document.getElementById('login-message');
        if (messageElement) {
            messageElement.textContent = message;
            messageElement.className = `login-message ${type}`;

            // Auto-hide after 5 seconds
            setTimeout(() => {
                messageElement.textContent = '';
                messageElement.className = 'login-message';
            }, 5000);
        }
    }

    showLoading(show) {
        let overlay = document.getElementById('loading-overlay');

        if (show) {
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'loading-overlay';
                overlay.className = 'loading-overlay';
                overlay.innerHTML = '<div class="loading-spinner"></div>';
                document.body.appendChild(overlay);
            }
        } else {
            if (overlay) {
                overlay.remove();
            }
        }
    }

    // Public API methods
    isAuthenticated() {
        return !!this.token && !!this.user;
    }

    getUser() {
        return this.user;
    }

    getCurrentToken() {
        return this.token;
    }
}

// Initialize authentication client
window.authClient = new SecureAuthClient();

// Make it available globally
window.SecureAuthClient = SecureAuthClient;