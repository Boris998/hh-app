import { randomUUID } from 'node:crypto';

import { customAlphabet } from 'nanoid';

export const encodeBase64url = (data: ArrayBuffer) => {
  return encodeBase64(data).replaceAll('+', '-').replaceAll('/', '_');
};

export const encodeBase64 = (data: ArrayBuffer) => {
  const result = btoa(String.fromCharCode(...new Uint8Array(data)));
  return result;
};

export const generateId = () => {
  return randomUUID();
};

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';
export const NANO_ID_LENGTH = 12;

export const generateNanoId = () => customAlphabet(ALPHABET, NANO_ID_LENGTH)();
