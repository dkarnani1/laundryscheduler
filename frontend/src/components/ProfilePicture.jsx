import React, { useState, useEffect } from 'react';
import { cleanS3Url, getInitials } from '@/lib/utils';
import { fetchProfilePicture } from '@/lib/auth';

const ProfilePicture = ({ user }) => {
  const [imageError, setImageError] = useState(false);
  const [pictureUrl, setPictureUrl] = useState(user?.attributes?.picture || '');
  const [userName, setUserName] = useState(user?.attributes?.given_name || user?.attributes?.name || '');
  
  // Effect to fetch the latest profile picture and name
  useEffect(() => {
    const updatePicture = async () => {
      try {
        // If we already have a picture URL in user attributes, use it
        if (user?.attributes?.picture) {
          setPictureUrl(user.attributes.picture);
        }
        
        // Always update the user name from user attributes
        if (user?.attributes?.given_name || user?.attributes?.name) {
          setUserName(user.attributes.given_name || user.attributes.name);
        }
        
        // Fetch latest data from the server
        const userData = await fetchProfilePicture();
        if (userData.picture) {
          setPictureUrl(userData.picture);
        }
        if (userData.userName && (!userName || userName.trim() === '')) {
          setUserName(userData.userName);
        }
      } catch (error) {
        console.error('Error fetching profile picture:', error);
      }
    };
    
    updatePicture();
  }, [user]);

  const getInitials = () => {
    // First try to use the user name we have
    if (userName) {
      const parts = userName.trim().split(' ');
      if (parts.length >= 2) {
        // If we have first and last name
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      } else if (parts[0].length > 1) {
        // If only one name but at least 2 characters
        return `${parts[0][0]}${parts[0][parts[0].length - 1]}`.toUpperCase();
      } else if (parts[0].length === 1) {
        // If just one character
        return parts[0].toUpperCase();
      }
    }
    
    // Fall back to user attributes if userName is not set
    const { given_name, family_name, name, email } = user.attributes || {};
    if (given_name && family_name) {
      return `${given_name[0]}${family_name[0]}`.toUpperCase();
    } else if (given_name) {
      // If only one name is provided, use the first and last character.
      if (given_name.length > 1) {
        return `${given_name[0]}${given_name[given_name.length - 1]}`.toUpperCase();
      }
      return given_name.toUpperCase();
    } else if (name) {
      const parts = name.split(' ');
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      } else if (parts[0].length > 1) {
        return `${parts[0][0]}${parts[0][parts[0].length - 1]}`.toUpperCase();
      }
      return parts[0].toUpperCase();
    } else if (email) {
      // Try email username
      const emailName = email.split('@')[0];
      if (emailName.length > 1) {
        return `${emailName[0]}${emailName[1]}`.toUpperCase();
      }
      return emailName[0].toUpperCase();
    }
    
    return "??";
  };

  if (pictureUrl && !imageError) {
    const cleanedUrl = cleanS3Url(pictureUrl);
    return (
      <img 
        src={cleanedUrl} 
        alt="Profile" 
        className="w-10 h-10 rounded-full object-cover"
        onError={(e) => {
          console.log("Failed to load profile image in header:", cleanedUrl);
          setImageError(true);
        }}
      />
    );
  }

  return (
    <div className="w-10 h-10 rounded-full bg-gray-400 flex items-center justify-center text-white font-bold">
      {getInitials()}
    </div>
  );
};

export default ProfilePicture;