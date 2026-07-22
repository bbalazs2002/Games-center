import jwt from 'jsonwebtoken';

export interface AuthPayload {
  userId: string;
  displayName: string;
}

const TOKEN_EXPIRY = '30d';

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set');
  return secret;
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: unknown): AuthPayload {
  if (typeof token !== 'string' || !token) {
    throw new Error('Missing auth token.');
  }

  const decoded = jwt.verify(token, getSecret());
  if (typeof decoded === 'string' || !decoded.userId || !decoded.displayName) {
    throw new Error('Invalid auth token.');
  }

  return { userId: decoded.userId as string, displayName: decoded.displayName as string };
}
