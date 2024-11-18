import { useState, useEffect } from 'react';
import LaundryScheduler from './components/LaundryScheduler';
import Login from './components/login';
import { getCurrentUser, signOut } from './lib/auth';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/toaster';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    try {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
    } catch (err) {
      console.error('Unexpected error checking user:', err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      setUser(null);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  if (loading) {
    return (
      <>
        <div className="flex items-center justify-center min-h-screen">Loading...</div>
        <Toaster />
      </>
    );
  }

  if (!user) {
    return (
      <>
        <Login onLogin={checkUser} />
        <Toaster />
      </>
    );
  }

  return (
    <>
      <div className="h-12 bg-white shadow">
        <div className="h-full max-w-[1400px] mx-auto px-4 flex justify-between items-center">
          <h1 className="text-lg font-semibold">Laundry Scheduler</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm">{user.attributes?.given_name || user.attributes?.email}</span>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              Sign Out
            </Button>
          </div>
        </div>
      </div>
      <main className="h-[calc(100vh-3rem)]">
        <LaundryScheduler user={user} />
      </main>
      <Toaster />
    </>
  );
}

export default App;
