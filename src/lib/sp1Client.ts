import jwt from 'jsonwebtoken';
import axios from 'axios';

const SECRET_KEY = process.env.BACKEND_JWT_SECRET_KEY!;
const BASE_URL = process.env.SP1_API_BASE_URL!;
const FALLBACK_ORIGIN = process.env.SP1_API_ORIGIN!;

function createBackendToken(userSub: string, email: string): string {
  return jwt.sign({ userSub, email }, SECRET_KEY, {
    algorithm: 'HS256',
    expiresIn: '5m',
  });
}

/**
 * Returns an axios instance pre-configured for backend-to-backend calls to sp1-api.
 * The JWT is a short-lived signed token so sp1-api can trust the caller
 * and resolve the full user context from Redis without a real browser cookie.
 *
 * @param clientDomain - The tenant's clientDomain (i.e. TenantInfo.url). Used as
 *   the `origin` header so sp1-api can identify the tenant. Falls back to the
 *   SP1_API_ORIGIN env var when not provided.
 */
function buildOrigin(clientDomain?: string): string {
  const domain = clientDomain || FALLBACK_ORIGIN;
  if (!domain) return '';
  if (domain.startsWith('http://') || domain.startsWith('https://'))
    return domain;
  return domain.startsWith('localhost')
    ? `http://${domain}`
    : `https://${domain}`;
}

export function getSp1Client(
  userSub: string,
  email: string,
  clientDomain?: string,
  contentType: string | false = 'application/json'
) {
  const token = createBackendToken(userSub, email);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    origin: buildOrigin(clientDomain),
  };
  if (contentType !== false) headers['Content-Type'] = contentType;
  return axios.create({ baseURL: BASE_URL, headers });
}
