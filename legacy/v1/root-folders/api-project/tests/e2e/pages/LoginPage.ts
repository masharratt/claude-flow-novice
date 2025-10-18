import { Page, expect } from '@playwright/test';

export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/');
  }

  async login(email: string, password: string) {
    await this.page.fill('input[name="email"]', email);
    await this.page.fill('input[name="password"]', password);
    await this.page.click('button[type="submit"]');
  }

  async getErrorMessage(): Promise<string> {
    const errorElement = this.page.locator('.error-message');
    await expect(errorElement).toBeVisible();
    return await errorElement.textContent() || '';
  }

  async getSuccessMessage(): Promise<string> {
    const successElement = this.page.locator('.success-message');
    await expect(successElement).toBeVisible();
    return await successElement.textContent() || '';
  }

  async isLoginFormVisible(): Promise<boolean> {
    return await this.page.locator('#login-form').isVisible();
  }

  async isDashboardVisible(): Promise<boolean> {
    return await this.page.locator('#dashboard').isVisible();
  }
}