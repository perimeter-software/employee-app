import jwt from 'jsonwebtoken';
import axios from 'axios';

const SECRET_KEY = process.env.BACKEND_JWT_SECRET_KEY!;
const BASE_URL = process.env.SP1_API_BASE_URL!;
const ORIGIN = process.env.SP1_API_ORIGIN!;

function createBackendToken(userSub: string, email: string): string {
  return jwt.sign({ userSub, email }, SECRET_KEY, {
    algorithm: 'HS256',
    expiresIn: '5m',
  });
}

/**
 * Returns an axios instance pre-configured for backend-to-backend calls to sp1-api.
 * The sessionId is the value of the `session_id` cookie from the browser request.
 * It is wrapped in a short-lived signed JWT so sp1-api can trust the caller
 * and resolve the full user context from Redis without a real browser cookie.
 */
export function getSp1Client(userSub: string, email: string, contentType: string | false = 'application/json') {
  const token = createBackendToken(userSub, email);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    origin: ORIGIN,
  };
  if (contentType !== false) headers['Content-Type'] = contentType;
  return axios.create({ baseURL: BASE_URL, headers });
}
