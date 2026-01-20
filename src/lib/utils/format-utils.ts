/**
 * Format phone number with smart detection for US vs international numbers
 * - US numbers (10 digits): (XXX) XXX-XXXX
 * - International numbers: +X XXX XXX XXXX (formatted with spaces)
 * - Invalid/short numbers: Returns original value
 * 
 * @param phoneNumber - The phone number string to format
 * @returns Formatted phone number string or original value if invalid
 */
export function formatPhoneNumber(phoneNumber: string | undefined): string {
  if (!phoneNumber) return 'N/A';
  
  // Preserve leading + for international numbers
  const trimmed = phoneNumber.trim();
  const hasPlus = trimmed.startsWith('+');
  
  // Remove all non-digit characters
  const digits = phoneNumber.replace(/\D/g, '');
  
  // Handle empty or too short numbers
  if (digits.length < 7) {
    return phoneNumber; // Return original if too short
  }
  
  // US/Canada numbers: 10 digits (or 11 with country code 1)
  if (digits.length === 10 || (digits.length === 11 && digits.startsWith('1'))) {
    // Take last 10 digits (in case there's a country code like +1)
    const last10Digits = digits.slice(-10);
    // Format as (XXX) XXX-XXXX
    return `(${last10Digits.slice(0, 3)}) ${last10Digits.slice(3, 6)}-${last10Digits.slice(6)}`;
  }
  
  // International numbers: Format with spaces for readability
  if (hasPlus || digits.length > 11) {
    // If it has a + prefix, preserve it
    const prefix = hasPlus ? '+' : '';
    
    // Format in groups: country code + space + groups of 3-4 digits
    let formatted = '';
    let remaining = digits;
    
    // First group (country code or first part): 1-3 digits
    if (remaining.length > 10) {
      // Has country code - extract it
      const countryCodeLength = remaining.length - 10; // Assume 10-digit national number
      formatted = remaining.slice(0, countryCodeLength);
      remaining = remaining.slice(countryCodeLength);
    }
    
    // Format remaining digits in groups of 3-4
    while (remaining.length > 0) {
      const chunkSize = remaining.length > 4 ? 3 : remaining.length;
      formatted += (formatted ? ' ' : '') + remaining.slice(0, chunkSize);
      remaining = remaining.slice(chunkSize);
    }
    
    return prefix ? `${prefix}${formatted}` : formatted;
  }
  
  // Fallback: return original if we can't determine format
  return phoneNumber;
}
