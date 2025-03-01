import React from 'react';
import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/auth';
import { useToast } from "@/hooks/use-toast";
import ProfilePicture from './ProfilePicture';

const Header = ({ user, onSignOut, onSwitchRoom, onShowSettings, showSettingsButton }) => {
  const { toast } = useToast();

  const handleSignOut = async () => {
    try {
      await signOut();
      onSignOut();
      toast({
        title: "Signed Out",
        description: "You have been successfully signed out.",
      });
    } catch (error) {
      console.error('Error signing out:', error);
      toast({
        title: "Error",
        description: "Failed to sign out. Please try again.",
        variant: "destructive"
      });
    }
  };

  return (
    <header className="bg-white dark:bg-gray-800 shadow dark:shadow-none">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Laundry Scheduler
        </h1>
        <div className="flex items-center gap-4">
          {user && (
            <>
              <div className="flex items-center gap-3">
                <ProfilePicture user={user} />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {user.attributes?.given_name || user.attributes?.email}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={onSwitchRoom}>
                Switch Room
              </Button>
              {/* Always show the Settings button */}
              <Button variant="outline" size="sm" onClick={onShowSettings}>
                Settings
              </Button>
              <Button variant="outline" size="sm" onClick={handleSignOut}>
                Sign Out
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;