import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"
 
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

// src/lib/utils.js

/**
 * Cleans S3 URLs by removing query parameters
 * @param {string} url - The S3 URL to clean
 * @returns {string} - The cleaned URL without query parameters
 */
export const cleanS3Url = (url) => {
  if (!url) return '';
  try {
    // If the URL contains query parameters (like signatures), remove them
    if (url.includes('?')) {
      return url.split('?')[0];
    }
    return url;
  } catch (error) {
    console.error('Error cleaning S3 URL:', error);
    return url;
  }
};

/**
 * Gets user initials from name or email
 * @param {string} name - User's name
 * @param {string} email - User's email (fallback)
 * @returns {string} - User's initials (1-2 characters)
 */
export const getInitials = (name = '', email = '') => {
  // First try to use the name
  if (name && typeof name === 'string' && name.trim() !== '') {
    // Remove any numbers from the name
    const cleanName = name.replace(/[0-9]/g, '').trim();
    
    if (cleanName) {
      const parts = cleanName.split(' ');
      if (parts.length >= 2) {
        // First letters of first and last name
        return `${parts[0][0]}${parts[parts.length-1][0]}`.toUpperCase();
      } else if (cleanName.length > 1) {
        // First and last letter of single name
        return `${cleanName[0]}${cleanName[cleanName.length - 1]}`.toUpperCase();
      }
      // Just first letter if name is short
      return cleanName[0].toUpperCase();
    }
  }
  
  // If no valid name, try to use email
  if (email && typeof email === 'string' && email.includes('@')) {
    const username = email.split('@')[0];
    // Format the username part - ignore numbers here too
    const cleanUsername = username.replace(/[0-9]/g, '');
    
    if (cleanUsername.length > 0) {
      const formatted = cleanUsername
        .replace(/[_\.]/g, ' ')
        .split(' ')
        .filter(word => word.length > 0)
        .map(word => word[0].toUpperCase())
        .join('');
        
      // Take up to 2 characters
      return formatted.slice(0, 2);
    }
  }
  
  // Last resort - use a placeholder
  return "ME";
};