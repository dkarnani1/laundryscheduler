import React, { useState } from 'react';
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { uploadProfilePicture } from '@/lib/uploadProfilePicture';
import { getAuthToken } from '@/lib/auth';
import { useToast } from "@/hooks/use-toast";
import { cleanS3Url } from '@/lib/utils';

const Settings = ({ user, preferences, updatePreferences, onClose, refreshUser }) => {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [imageError, setImageError] = useState(false);
  const { toast } = useToast();

  const handleColorChange = (e) => {
    updatePreferences({ ...preferences, timeBlockColor: e.target.value });
  };

  const handleThemeChange = (e) => {
    updatePreferences({ ...preferences, theme: e.target.value });
  };

  const handleBlockDurationChange = (e) => {
    updatePreferences({ ...preferences, defaultBlockDuration: parseInt(e.target.value) });
  };

  const handleProfilePictureChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Basic validation for image file
    if (!file.type.startsWith('image/')) {
      setUploadError("Selected file is not an image. Please select an image file.");
      toast({
        title: "Error",
        description: "Please select a valid image file.",
        variant: "destructive"
      });
      return;
    }
    
    // Size validation (limit to 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("Image file is too large. Maximum size is 5MB.");
      toast({
        title: "Error",
        description: "Image file is too large. Maximum size is 5MB.",
        variant: "destructive"
      });
      return;
    }
    
    setUploading(true);
    setUploadError(null);
    
    try {
      // 1. Upload the file to S3 (now with automatic cleanup of old files)
      const pictureUrl = await uploadProfilePicture(file, user.attributes.sub);
      
      // Make sure we have a string URL
      const finalUrl = typeof pictureUrl === 'string' 
        ? pictureUrl 
        : pictureUrl.toString();
        
      console.log("Upload successful, got URL:", finalUrl);
      
      // 2. Update the database via API
      const token = await getAuthToken();
      const apiUrl = import.meta.env.VITE_APP_API_URL;
      // Convert HTTPS to HTTP for localhost
      const baseUrl = apiUrl.includes('localhost') ? apiUrl.replace('https://', 'http://') : apiUrl;
      
      const response = await fetch(`${baseUrl}/api/user/membership`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          picture: finalUrl
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to update profile picture in database');
      }
      
      const data = await response.json();
      console.log("Database updated:", data);
      
      // 3. Create an updated user object with the new picture URL
      const updatedUser = {
        ...user,
        attributes: {
          ...user.attributes,
          picture: finalUrl
        }
      };
      
      // Reset image error state since we have a new image
      setImageError(false);
      
      // 4. Call refreshUser to update parent components
      await refreshUser(updatedUser);
      
      toast({
        title: "Success",
        description: "Profile picture updated successfully!"
      });
    } catch (error) {
      console.error("Error updating profile picture:", error);
      setUploadError("Failed to update profile picture. Please try again.");
      toast({
        title: "Error",
        description: error.message || "Failed to update profile picture.",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto mt-8 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700">
      <CardHeader className="flex flex-row items-center justify-between border-b dark:border-gray-700">
        <h2 className="text-2xl font-bold">Settings</h2>
        <button 
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-200"
        >
          ✕
        </button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <h3 className="font-semibold">Profile Information</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Email: {user.attributes.email}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Name: {user.attributes.given_name || user.attributes.name}
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Profile Picture
            </label>
            
            {/* Show current profile picture with cleaned URL */}
            {user.attributes.picture && !imageError && (
              <div className="mt-2 mb-2">
                <img 
                  src={cleanS3Url(user.attributes.picture)} 
                  alt="Current profile picture" 
                  className="w-20 h-20 rounded-full object-cover"
                  onError={(e) => {
                    console.log("Failed to load profile image in settings");
                    setImageError(true);
                  }}
                />
              </div>
            )}
            
            <input 
              type="file" 
              accept="image/*"
              onChange={handleProfilePictureChange}
              disabled={uploading}
              className="mt-1 block w-full text-sm text-gray-900 bg-gray-50 rounded border border-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600"
            />
            {uploading && <p className="text-sm text-blue-600 dark:text-blue-400">Uploading...</p>}
            {uploadError && <p className="text-sm text-red-600 dark:text-red-400">{uploadError}</p>}
            <p className="text-xs text-gray-500 mt-1">Maximum file size: 5MB. Supported formats: JPG, PNG, GIF.</p>
          </div>
        </div>
        
        <div className="space-y-4">
          <h3 className="font-semibold">Preferences</h3>
          <div className="flex flex-col space-y-2">
            <label className="flex flex-col">
              Time Block Color:
              <input 
                type="color" 
                value={preferences.timeBlockColor} 
                onChange={handleColorChange}
                className={`mt-1 w-12 h-12 p-0 border-0 ${
                  preferences.theme === 'dark' ? 'bg-gray-700' : ''
                }`}
              />
            </label>
            <label className="flex flex-col">
              Theme:
              <select
                value={preferences.theme}
                onChange={handleThemeChange}
                className={`mt-1 rounded border px-2 py-1 outline-none ${
                  preferences.theme === 'dark'
                    ? 'bg-gray-700 text-white border-gray-600'
                    : 'bg-white text-gray-900 border-gray-300'
                }`}
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label className="flex flex-col">
              Default Time Block Size:
              <select
                value={preferences.defaultBlockDuration}
                onChange={handleBlockDurationChange}
                className={`mt-1 rounded border px-2 py-1 outline-none ${
                  preferences.theme === 'dark'
                    ? 'bg-gray-700 text-white border-gray-600'
                    : 'bg-white text-gray-900 border-gray-300'
                }`}
              >
                <option value={1}>30 mins</option>
                <option value={2}>1 hr</option>
                <option value={3}>1.5 hrs</option>
                <option value={4}>2 hrs</option>
              </select>
            </label>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default Settings;