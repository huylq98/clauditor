import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function shortId(id: string): string {
  return id.slice(0, 6);
}

export const isMac =
  typeof navigator !== 'undefined' &&
  navigator.userAgent.includes('Mac OS X');

export const modKey = isMac ? '⌘' : 'Ctrl';
