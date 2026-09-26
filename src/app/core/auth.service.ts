import { Injectable, Injector, computed, inject, runInInjectionContext, signal } from '@angular/core';
import {
  Auth,
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from '@angular/fire/auth';
import {
  Firestore,
  doc,
  docData,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from '@angular/fire/firestore';
import { Subscription } from 'rxjs';

import { UserProfile } from './models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);
  private readonly injector = inject(Injector);

  /** Текущий пользователь Firebase Auth. */
  readonly user = signal<User | null>(null);
  /** Документ users/{uid} (создаётся автоматически при первом входе). */
  readonly profile = signal<UserProfile | null>(null);
  /** Auth-состояние загружено — guards ждут этого, чтобы не редиректить раньше времени. */
  readonly isReady = signal(false);

  readonly isAuthenticated = computed(() => this.user() !== null);

  private readonly readyPromise: Promise<void>;
  private profileSub?: Subscription;

  constructor() {
    this.readyPromise = new Promise<void>((resolve) => {
      onAuthStateChanged(this.auth, (user) => {
        this.user.set(user);
        if (user) {
          void this.attachProfile(user);
        } else {
          this.profileSub?.unsubscribe();
          this.profile.set(null);
        }
        this.isReady.set(true);
        resolve();
      });
    });
  }

  ensureReady(): Promise<void> {
    return this.readyPromise;
  }

  async register(email: string, password: string, displayName: string): Promise<void> {
    const cred = await createUserWithEmailAndPassword(this.auth, email.trim(), password);
    if (displayName.trim()) {
      await updateProfile(cred.user, { displayName: displayName.trim() });
    }
    await this.ensureProfileDoc(cred.user);
  }

  async login(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(this.auth, email.trim(), password);
  }

  async loginWithGoogle(): Promise<void> {
    await signInWithPopup(this.auth, new GoogleAuthProvider());
  }

  async resetPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(this.auth, email.trim());
  }

  async logout(): Promise<void> {
    await signOut(this.auth);
  }

  /** Обновляет профиль: имя и/или валюту по умолчанию. */
  async updateSettings(changes: { displayName?: string; currency?: string }): Promise<void> {
    const user = this.user();
    if (!user) {
      throw new Error('Пользователь не авторизован');
    }
    const updates: { displayName?: string; 'settings.currency'?: string } = {};
    if (changes.displayName !== undefined) {
      updates['displayName'] = changes.displayName;
    }
    if (changes.currency !== undefined) {
      updates['settings.currency'] = changes.currency;
    }
    await updateDoc(this.profileRef(user.uid), updates);
    if (changes.displayName !== undefined) {
      await updateProfile(user, { displayName: changes.displayName });
    }
  }

  /** Читает документ профиля; если его нет (регистрация оборвалась) — создаёт. */
  private async attachProfile(user: User): Promise<void> {
    this.profileSub?.unsubscribe();
    await this.ensureProfileDoc(user);
    // onAuthStateChanged вызывается вне injection-контекста — оборачиваем явно.
    this.profileSub = runInInjectionContext(this.injector, () =>
      docData(this.profileRef(user.uid)),
    ).subscribe((profile) => {
      this.profile.set(profile as UserProfile);
    });
  }

  private profileRef(uid: string) {
    return doc(this.firestore, 'users', uid);
  }

  private async ensureProfileDoc(user: User): Promise<void> {
    const ref = this.profileRef(user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        email: user.email ?? '',
        displayName: user.displayName ?? '',
        settings: { currency: 'RUB' },
        createdAt: serverTimestamp(),
      });
    }
  }
}
