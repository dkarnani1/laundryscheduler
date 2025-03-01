import { Amplify } from 'aws-amplify';
import { 
  signIn as amplifySignIn, 
  signUp as amplifySignUp, 
  signOut as amplifySignOut, 
  getCurrentUser, 
  fetchUserAttributes,
  confirmSignUp as amplifyConfirmSignUp,
  fetchAuthSession,
  updateUserAttributes as amplifyUpdateUserAttributes
} from 'aws-amplify/auth';

// Configure Amplify
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
      userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
      identityPoolId: import.meta.env.VITE_IDENTITY_POOL_ID,
      region: 'us-east-2'
    }
  },
  Storage: {
    S3: {
      bucket: import.meta.env.VITE_S3_BUCKET,
      region: 'us-east-2',
      credentials: () => fetchAuthSession().then(session => session.credentials)
    }
  }
});

// Keep track of stored user information
let cachedUserInfo = null;
let tokenRefreshInProgress = false;
let cachedProfilePictureUrl = null;
let cachedUserName = null;

export async function updateUserAttributes({ userAttributes }) {
  if (!userAttributes || typeof userAttributes !== 'object') {
    throw new Error('User attributes must be a valid object');
  }

  try {
    await amplifyUpdateUserAttributes({
      userAttributes: userAttributes
    });
    
    // Clear cached user info after updating attributes
    cachedUserInfo = null;
    
    return true;
  } catch (error) {
    console.error('Failed to update user attributes:', error);
    throw error;
  }
}

export const getAuthToken = async () => {
  try {
    // Try to get a fresh session
    const session = await fetchAuthSession({ forceRefresh: true });
    if (!session?.tokens?.accessToken) {
      throw new Error('No access token found');
    }
    return session.tokens.accessToken.toString();
  } catch (error) {
    console.error('Error getting auth token:', error);
    return null;
  }
};

export const signUp = async (email, password, phoneNumber, name) => {
  try {    
    if (!name || name.trim() === '') {
      throw new Error('Name is required and cannot be null or empty');
    }

    const signUpParams = {
      username: email,
      password: password,
      options: {
        userAttributes: {
          email,
          phone_number: phoneNumber,
          given_name: name,
          name: name
        },
        autoSignIn: {
          enabled: false
        }
      }
    };

    const { user } = await amplifySignUp(signUpParams);
    return user;
  } catch (error) {
    console.error('Detailed signup error:', error);
    throw error;
  }
};

export const checkAndClearExistingSession = async () => {
  try {
    const currentUser = await getCurrentUser().catch(() => null);
    if (currentUser) {
      await signOut();
    }
  } catch (error) {
    console.log('No existing session found');
  }
};

export const signIn = async (email, password) => {
  try {
    // Clear cache on new sign in
    cachedUserInfo = null;
    cachedProfilePictureUrl = null;
    cachedUserName = null;
    
    const signInOutput = await amplifySignIn({
      username: email,
      password: password,
    });
    return signInOutput;
  } catch (error) {
    console.error('Error signing in:', error);
    throw error;
  }
};

export const signOut = async () => {
  try {
    await amplifySignOut({ global: true });
    localStorage.removeItem('lastUsername');
    localStorage.clear();
    sessionStorage.clear();
    
    // Clear cached user
    cachedUserInfo = null;
    cachedProfilePictureUrl = null;
    cachedUserName = null;
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
};

export const clearAuthTokens = async () => {
  try {
    localStorage.clear();
    sessionStorage.clear();
    cachedUserInfo = null;
    cachedProfilePictureUrl = null;
    cachedUserName = null;
  } catch (error) {
    console.error('Error clearing auth tokens:', error);
  }
};

// Fetch the user's profile picture and name from the server
export const fetchProfilePicture = async () => {
  if (cachedProfilePictureUrl) {
    return {
      picture: cachedProfilePictureUrl,
      userName: cachedUserName
    };
  }
  
  try {
    const token = await getAuthToken();
    if (!token) {
      throw new Error('No authentication token available');
    }
    
    const apiUrl = import.meta.env.VITE_APP_API_URL;
    // Convert HTTPS to HTTP for localhost
    const baseUrl = apiUrl.includes('localhost') ? apiUrl.replace('https://', 'http://') : apiUrl;
    
    const response = await fetch(`${baseUrl}/api/user/picture`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to fetch profile picture');
    }
    
    const data = await response.json();
    if (data.picture) {
      cachedProfilePictureUrl = data.picture;
    }
    if (data.userName) {
      cachedUserName = data.userName;
    }
    
    return {
      picture: data.picture || '',
      userName: data.userName || ''
    };
  } catch (error) {
    console.error('Error fetching profile picture:', error);
    return {
      picture: '',
      userName: ''
    };
  }
};

/**
 * Gets the current authenticated user with attributes.
 * Attempts to refresh tokens if needed.
 */
export const getCurrentAuthenticatedUser = async () => {
  // If refresh is already in progress, wait for it to complete
  if (tokenRefreshInProgress) {
    await new Promise(resolve => setTimeout(resolve, 500));
    return getCurrentAuthenticatedUser();
  }
  
  try {
    // If we have cached user info and no forced refresh, return it
    if (cachedUserInfo) {
      return cachedUserInfo;
    }
    
    // Get current user and attributes
    const currentUser = await getCurrentUser();
    
    // Force session refresh to ensure we have valid tokens
    tokenRefreshInProgress = true;
    await fetchAuthSession({ forceRefresh: true });
    tokenRefreshInProgress = false;
    
    // Now fetch attributes with refreshed session
    const attributes = await fetchUserAttributes();
    
    // Fetch the profile picture and name from the server
    const userData = await fetchProfilePicture();
    
    // Create user info object
    const userInfo = { 
      ...currentUser, 
      attributes: {
        ...attributes,
        given_name: attributes.name || attributes.given_name || userData.userName,
        picture: userData.picture // Add the profile picture from the server
      }
    };
    
    // Cache the user info
    cachedUserInfo = userInfo;
    
    return userInfo;
  } catch (error) {
    tokenRefreshInProgress = false;
    cachedUserInfo = null;
    cachedProfilePictureUrl = null;
    cachedUserName = null;
    
    // Handle various auth errors
    if (
      error.name === 'UserUnAuthenticatedException' || 
      error.message?.includes('revoked') ||
      error.message?.includes('expired') ||
      error.code === 'NotAuthorizedException'
    ) {
      console.log('Session expired or revoked, redirecting to login');
      // Explicitly sign out to clear any bad tokens
      try {
        await signOut();
      } catch (e) {
        // Ignore errors on sign out attempt
      }
      return null;
    }
    
    console.error('Error getting current user:', error);
    return null;
  }
};

export const confirmSignUp = async (email, code) => {
  try {
    const { isSignUpComplete } = await amplifyConfirmSignUp({
      username: email,
      confirmationCode: code
    });
    return isSignUpComplete;
  } catch (error) {
    console.error('Error confirming sign up:', error);
    throw error;
  }
};