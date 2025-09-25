import { test, expect } from '@playwright/test';
import { AuthPage } from '../../utils/pages/auth-page';
import { DashboardPage } from '../../utils/pages/dashboard-page';

/**
 * Authentication User Flow Tests
 *
 * Critical user journeys for authentication:
 * - Login flow
 * - Registration flow
 * - Password reset flow
 * - Multi-factor authentication
 * - Session management
 */

test.describe('Authentication User Flows', () => {
  let authPage: AuthPage;
  let dashboardPage: DashboardPage;

  test.beforeEach(async ({ page }) => {
    authPage = new AuthPage(page);
    dashboardPage = new DashboardPage(page);
  });

  test.describe('Login Flow', () => {
    test('should login with valid credentials', async ({ page }) => {
      await test.step('Navigate to login page', async () => {
        await authPage.navigate();
        await expect(authPage.loginForm).toBeVisible();
      });

      await test.step('Fill login credentials', async () => {
        await authPage.fillLoginForm('user@test.com', 'user123');
      });

      await test.step('Submit login form', async () => {
        await authPage.submitLogin();
      });

      await test.step('Verify successful login', async () => {
        await expect(page).toHaveURL(/\/dashboard/);
        await expect(dashboardPage.userMenu).toBeVisible();
        await expect(dashboardPage.welcomeMessage).toContainText('Welcome back');
      });
    });

    test('should show error for invalid credentials', async ({ page }) => {
      await authPage.navigate();
      await authPage.fillLoginForm('invalid@test.com', 'wrongpassword');
      await authPage.submitLogin();

      await expect(authPage.errorMessage).toBeVisible();
      await expect(authPage.errorMessage).toContainText('Invalid credentials');
    });

    test('should validate required fields', async ({ page }) => {
      await authPage.navigate();
      await authPage.submitLogin();

      await expect(authPage.emailError).toContainText('Email is required');
      await expect(authPage.passwordError).toContainText('Password is required');
    });

    test('should remember user preference', async ({ page }) => {
      await authPage.navigate();
      await authPage.fillLoginForm('user@test.com', 'user123');
      await authPage.checkRememberMe();
      await authPage.submitLogin();

      // Verify login persistence after page refresh
      await page.reload();
      await expect(dashboardPage.userMenu).toBeVisible();
    });
  });

  test.describe('Registration Flow', () => {
    test('should register new user successfully', async ({ page }) => {
      const newUser = {
        email: `test+${Date.now()}@example.com`,
        password: 'SecurePass123!',
        firstName: 'Test',
        lastName: 'User'
      };

      await test.step('Navigate to registration page', async () => {
        await authPage.navigate();
        await authPage.clickRegisterLink();
        await expect(authPage.registerForm).toBeVisible();
      });

      await test.step('Fill registration form', async () => {
        await authPage.fillRegistrationForm(newUser);
      });

      await test.step('Submit registration', async () => {
        await authPage.submitRegistration();
      });

      await test.step('Verify successful registration', async () => {
        await expect(authPage.successMessage).toContainText('Registration successful');
        await expect(page).toHaveURL(/\/verify-email/);
      });
    });

    test('should validate password strength', async ({ page }) => {
      await authPage.navigate();
      await authPage.clickRegisterLink();

      await authPage.fillRegistrationForm({
        email: 'test@example.com',
        password: 'weak',
        firstName: 'Test',
        lastName: 'User'
      });

      await expect(authPage.passwordStrength).toContainText('Password too weak');
    });

    test('should prevent duplicate email registration', async ({ page }) => {
      await authPage.navigate();
      await authPage.clickRegisterLink();

      await authPage.fillRegistrationForm({
        email: 'user@test.com', // Existing user
        password: 'SecurePass123!',
        firstName: 'Test',
        lastName: 'User'
      });

      await authPage.submitRegistration();
      await expect(authPage.errorMessage).toContainText('Email already registered');
    });
  });

  test.describe('Password Reset Flow', () => {
    test('should initiate password reset', async ({ page }) => {
      await test.step('Navigate to forgot password', async () => {
        await authPage.navigate();
        await authPage.clickForgotPasswordLink();
        await expect(authPage.resetPasswordForm).toBeVisible();
      });

      await test.step('Submit reset request', async () => {
        await authPage.fillResetPasswordEmail('user@test.com');
        await authPage.submitResetPassword();
      });

      await test.step('Verify reset email sent', async () => {
        await expect(authPage.successMessage).toContainText('Reset link sent to your email');
      });
    });

    test('should validate email format in reset form', async ({ page }) => {
      await authPage.navigate();
      await authPage.clickForgotPasswordLink();
      await authPage.fillResetPasswordEmail('invalid-email');
      await authPage.submitResetPassword();

      await expect(authPage.emailError).toContainText('Invalid email format');
    });
  });

  test.describe('Multi-Factor Authentication', () => {
    test('should handle MFA flow', async ({ page }) => {
      // Login with MFA-enabled user
      await authPage.navigate();
      await authPage.fillLoginForm('mfa-user@test.com', 'mfa123');
      await authPage.submitLogin();

      // Expect MFA challenge
      await expect(authPage.mfaForm).toBeVisible();
      await expect(authPage.mfaInstructions).toContainText('Enter verification code');

      // Submit MFA code
      await authPage.fillMfaCode('123456');
      await authPage.submitMfaCode();

      // Verify successful login
      await expect(page).toHaveURL(/\/dashboard/);
      await expect(dashboardPage.userMenu).toBeVisible();
    });

    test('should handle invalid MFA code', async ({ page }) => {
      await authPage.navigate();
      await authPage.fillLoginForm('mfa-user@test.com', 'mfa123');
      await authPage.submitLogin();

      await authPage.fillMfaCode('000000');
      await authPage.submitMfaCode();

      await expect(authPage.errorMessage).toContainText('Invalid verification code');
    });
  });

  test.describe('Session Management', () => {
    test('should logout user successfully', async ({ page }) => {
      // Login first
      await authPage.navigate();
      await authPage.fillLoginForm('user@test.com', 'user123');
      await authPage.submitLogin();

      // Logout
      await dashboardPage.clickUserMenu();
      await dashboardPage.clickLogout();

      // Verify logout
      await expect(page).toHaveURL(/\/login/);
      await expect(authPage.loginForm).toBeVisible();
    });

    test('should handle session timeout', async ({ page }) => {
      // Simulate expired session
      await page.context().addCookies([{
        name: 'session',
        value: 'expired-token',
        domain: 'localhost',
        path: '/'
      }]);

      await page.goto('/dashboard');

      // Should redirect to login
      await expect(page).toHaveURL(/\/login/);
      await expect(authPage.warningMessage).toContainText('Session expired');
    });

    test('should maintain session across tabs', async ({ context }) => {
      const page1 = await context.newPage();
      const page2 = await context.newPage();

      // Login in first tab
      const authPage1 = new AuthPage(page1);
      await authPage1.navigate();
      await authPage1.fillLoginForm('user@test.com', 'user123');
      await authPage1.submitLogin();

      // Navigate to dashboard in second tab
      await page2.goto('/dashboard');

      // Should be logged in automatically
      const dashboardPage2 = new DashboardPage(page2);
      await expect(dashboardPage2.userMenu).toBeVisible();
    });
  });

  test.describe('Accessibility and UX', () => {
    test('should be keyboard navigable', async ({ page }) => {
      await authPage.navigate();

      // Tab through form elements
      await page.keyboard.press('Tab'); // Email field
      await expect(authPage.emailInput).toBeFocused();

      await page.keyboard.press('Tab'); // Password field
      await expect(authPage.passwordInput).toBeFocused();

      await page.keyboard.press('Tab'); // Login button
      await expect(authPage.loginButton).toBeFocused();

      // Submit with Enter
      await authPage.emailInput.fill('user@test.com');
      await authPage.passwordInput.fill('user123');
      await page.keyboard.press('Enter');

      await expect(page).toHaveURL(/\/dashboard/);
    });

    test('should have proper ARIA labels', async ({ page }) => {
      await authPage.navigate();

      await expect(authPage.emailInput).toHaveAttribute('aria-label', 'Email address');
      await expect(authPage.passwordInput).toHaveAttribute('aria-label', 'Password');
      await expect(authPage.loginButton).toHaveAttribute('aria-label', 'Log in to your account');
    });

    test('should show loading states', async ({ page }) => {
      await authPage.navigate();
      await authPage.fillLoginForm('user@test.com', 'user123');

      // Check loading state appears briefly
      await Promise.all([
        page.waitForResponse('/api/auth/login'),
        authPage.submitLogin()
      ]);

      await expect(authPage.loginButton).toHaveAttribute('aria-busy', 'true');
    });
  });
});