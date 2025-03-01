import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from "@/hooks/use-toast";
import { getAuthToken } from '@/lib/auth';
import { cleanS3Url } from '@/lib/utils';

const RoomSelection = ({ user, onRoomSelect }) => {
  const [rooms, setRooms] = useState([]);
  const [newRoomName, setNewRoomName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const { toast } = useToast();

  // Convert API URL to HTTP if it's using HTTPS for localhost
  const getApiUrl = () => {
    const apiUrl = import.meta.env.VITE_APP_API_URL;
    // If it's a localhost URL with HTTPS, convert to HTTP
    if (apiUrl && apiUrl.startsWith('https://localhost')) {
      return apiUrl.replace('https://', 'http://');
    }
    return apiUrl;
  };

  useEffect(() => {
    if (user) {
      fetchRooms();
    }
  }, [user]);

  const fetchRooms = async () => {
    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      // Use the helper function to get the proper API URL
      const url = `${getApiUrl()}/api/rooms`;
      console.log('Fetching rooms from:', url);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch rooms');
      }

      const data = await response.json();
      setRooms(data);
    } catch (error) {
      console.error('Error fetching rooms:', error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleCreateRoom = async () => {
    if (!newRoomName.trim()) {
      toast({
        title: "Error",
        description: "Room name cannot be empty",
        variant: "destructive",
      });
      return;
    }

    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${getApiUrl()}/api/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          name: newRoomName
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create room');
      }

      const newRoom = await response.json();
      setRooms([...rooms, newRoom]);
      setNewRoomName('');
      toast({
        title: "Success",
        description: "Room created successfully!",
      });
      
      // Re-fetch rooms so the membership array (and new room) appear immediately in the list
      await fetchRooms();
      onRoomSelect(newRoom);
    } catch (error) {
      console.error('Error creating room:', error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleJoinRoom = async () => {
    if (!joinCode.trim()) {
      toast({
        title: "Error",
        description: "Join code cannot be empty",
        variant: "destructive",
      });
      return;
    }

    try {
      const token = await getAuthToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`${getApiUrl()}/api/rooms/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ code: joinCode }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to join room');
      }

      const room = await response.json();
      toast({
        title: "Success",
        description: "Joined room successfully!",
      });

      // Re-fetch rooms so the newly joined room (and its members) appear in the list
      await fetchRooms();
      onRoomSelect(room);
    } catch (error) {
      console.error('Error joining room:', error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Member Avatar component
  const MemberAvatar = ({ member }) => {
    const [imgError, setImgError] = useState(false);
    
    const getInitialsFromName = (name = '', email = '') => {
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
      
      // If no valid name, try to use email
      if (email && typeof email === 'string' && email.includes('@')) {
        const username = email.split('@')[0];
        if (username.length > 0) {
          if (username.length > 1) {
            return `${username[0]}${username[1]}`.toUpperCase();
          }
          return username[0].toUpperCase();
        }
      }
      
      return "ME";
    };
    
    // Check if this is the current user
    const isCurrentUser = member.email === user?.attributes?.sub || 
                          member.email === user?.attributes?.email ||
                          member.email === user?.username;
    
    // For the current user, use the name from user.attributes to ensure consistency
    const displayName = isCurrentUser ? 
                       (user?.attributes?.given_name || user?.attributes?.name || member.name) : 
                       member.name;

    if (member.picture && member.picture.trim() !== '' && !imgError) {
      return (
        <img
          src={cleanS3Url(member.picture)}
          alt={displayName || 'User'}
          className="w-8 h-8 rounded-full object-cover border-2 border-white dark:border-gray-800"
          onError={() => {
            console.log("Failed to load member image:", member.picture);
            setImgError(true);
          }}
        />
      );
    }
    
    return (
      <div className="w-8 h-8 rounded-full bg-pink-400 text-white flex items-center justify-center border-2 border-white dark:border-gray-800 text-xs font-semibold">
        {getInitialsFromName(displayName, member.email)}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      {/* Side-by-side cards for Create and Join */}
      <div className="flex flex-col md:flex-row gap-6">
        {/* Create Room */}
        <Card className="flex-1 transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Create a New Room</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="newRoomName" className="text-sm font-medium">
                Room Name
              </Label>
              <Input
                id="newRoomName"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                placeholder="e.g. My Laundry Room"
                className="text-sm"
              />
            </div>
            <Button
              onClick={handleCreateRoom}
              className="text-sm px-3 py-2 transition-transform duration-200 hover:scale-105"
            >
              Create Room
            </Button>
          </CardContent>
        </Card>

        {/* Join Room */}
        <Card className="flex-1 transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Join a Room</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="joinCode" className="text-sm font-medium">
                Room Code
              </Label>
              <Input
                id="joinCode"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="e.g. ABC123"
                className="text-sm"
              />
            </div>
            <Button
              onClick={handleJoinRoom}
              className="text-sm px-3 py-2 transition-transform duration-200 hover:scale-105"
            >
              Join Room
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Your Rooms */}
      <Card className="transition-transform duration-200 hover:-translate-y-1 hover:shadow-lg">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Your Rooms</CardTitle>
        </CardHeader>
        <CardContent>
          {rooms.length > 0 ? (
            <ul className="space-y-4">
              {rooms.map((room) => (
                <li key={room.id} className="border-b pb-4 last:border-b-0 last:pb-0 dark:border-gray-700">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    {/* Room Name & Select */}
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{room.name}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Code: {room.code}
                      </span>
                    </div>
                    <Button
                      onClick={() => onRoomSelect(room)}
                      className="text-sm px-3 py-2 transition-transform duration-200 hover:scale-105 md:ml-4"
                    >
                      Go
                    </Button>
                  </div>
                  {room.members && room.members.length > 0 && (
                    <div className="mt-2 flex items-center gap-1">
                      {room.members.map((member, index) => (
                        <div key={member.email || index} className="relative -ml-2 first:ml-0">
                          <MemberAvatar member={member} />
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm">You haven't created or joined any rooms yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default RoomSelection;