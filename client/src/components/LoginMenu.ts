import '../styles/login.css';
import * as api from '../utils/api';
import { eventBus } from '../utils/EventBus';
import { navigateTo } from '../router';

export class LoginMenu {
  private container: HTMLDivElement;
  private errorEl: HTMLDivElement;
  private loginForm: HTMLDivElement;
  private registerForm: HTMLDivElement;
  private devBtn: HTMLButtonElement;
  private submitBtn: HTMLButtonElement;
  private registerBtn: HTMLButtonElement;
  private submitting = false;

  constructor() {
    this.container = document.getElementById('login-menu') as HTMLDivElement;
    this.container.innerHTML = '';
    this.container.appendChild(this.buildTerminal());
    this.errorEl = this.container.querySelector('.login-error') as HTMLDivElement;
    this.loginForm = this.container.querySelector('.login-form') as HTMLDivElement;
    this.registerForm = this.container.querySelector('.register-form') as HTMLDivElement;
    this.devBtn = this.container.querySelector('.login-btn-dev') as HTMLButtonElement;
    this.submitBtn = this.container.querySelector('.login-btn-submit') as HTMLButtonElement;
    this.registerBtn = this.container.querySelector('.login-btn-register') as HTMLButtonElement;
    this.bindEvents();
  }

  private buildTerminal(): HTMLDivElement {
    const terminal = document.createElement('div');
    terminal.className = 'login-terminal';
    terminal.innerHTML = `
      <h1>LAS FLORES 2077</h1>
      <div class="login-subtitle">INITIATIVE TERMINAL v2.0</div>
      <div class="login-error"></div>

      <button class="login-btn-dev">> DEV LOGIN</button>

      <div class="login-form">
        <div class="login-form-group">
          <label>&gt; EMAIL</label>
          <input type="email" class="login-input-email" placeholder="EMAIL" autocomplete="email" />
        </div>
        <div class="login-form-group">
          <label>&gt; PASSWORD</label>
          <input type="password" class="login-input-password" placeholder="PASSWORD" autocomplete="current-password" />
        </div>
        <button class="login-btn-submit">&gt; LOGIN</button>
        <button class="login-btn-text login-btn-toggle-register">[ CREATE ACCOUNT ]</button>
      </div>

      <div class="register-form">
        <div class="login-form-group">
          <label>&gt; EMAIL</label>
          <input type="email" class="register-input-email" placeholder="EMAIL" autocomplete="email" />
        </div>
        <div class="login-form-group">
          <label>&gt; USERNAME</label>
          <input type="text" class="register-input-username" placeholder="USERNAME" autocomplete="username" />
        </div>
        <div class="login-form-group">
          <label>&gt; PASSWORD</label>
          <input type="password" class="register-input-password" placeholder="PASSWORD" autocomplete="new-password" />
        </div>
        <button class="login-btn-register">&gt; REGISTER</button>
        <button class="login-btn-text login-btn-toggle-login">[ BACK TO LOGIN ]</button>
      </div>
    `;
    return terminal;
  }

  private bindEvents(): void {
    this.devBtn.addEventListener('click', () => this.handleDevLogin());
    this.submitBtn.addEventListener('click', () => this.handleLogin());
    this.registerBtn.addEventListener('click', () => this.handleRegister());

    this.container.querySelector('.login-btn-toggle-register')?.addEventListener('click', () => this.toggleForms(true));
    this.container.querySelector('.login-btn-toggle-login')?.addEventListener('click', () => this.toggleForms(false));

    this.container.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      if (this.registerForm.classList.contains('visible')) {
        this.handleRegister();
      } else {
        this.handleLogin();
      }
    });
  }

  private toggleForms(showRegister: boolean): void {
    this.loginForm.classList.toggle('hidden', showRegister);
    this.registerForm.classList.toggle('visible', showRegister);
    this.clearError();
  }

  private clearError(): void {
    this.errorEl.textContent = '';
    this.errorEl.classList.remove('visible');
  }

  private showError(msg: string): void {
    this.errorEl.textContent = msg;
    this.errorEl.classList.add('visible');
  }

  private setSubmitting(v: boolean): void {
    this.submitting = v;
    this.devBtn.disabled = v;
    this.submitBtn.disabled = v;
    this.registerBtn.disabled = v;
  }

  private async handleDevLogin(): Promise<void> {
    if (this.submitting) return;
    this.setSubmitting(true);
    this.clearError();
    try {
      const result = await api.devLogin();
      if (result.success !== false) {
        navigateTo('/main');
      } else {
        this.showError(result.error || 'Dev login failed');
      }
    } catch (err: any) {
      this.showError(err.message || 'Connection failed');
    } finally {
      this.setSubmitting(false);
    }
  }

  private async handleLogin(): Promise<void> {
    if (this.submitting) return;
    const email = (this.container.querySelector('.login-input-email') as HTMLInputElement).value.trim();
    const password = (this.container.querySelector('.login-input-password') as HTMLInputElement).value;
    if (!email) { this.showError('Enter your email'); return; }
    if (!password) { this.showError('Enter your password'); return; }
    this.setSubmitting(true);
    this.clearError();
    try {
      const result = await api.login(email, password);
      if (result.success !== false) {
        navigateTo('/main');
      } else {
        this.showError(result.error || 'Login failed');
      }
    } catch (err: any) {
      this.showError(err.message || 'Connection failed');
    } finally {
      this.setSubmitting(false);
    }
  }

  private async handleRegister(): Promise<void> {
    if (this.submitting) return;
    const email = (this.container.querySelector('.register-input-email') as HTMLInputElement).value.trim();
    const username = (this.container.querySelector('.register-input-username') as HTMLInputElement).value.trim();
    const password = (this.container.querySelector('.register-input-password') as HTMLInputElement).value;
    if (!email) { this.showError('Enter your email'); return; }
    if (!username) { this.showError('Choose a username'); return; }
    if (!password || password.length < 4) { this.showError('Password must be at least 4 characters'); return; }
    this.setSubmitting(true);
    this.clearError();
    try {
      const result = await api.register(email, username, password);
      if (result.success !== false) {
        navigateTo('/main');
      } else {
        this.showError(result.error || 'Registration failed');
      }
    } catch (err: any) {
      this.showError(err.message || 'Connection failed');
    } finally {
      this.setSubmitting(false);
    }
  }

  destroy(): void {
    this.container.innerHTML = '';
  }
}
