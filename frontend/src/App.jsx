import React, { useState, useEffect } from 'react';
import { getCurrentAuthenticatedUser } from './lib/auth';
import Login from './components/login';
import LaundryScheduler from './components/LaundryScheduler';
import RoomSelection from './components/RoomSelection';
import Header from './components/Header';
import Settings from './components/Settings';
import { Toaster } from './components/ui/toaster';
import { useToast } from "./hooks/use-toast";

// Default preferences for the scheduler
const defaultPreferences = {
  defaultBlockDuration: 3, // 1.5 hours (3 x 30-minute slots)
  timeBlockColor: '#4CAF50',
  theme: 'light'
};

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [preferences, setPreferences] = useState(defaultPreferences);
  const { toast } = useToast();

  // Check auth state on component mount
  useEffect(() => {
    checkAuthState();
  }, []);

  // Toggle dark mode by adding/removing the "dark" class on the root element
  useEffect(() => {
    if (preferences.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [preferences.theme]);

  const checkAuthState = async () => {
    try {
      setLoading(true);
      const currentUser = await getCurrentAuthenticatedUser();
      
      if (currentUser) {
        console.log("Successfully authenticated user:", currentUser.username);
        setUser(currentUser);
      } else {
        // If authentication failed but we previously had a user, show a message
        if (user) {
          toast({
            title: "Session Expired",
            description: "Your session has expired. Please sign in again.",
            variant: "default"
          });
        }
        setUser(null);
      }
    } catch (error) {
      console.error('Error checking auth state:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const refreshUser = async (updatedUserData = null) => {
    try {
      // If an updated user object was provided (e.g. from Settings),
      // use it directly instead of fetching from Cognito
      if (updatedUserData) {
        console.log("Using provided user data:", updatedUserData);
        
        // Make sure the picture URL is included in the update
        if (updatedUserData.attributes && updatedUserData.attributes.picture) {
          console.log("Updated profile picture URL:", updatedUserData.attributes.picture);
        }
        
        setUser(updatedUserData);
        return;
      }
      
      // Otherwise get the current authenticated user from Cognito
      setLoading(true);
      const currentUser = await getCurrentAuthenticatedUser();
      
      if (currentUser) {
        setUser(currentUser);
      } else {
        toast({
          title: "Session Expired",
          description: "Your session has expired while refreshing user data.",
          variant: "destructive"
        });
        setUser(null);
      }
    } catch (error) {
      console.error('Error refreshing user:', error);
      toast({
        title: "Error",
        description: "Failed to refresh user information.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = () => {
    setUser(null);
    setSelectedRoom(null);
    setShowSettings(false);
  };

  const handleRoomSelect = (room) => {
    setSelectedRoom(room);
    setShowSettings(false);
  };

  const handleSwitchRoom = () => {
    setSelectedRoom(null);
    setShowSettings(false);
  };

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Loading...</p>
        </div>
        <Toaster />
      </div>
    );
  }

  if (!user) {
    return (
      <div>
        <Login onLogin={setUser} />
        <Toaster />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header 
        user={user} 
        onSignOut={handleSignOut} 
        onSwitchRoom={handleSwitchRoom}
        onShowSettings={() => setShowSettings(true)}
        showSettingsButton={selectedRoom !== null && !showSettings}
      />
      <main className="container mx-auto px-4 py-8">
        {showSettings ? (
          <Settings 
            user={user} 
            preferences={preferences}
            updatePreferences={setPreferences}
            onClose={() => setShowSettings(false)}
            refreshUser={refreshUser}
          />
        ) : selectedRoom ? (
          <LaundryScheduler 
            user={user} 
            roomId={selectedRoom.id}
            preferences={preferences}
          />
        ) : (
          <RoomSelection user={user} onRoomSelect={handleRoomSelect} />
        )}
      </main>
      <Toaster />
    </div>
  );
}

export default App;