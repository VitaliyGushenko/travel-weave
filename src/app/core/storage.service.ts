import { Injectable } from '@angular/core';
import { Timestamp } from '@angular/fire/firestore';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { environment } from '../../environments/environment';

export interface StoredFile {
  url: string;
  path: string;
  createdAt?: Timestamp | null;
}

/**
 * Хранилище файлов (фото точек и документов) на Supabase Storage.
 * Firebase Storage не используется (требует план Blaze).
 */
@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly client: SupabaseClient | null =
    environment.supabase.url && environment.supabase.anonKey
      ? createClient(environment.supabase.url, environment.supabase.anonKey, {
          auth: { persistSession: false },
        })
      : null;

  private readonly bucket = environment.supabase.bucket;

  /** Файлы недоступны, пока в environment не заданы ключи Supabase. */
  get configured(): boolean {
    return this.client !== null;
  }

  async uploadFile(path: string, file: Blob, contentType?: string): Promise<StoredFile> {
    if (!this.client) {
      throw new Error('Хранилище файлов не настроено — задайте ключи Supabase в environment');
    }
    const { error } = await this.client.storage.from(this.bucket).upload(path, file, {
      contentType,
      upsert: true,
    });
    if (error) {
      throw error;
    }
    const { data } = this.client.storage.from(this.bucket).getPublicUrl(path);
    return { url: data.publicUrl, path, createdAt: Timestamp.now() };
  }

  async deleteFile(path: string): Promise<void> {
    if (!this.client) {
      return;
    }
    const { error } = await this.client.storage.from(this.bucket).remove([path]);
    if (error) {
      console.warn(`storage: не удалось удалить ${path}`, error.message);
    }
  }

  /** Сжимает изображение на canvas; GIF и мелкие файлы отдаёт как есть. */
  async compressImage(file: File, maxDim = 1600, quality = 0.82): Promise<Blob> {
    if (!file.type.startsWith('image/') || file.type === 'image/gif') {
      return file;
    }
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 500_000) {
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve) =>
      canvas.toBlob((blob) => resolve(blob ?? file), 'image/jpeg', quality),
    );
  }
}
