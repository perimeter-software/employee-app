// scripts/clear-auth-cookies.js
// Run this in browser console to clear all Auth0 cookies manually

function clearAuth0Cookies() {
  console.log('🧹 Clearing Auth0 cookies...');

  // List of cookies to clear
  const cookiesToClear = [
    'appSession',
    'appSession.0',
    'appSession.1',
    'appSession.2',
    'auth0',
    'auth0.is.authenticated',
  ];

  // Clear cookies
  cookiesToClear.forEach((cookieName) => {
    document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=localhost;`;
    document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
  });

  // Clear localStorage
  Object.keys(localStorage).forEach((key) => {
    if (key.includes('auth') || key.includes('Auth')) {
      localStorage.removeItem(key);
    }
  });

  // Clear sessionStorage
  sessionStorage.clear();

  console.log('✅ Cookies cleared! Redirecting to login...');

  // Redirect to login
  setTimeout(() => {
    window.location.href = '/api/auth/login';
  }, 1000);
}

// Auto-run if JWE errors are detected
if (
  window.location.search.includes('error') ||
  document.documentElement.innerHTML.includes('JWE') ||
  document.documentElement.innerHTML.includes('Invalid Compact')
) {
  clearAuth0Cookies();
} else {
  console.log('ℹ️ To manually clear Auth0 cookies, run: clearAuth0Cookies()');
}
