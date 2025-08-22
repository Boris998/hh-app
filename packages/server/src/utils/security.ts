// src/utils/security.ts - Security utilities with Argon2 for password hashing
import argon2 from 'argon2';
import crypto from 'crypto';

// Argon2 Configuration
const ARGON2_OPTIONS = {
  type: argon2.argon2id, // Most secure variant
  memoryCost: 2 ** 16, // 64 MB
  timeCost: 3, // 3 iterations
  parallelism: 1, // 1 thread
};

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
  strength: 'weak' | 'medium' | 'strong' | 'very-strong';
  score: number; // 0-100
}

/**
 * Hash a password using Argon2id
 */
export async function hashPassword(password: string): Promise<string> {
  try {
    // Validate password before hashing
    const validation = validatePassword(password);
    if (!validation.valid) {
      throw new Error(`Password validation failed: ${validation.errors.join(', ')}`);
    }

    const hashedPassword = await argon2.hash(password, ARGON2_OPTIONS);
    return hashedPassword;
  } catch (error) {
    console.error('Error hashing password:', error);
    throw new Error('Failed to hash password');
  }
}

/**
 * Verify a password against its Argon2 hash
 */
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  try {
    if (!password || !hashedPassword) {
      return false;
    }

    const isValid = await argon2.verify(hashedPassword, password);
    return isValid;
  } catch (error) {
    console.error('Error verifying password:', error);
    return false;
  }
}

/**
 * Check if a hash needs rehashing (for security upgrades)
 */
export function needsRehash(hashedPassword: string): boolean {
  try {
    return argon2.needsRehash(hashedPassword, ARGON2_OPTIONS);
  } catch (error) {
    console.error('Error checking rehash need:', error);
    return false;
  }
}

/**
 * Validate password strength and requirements
 */
export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];
  let score = 0;

  // Basic validation
  if (!password) {
    return {
      valid: false,
      errors: ['Password is required'],
      strength: 'weak',
      score: 0,
    };
  }

  // Length validation
  if (password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
  } else {
    score += 20;
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    errors.push(`Password must be no more than ${MAX_PASSWORD_LENGTH} characters long`);
  }

  // Character type requirements
  const hasLowercase = /[a-z]/.test(password);
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChars = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  if (!hasLowercase) {
    errors.push('Password must contain at least one lowercase letter');
  } else {
    score += 15;
  }

  if (!hasUppercase) {
    errors.push('Password must contain at least one uppercase letter');
  } else {
    score += 15;
  }

  if (!hasNumbers) {
    errors.push('Password must contain at least one number');
  } else {
    score += 15;
  }

  if (!hasSpecialChars) {
    errors.push('Password must contain at least one special character');
  } else {
    score += 15;
  }

  // Additional scoring for length
  if (password.length >= 12) score += 10;
  if (password.length >= 16) score += 10;

  // Check for common patterns (reduce score)
  if (/(.)\1{2,}/.test(password)) {
    score -= 10; // Repeated characters
  }

  if (/123|abc|qwe|asd|zxc/i.test(password)) {
    score -= 15; // Common sequences
  }

  // Check against common passwords
  const commonPasswords = [
    'password', '123456', '12345678', 'qwerty', 'abc123', 
    'password123', 'admin', 'letmein', 'welcome', 'monkey'
  ];
  
  if (commonPasswords.some(common => password.toLowerCase().includes(common))) {
    score -= 20;
    errors.push('Password contains common words or patterns');
  }

  // Determine strength
  let strength: PasswordValidationResult['strength'];
  if (score >= 80) {
    strength = 'very-strong';
  } else if (score >= 60) {
    strength = 'strong';
  } else if (score >= 40) {
    strength = 'medium';
  } else {
    strength = 'weak';
  }

  return {
    valid: errors.length === 0,
    errors,
    strength,
    score: Math.max(0, Math.min(100, score)),
  };
}

/**
 * Generate a secure random password
 */
export function generateSecurePassword(length: number = 16): string {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  
  const allChars = lowercase + uppercase + numbers + specialChars;
  
  let password = '';
  
  // Ensure at least one character from each category
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += specialChars[Math.floor(Math.random() * specialChars.length)];
  
  // Fill the rest randomly
  for (let i = 4; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Shuffle the password using crypto-secure random
  return password.split('').sort(() => {
    const array = new Uint8Array(1);
    crypto.getRandomValues(array);
    return array[0] - 128;
  }).join('');
}

/**
 * Generate a secure random token (for reset passwords, email verification, etc.)
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Generate a secure random string with custom charset
 */
export function generateSecureString(length: number, charset?: string): string {
  const defaultCharset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const chars = charset || defaultCharset;
  
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(array[i] % chars.length);
  }
  
  return result;
}

/**
 * Sanitize user input to prevent XSS and injection attacks
 */
export function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return input
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocols
    .replace(/on\w+=/gi, '') // Remove event handlers
    .replace(/data:/gi, '') // Remove data: protocols
    .trim();
}

/**
 * Validate email format (RFC 5322 compliant)
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return emailRegex.test(email) && email.length <= 254; // RFC 5321 limit
}

/**
 * Validate username format
 */
export function validateUsername(username: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!username) {
    return { valid: false, errors: ['Username is required'] };
  }

  if (username.length < 3) {
    errors.push('Username must be at least 3 characters long');
  }

  if (username.length > 30) {
    errors.push('Username must be no more than 30 characters long');
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
    errors.push('Username can only contain letters, numbers, underscores, and hyphens');
  }

  if (/^[_-]/.test(username) || /[_-]$/.test(username)) {
    errors.push('Username cannot start or end with underscore or hyphen');
  }

  // Check for reserved usernames
  const reservedUsernames = [
    'admin', 'root', 'administrator', 'system', 'support', 'help',
    'api', 'www', 'mail', 'email', 'test', 'demo', 'guest'
  ];
  
  if (reservedUsernames.includes(username.toLowerCase())) {
    errors.push('Username is reserved and cannot be used');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}


/**
 * Enhanced rate limiting helper with sliding window
 */
class EnhancedRateLimiter {
  private attempts: Map<string, { timestamps: number[]; blockedUntil?: number }> = new Map();

  isRateLimited(
    identifier: string, 
    maxAttempts: number = 5, 
    windowMs: number = 15 * 60 * 1000,
    blockDurationMs: number = 15 * 60 * 1000
  ): boolean {
    const now = Date.now();
    const record = this.attempts.get(identifier) || { timestamps: [] };

    // Check if currently blocked
    if (record.blockedUntil && now < record.blockedUntil) {
      return true;
    }

    // Clean old timestamps (sliding window)
    record.timestamps = record.timestamps.filter(timestamp => now - timestamp < windowMs);

    // Check if limit exceeded
    if (record.timestamps.length >= maxAttempts) {
      // Block the identifier
      record.blockedUntil = now + blockDurationMs;
      this.attempts.set(identifier, record);
      return true;
    }

    // Add current timestamp
    record.timestamps.push(now);
    this.attempts.set(identifier, record);
    
    return false;
  }

  clearAttempts(identifier: string): void {
    this.attempts.delete(identifier);
  }

  getRemainingAttempts(identifier: string, maxAttempts: number = 5, windowMs: number = 15 * 60 * 1000): number {
    const now = Date.now();
    const record = this.attempts.get(identifier);
    
    if (!record) {
      return maxAttempts;
    }

    // Clean old timestamps
    const validTimestamps = record.timestamps.filter(timestamp => now - timestamp < windowMs);
    return Math.max(0, maxAttempts - validTimestamps.length);
  }

  getBlockedUntil(identifier: string): Date | null {
    const record = this.attempts.get(identifier);
    if (record?.blockedUntil && Date.now() < record.blockedUntil) {
      return new Date(record.blockedUntil);
    }
    return null;
  }

  cleanup(): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [identifier, record] of this.attempts.entries()) {
      // Remove expired blocks and old timestamps
      const hasValidTimestamps = record.timestamps.some(ts => now - ts < 24 * 60 * 60 * 1000); // 24h cleanup
      const isBlocked = record.blockedUntil && now < record.blockedUntil;

      if (!hasValidTimestamps && !isBlocked) {
        this.attempts.delete(identifier);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }
}

export const enhancedRateLimiter = new EnhancedRateLimiter();

/**
 * Constant-time string comparison to prevent timing attacks
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(a),
    Buffer.from(b)
  );
}

/**
 * Generate a secure session ID
 */
export function generateSessionId(): string {
  return generateSecureToken(48); // 96 hex characters
}

/**
 * Hash password with pepper (additional secret)
 */
export async function hashPasswordWithPepper(password: string, pepper?: string): Promise<string> {
  const actualPepper = pepper || process.env.PASSWORD_PEPPER || '';
  const pepperedPassword = password + actualPepper;
  return await hashPassword(pepperedPassword);
}

/**
 * Verify password with pepper
 */
export async function verifyPasswordWithPepper(password: string, hashedPassword: string, pepper?: string): Promise<boolean> {
  const actualPepper = pepper || process.env.PASSWORD_PEPPER || '';
  const pepperedPassword = password + actualPepper;
  return await verifyPassword(pepperedPassword, hashedPassword);
}

/**
 * Security configuration validator
 */
export function validateSecurityConfig(): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  // Check Argon2 configuration
  if (ARGON2_OPTIONS.memoryCost < 2 ** 15) {
    warnings.push('Argon2 memory cost should be at least 32MB (2^15) for production use');
  }

  if (ARGON2_OPTIONS.timeCost < 2) {
    warnings.push('Argon2 time cost should be at least 2 for production use');
  }

  if (process.env.NODE_ENV === 'production') {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      warnings.push('JWT_SECRET should be at least 32 characters long in production');
    }

    if (!process.env.PASSWORD_PEPPER) {
      warnings.push('PASSWORD_PEPPER environment variable should be set for additional security');
    }

    if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length < 32) {
      warnings.push('ENCRYPTION_KEY should be set and at least 32 characters long');
    }
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}

/**
 * Encrypt sensitive data (AES-256-GCM)
 */
export function encryptSensitiveData(data: string, key?: string): { encrypted: string; iv: string; tag: string } {
  const encryptionKey = key || process.env.ENCRYPTION_KEY || 'default-key-change-in-production';
  const keyBuffer = crypto.scryptSync(encryptionKey, 'salt', 32);
  
  const iv = crypto.randomBytes(16);
  // Use createCipheriv instead of createCipherGCM
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
  
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const tag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  };
}

/**
 * Decrypt sensitive data (AES-256-GCM)
 */
export function decryptSensitiveData(
  encrypted: string, 
  iv: string, 
  tag: string, 
  key?: string
): string {
  const encryptionKey = key || process.env.ENCRYPTION_KEY || 'default-key-change-in-production';
  
  // Ensure the key is exactly 32 bytes for AES-256
  const keyBuffer = crypto.scryptSync(encryptionKey, 'salt', 32); 
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm', 
    keyBuffer, 
    Buffer.from(iv, 'hex')
  );
  
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Hash sensitive data (like API keys, tokens) using SHA-256
 */
export function hashSensitiveData(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Compare sensitive data hashes
 */
export function compareSensitiveData(data: string, hash: string): boolean {
  const dataHash = hashSensitiveData(data);
  return crypto.timingSafeEqual(
    Buffer.from(dataHash),
    Buffer.from(hash)
  );
}

/**
 * Rate limiting helper - simple in-memory store (use Redis in production)
 */
class SimpleRateLimiter {
  private attempts: Map<string, { count: number; resetTime: number }> = new Map();

  isRateLimited(identifier: string, maxAttempts: number = 5, windowMs: number = 15 * 60 * 1000): boolean {
    const now = Date.now();
    const attempt = this.attempts.get(identifier);

    if (!attempt || now > attempt.resetTime) {
      // Reset or create new attempt record
      this.attempts.set(identifier, { count: 1, resetTime: now + windowMs });
      return false;
    }

    if (attempt.count >= maxAttempts) {
      return true; // Rate limited
    }

    // Increment attempt count
    attempt.count++;
    return false;
  }

  clearAttempts(identifier: string): void {
    this.attempts.delete(identifier);
  }

  getRemainingAttempts(identifier: string, maxAttempts: number = 5): number {
    const attempt = this.attempts.get(identifier);
    if (!attempt) {
      return maxAttempts;
    }

    return Math.max(0, maxAttempts - attempt.count);
  }
}

export const simpleRateLimiter = new SimpleRateLimiter();

/**
 * Generate CSRF token
 */
export function generateCSRFToken(): string {
  return generateSecureToken(32);
}

/**
 * Validate CSRF token
 */
export function validateCSRFToken(token: string, sessionToken: string): boolean {
  return secureCompare(token, sessionToken);
}
