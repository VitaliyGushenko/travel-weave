import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AuthService } from '../core/auth.service';

const ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Неверная почта или пароль',
  'auth/wrong-password': 'Неверный пароль',
  'auth/user-not-found': 'Пользователь не найден',
  'auth/email-already-in-use': 'Эта почта уже занята',
  'auth/weak-password': 'Пароль слишком короткий (минимум 6 символов)',
  'auth/invalid-email': 'Некорректная почта',
  'auth/popup-closed-by-user': 'Окно Google закрыто — попробуйте ещё раз',
  'auth/too-many-requests': 'Слишком много попыток — попробуйте позже',
};

@Component({
  selector: 'app-auth-screen',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="backdrop">
      <div class="card">
        <h1>Travel Weave</h1>
        <p class="tagline">Сплети своё путешествие на 3D-глобусе</p>

        <div class="tabs">
          <button type="button" [class.active]="mode() === 'login'" (click)="mode.set('login')">
            Вход
          </button>
          <button
            type="button"
            [class.active]="mode() === 'register'"
            (click)="mode.set('register')"
          >
            Регистрация
          </button>
        </div>

        <form (ngSubmit)="submit()">
          @if (mode() === 'register') {
            <input
              type="text"
              placeholder="Как вас зовут"
              [(ngModel)]="displayName"
              name="displayName"
            />
          }
          <input type="email" placeholder="Почта" [(ngModel)]="email" name="email" required />
          <input
            type="password"
            placeholder="Пароль"
            [(ngModel)]="password"
            name="password"
            required
          />
          @if (error(); as err) {
            <div class="error">{{ err }}</div>
          }
          <button type="submit" class="primary" [disabled]="busy()">
            {{ busy() ? 'Секунду…' : mode() === 'login' ? 'Войти' : 'Создать аккаунт' }}
          </button>
        </form>

        <div class="divider">или</div>
        <button type="button" class="google" (click)="google()" [disabled]="busy()">
          Продолжить с Google
        </button>
        @if (mode() === 'login') {
          <button type="button" class="link" (click)="reset()" [disabled]="busy()">
            Забыли пароль?
          </button>
        }
      </div>
    </div>
  `,
  styles: /* less */ `
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 100;
      display: grid;
      place-items: center;
      background: radial-gradient(ellipse 90% 70% at 50% -10%, rgba(59, 40, 110, 0.5), transparent 60%), var(--bg-deep);
    }
    .card {
      width: 340px;
      padding: 30px 28px;
      background: var(--bg-panel);
      border: 1px solid rgba(63, 216, 199, 0.2);
      border-radius: 22px;
      backdrop-filter: blur(14px);
      box-shadow: 0 20px 70px rgba(0, 0, 0, 0.6);
      display: flex;
      flex-direction: column;
      gap: 14px;
      animation: rise 0.4s ease;
    }
    @keyframes rise {
      from {
        opacity: 0;
        transform: translateY(14px);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
    h1 {
      margin: 0;
      font-size: 22px;
      letter-spacing: 0.06em;
      color: var(--gold);
      text-align: center;
    }
    .tagline {
      margin: 0;
      text-align: center;
      color: var(--text-dim);
      font-size: 13px;
    }
    .tabs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      background: rgba(5, 12, 28, 0.6);
      border-radius: 10px;
      padding: 4px;
      button {
        border: none;
        background: none;
        color: var(--text-dim);
        padding: 7px;
        border-radius: 8px;
        cursor: pointer;
        font-weight: 600;
        &.active {
          background: var(--teal-soft);
          color: #a9ede2;
        }
      }
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    input {
      width: 100%;
      box-sizing: border-box;
    }
    .error {
      color: var(--danger);
      font-size: 12.5px;
      background: rgba(255, 122, 122, 0.08);
      border: 1px solid rgba(255, 122, 122, 0.3);
      border-radius: 8px;
      padding: 8px 10px;
    }
    .primary {
      padding: 11px;
      border-radius: 10px;
      border: none;
      background: linear-gradient(135deg, #3fd8c7, #2aa79b);
      color: #04231f;
      font-weight: 800;
      cursor: pointer;
      &:disabled {
        opacity: 0.6;
      }
    }
    .google {
      padding: 11px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.25);
      background: rgba(255, 255, 255, 0.06);
      color: var(--text);
      font-weight: 600;
      cursor: pointer;
      &:hover {
        background: rgba(255, 255, 255, 0.12);
      }
    }
    .divider {
      text-align: center;
      color: var(--text-dim);
      font-size: 12px;
    }
    .link {
      border: none;
      background: none;
      color: var(--text-dim);
      font-size: 12px;
      cursor: pointer;
      text-decoration: underline;
      &:hover {
        color: var(--teal);
      }
    }
  `,
})
export class AuthScreenComponent {
  private readonly auth = inject(AuthService);

  readonly mode = signal<'login' | 'register'>('login');
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);

  email = '';
  password = '';
  displayName = '';

  async submit(): Promise<void> {
    this.error.set(null);
    this.busy.set(true);
    try {
      if (this.mode() === 'login') {
        await this.auth.login(this.email, this.password);
      } else {
        await this.auth.register(this.email, this.password, this.displayName);
      }
    } catch (e) {
      this.error.set(this.describe(e));
    } finally {
      this.busy.set(false);
    }
  }

  async google(): Promise<void> {
    this.error.set(null);
    this.busy.set(true);
    try {
      await this.auth.loginWithGoogle();
    } catch (e) {
      this.error.set(this.describe(e));
    } finally {
      this.busy.set(false);
    }
  }

  async reset(): Promise<void> {
    if (!this.email) {
      this.error.set('Введите почту выше — и мы отправим ссылку для сброса');
      return;
    }
    this.error.set(null);
    this.busy.set(true);
    try {
      await this.auth.resetPassword(this.email);
      this.error.set(null);
      alert('Ссылка для сброса пароля отправлена на почту');
    } catch (e) {
      this.error.set(this.describe(e));
    } finally {
      this.busy.set(false);
    }
  }

  private describe(e: unknown): string {
    const code = (e as { code?: string })?.code ?? '';
    return ERROR_MESSAGES[code] ?? 'Не удалось войти. Попробуйте ещё раз';
  }
}
