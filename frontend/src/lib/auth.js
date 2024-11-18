import { Amplify } from 'aws-amplify';
import { 
  signIn as awsSignIn, 
  signUp as awsSignUp, 
  signOut as awsSignOut, 
  getCurrentUser as awsGetCurrentUser, 
  fetchUserAttributes,
  confirmSignUp as awsConfirmSignUp 
} from 'aws-amplify/auth';

// Initialize Amplify
const config = {
  Auth: {
    Cognito: {
      region: 'us-east-2',
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
      userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID
    }
  }
};

Amplify.configure(config);

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
          name: name // Add both given_name and name
        },
        autoSignIn: { // Enable auto sign in after sign up
          enabled: false
        }
      }
    };

    const { user } = await awsSignUp(signUpParams);
    return user;
  } catch (error) {
    console.error('Detailed signup error:', error);
    throw error;
  }
};

export const checkAndClearExistingSession = async () => {
  try {
    const currentUser = await awsGetCurrentUser().catch(() => null);
    if (currentUser) {
      await signOut();
    }
  } catch (error) {
    // If there's no current user, this is fine
    console.log('No existing session found');
  }
};

export const signIn = async (email, password) => {
  try {
    const signInOutput = await awsSignIn({
      username: email,  // Use email directly as username
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
    await awsSignOut({ global: true }); // Add global: true to clear all auth states
    localStorage.removeItem('lastUsername');
    
    // Clear local browser storage
    localStorage.clear();
    sessionStorage.clear();
  } catch (error) {
    console.error('Error signing out:', error);
    throw error;
  }
};

export const clearAuthTokens = async () => {
  try {
    // Clear all cached tokens
    localStorage.clear();
    sessionStorage.clear();
    // Remove the page reload
  } catch (error) {
    console.error('Error clearing auth tokens:', error);
  }
};

export const getCurrentUser = async () => {
  try {
    const currentUser = await awsGetCurrentUser();
    const attributes = await fetchUserAttributes();
    
    // console.log('Current user attributes:', attributes);
    
    // Verify we have the name
    if (!attributes.given_name) {
      console.warn('given_name attribute is missing from user attributes');
    }
    
    return { 
      ...currentUser, 
      attributes: {
        ...attributes,
        // Ensure we always have a display name
        given_name: attributes.name
      }
    };
  } catch (error) {
    if (error.name === 'UserUnAuthenticatedException') {
      return null;
    }
    console.error('Error getting current user:', error);
    return null;
  }
};

export const confirmSignUp = async (email, code) => {
  try {
    const { isSignUpComplete } = await awsConfirmSignUp({
      username: email,  // Use email directly as username
      confirmationCode: code
    });
    return isSignUpComplete;
  } catch (error) {
    console.error('Error confirming sign up:', error);
    throw error;
  }
};