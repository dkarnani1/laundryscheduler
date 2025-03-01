import React, { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { getAuthToken } from '@/lib/auth'; // Ensure this function returns a valid JWT
import { cleanS3Url, getInitials } from '@/lib/utils';

const LaundryScheduler = ({ user, roomId, preferences }) => {
  const START_HOUR = 8; // 8 AM
  const END_HOUR = 28; // 3 AM next day (24 + 4 slots * 30 min each)
  const TIME_SLOTS = (END_HOUR - START_HOUR) * 2; // each hour divided into 30-min slots
  const BLOCK_HEIGHT = 30;
  const DAYS_IN_WEEK = 7;
  const DRYER_DELAY_SLOTS = 4; // 2 hours delay (4 x 30-minute slots)
  
  // For new bookings, use the user preference for block duration (in number of 30-min slots)
  const blockDuration = preferences.defaultBlockDuration || 3;
  
  const [bookings, setBookings] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const { toast } = useToast();

  const washerRef = useRef(null);
  const dryerRef = useRef(null);

  useEffect(() => {
    if (user?.attributes?.email && roomId) {
      fetchBookings();
    }
  }, [user, roomId]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // update every minute
    return () => clearInterval(timer);
  }, []);

  const getCurrentTimePosition = () => {
    const now = currentTime;
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const dayOfWeek = now.getDay();
    const currentSlot = ((hours - START_HOUR) * 2) + Math.floor(minutes / 30);
    const slotProgress = (minutes % 30) / 30;
    return {
      slot: currentSlot,
      progress: slotProgress,
      dayOfWeek,
      isToday: true
    };
  };

  const getWeekStart = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);
    return startOfWeek;
  };

  const convertSlotToTimestamp = (slot, dayOffset = 0) => {
    const weekStart = getWeekStart();
    weekStart.setDate(weekStart.getDate() + dayOffset);
    return weekStart.getTime() + ((slot * 30 + START_HOUR * 60) * 60 * 1000);
  };

  const getTimeString = (slot) => {
    const totalMinutes = (slot * 30) + (START_HOUR * 60);
    let hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours >= 24) {
      hours = hours - 24;
    }
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  const getDateString = (dayOffset) => {
    const date = new Date(getWeekStart());
    date.setDate(date.getDate() + dayOffset);
    return new Intl.DateTimeFormat('en-US', { 
      weekday: 'short', 
      month: 'numeric', 
      day: 'numeric' 
    }).format(date);
  };

  const isSlotAvailable = (machineType, slotTime) => {
    const slotDate = new Date(slotTime);
    const slotHour = slotDate.getHours();
    if (slotHour < START_HOUR && slotHour >= END_HOUR - 24) {
      return false;
    }
    return !bookings.some(booking => 
      booking.machine_type === machineType &&
      booking.start_time <= slotTime &&
      booking.end_time > slotTime
    );
  };

  const getBookingAtSlot = (machineType, slot, day) => {
    const slotTime = convertSlotToTimestamp(slot, day);
    return bookings.find(booking => 
      booking.machine_type === machineType &&
      booking.start_time <= slotTime &&
      booking.end_time > slotTime
    );
  };

  const fetchBookings = async () => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${import.meta.env.VITE_APP_API_URL}/api/bookings/${roomId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (!Array.isArray(data)) {
        console.error('Expected an array of bookings, got:', data);
      }
      setBookings(data);
    } catch (error) {
      console.error('Error loading bookings:', error);
      toast({
        title: "Error",
        description: "Failed to load bookings",
        variant: "destructive"
      });
    }
  };

  const createBooking = async (machineType, slot, day) => {
    const startTime = convertSlotToTimestamp(slot, day);
    // For new bookings, use the current default block duration from preferences
    const endTime = convertSlotToTimestamp(slot + blockDuration, day);
    try {
      const token = await getAuthToken();
      const response = await fetch(`${import.meta.env.VITE_APP_API_URL}/api/bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          roomId,
          userEmail: user.attributes.email,
          userName: user.attributes.given_name || user.attributes.name,
          machineType,
          startTime,
          endTime
        }),
      });
      const data = await response.json();
      if (response.status === 409) {
        toast({
          variant: "destructive",
          title: "Booking Failed",
          description: "This time slot is already booked."
        });
        return false;
      }
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create booking');
      }
      return true;
    } catch (error) {
      console.error('Booking error:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to add booking"
      });
      return false;
    }
  };

  const handleScroll = (event) => {
    const { scrollTop } = event.target;
    if (event.target.closest('.washer-container') && dryerRef.current) {
      dryerRef.current.scrollTop = scrollTop;
    } else if (event.target.closest('.dryer-container') && washerRef.current) {
      washerRef.current.scrollTop = scrollTop;
    }
  };

  const renderWeekGrid = (machineType) => {
    const grid = [];
    const currentTimeInfo = getCurrentTimePosition();

    // Header row
    const headerRow = [
      <div 
        key="time-header" 
        className="sticky left-0 top-0 bg-white dark:bg-gray-800 z-30 border-r dark:border-gray-700 p-1 font-semibold text-sm"
      >
        Time
      </div>
    ];
    for (let day = 0; day < DAYS_IN_WEEK; day++) {
      headerRow.push(
        <div 
          key={`header-${day}`} 
          className="p-1 font-semibold text-sm bg-white dark:bg-gray-800 border-b dark:border-gray-700"
        >
          {getDateString(day)}
        </div>
      );
    }
    grid.push(
      <div key="header" className="grid grid-cols-8 sticky top-0 bg-white dark:bg-gray-800 z-20 border-b dark:border-gray-700">
        {headerRow}
      </div>
    );

    // Time slot rows
    for (let slot = 0; slot < TIME_SLOTS; slot += 1) {
      const row = [
        <div 
          key={`time-${slot}`} 
          className="sticky left-0 bg-white dark:bg-gray-800 z-20 border-r dark:border-gray-700"
        >
          {slot % 2 === 0 && (
            <div className="text-xs text-gray-500 dark:text-gray-400 p-1">
              {getTimeString(slot)}
            </div>
          )}
        </div>
      ];
      for (let day = 0; day < DAYS_IN_WEEK; day++) {
        const currentTimestamp = convertSlotToTimestamp(slot, day);
        const booking = getBookingAtSlot(machineType, slot, day);
        const isStart = booking && currentTimestamp === booking.start_time;
        const isAvailable = isSlotAvailable(machineType, currentTimestamp);
        const isAutoDryerSlot = machineType === 'dryer' &&
          getBookingAtSlot('washer', slot - DRYER_DELAY_SLOTS, day);
        const showTimeIndicator = currentTimeInfo.isToday &&
          day === currentTimeInfo.dayOfWeek &&
          slot === currentTimeInfo.slot;
        
        row.push(
          <div
            key={`slot-${day}-${slot}`}
            className={`border-b dark:border-gray-700 border-r dark:border-gray-700 relative ${
              isAvailable ? 'hover:bg-gray-50 dark:hover:bg-gray-700' : ''
            }`}
            onClick={() => handleSlotClick(machineType, slot, day)}
            style={isAutoDryerSlot ? { backgroundColor: preferences.timeBlockColor } : {}}
          >
            {showTimeIndicator && (
              <div 
                className="absolute w-full h-0.5 bg-green-500 z-20"
                style={{
                  top: `${currentTimeInfo.progress * 100}%`,
                  boxShadow: '0 0 2px rgba(0,0,0,0.2)'
                }}
              />
            )}
            {isStart && booking && (() => {
              // Compute the booking's duration in 30-min slots so that existing
              // bookings display with their original duration
              const bookingDurationSlots = Math.round(
                (booking.end_time - booking.start_time) / (30 * 60 * 1000)
              );
              return (
                <div
                  className="absolute w-full rounded"
                  style={{
                    height: `${BLOCK_HEIGHT * bookingDurationSlots}px`,
                    zIndex: 10,
                    backgroundColor: preferences.timeBlockColor
                  }}
                >
                  <div className="flex justify-between p-1 text-sm">
                    <span className="truncate">{booking.user_name}</span>
                    {booking.user_email === user.attributes.email && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeBooking(booking.id, booking.user_email);
                        }}
                        className="h-5 w-5 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        );
      }
      grid.push(
        <div 
          key={`row-${slot}`} 
          className="grid grid-cols-8" 
          style={{ height: BLOCK_HEIGHT }}
        >
          {row}
        </div>
      );
    }
    return grid;
  };

  useEffect(() => {
    const scrollToCurrentTime = () => {
      const { slot } = getCurrentTimePosition();
      const scrollPosition = slot * BLOCK_HEIGHT;
      if (washerRef.current) {
        washerRef.current.scrollTop = scrollPosition - 200;
      }
      if (dryerRef.current) {
        dryerRef.current.scrollTop = scrollPosition - 200;
      }
    };
    scrollToCurrentTime();
  }, []);

  const handleSlotClick = async (machineType, slot, day) => {
    if (!user?.attributes?.email) {
      toast({
        title: "Error",
        description: "User information not loaded",
        variant: "destructive"
      });
      return;
    }
    const startTime = convertSlotToTimestamp(slot, day);
    const startHour = new Date(startTime).getHours();
    if (machineType === 'washer') {
      const dryerSlot = slot + DRYER_DELAY_SLOTS;
      const dryerStartTime = convertSlotToTimestamp(dryerSlot, day);
      const existingDryerBooking = bookings.find(b => 
        b.machine_type === 'dryer' &&
        b.user_email === user.attributes.email &&
        Math.abs(b.start_time - dryerStartTime) < 1000
      );
      if (!isSlotAvailable(machineType, startTime)) {
        toast({
          title: "Invalid Selection",
          description: "This washer time slot is not available",
          variant: "destructive"
        });
        return;
      }
      const dryerStartHour = new Date(dryerStartTime).getHours();
      if (dryerStartHour + (blockDuration / 2) > 3 && dryerStartHour < 8) {
        toast({
          title: "Invalid Selection",
          description: "Dryer booking would end after 3 AM",
          variant: "destructive"
        });
        return;
      }
      if (!existingDryerBooking && !isSlotAvailable('dryer', dryerStartTime)) {
        toast({
          title: "Invalid Selection",
          description: "The corresponding dryer time slot is not available",
          variant: "destructive"
        });
        return;
      }
      const washerSuccess = await createBooking('washer', slot, day);
      if (!washerSuccess) return;
      if (!existingDryerBooking) {
        const dryerSuccess = await createBooking('dryer', dryerSlot, day);
        if (!dryerSuccess) {
          toast({
            title: "Partial Booking",
            description: "Washer booked successfully, but dryer booking failed. Please book dryer manually.",
          });
        }
      }
      await fetchBookings();
      toast({
        title: "Success",
        description: existingDryerBooking
          ? "Washer booked and linked to existing dryer booking!"
          : "Washer and dryer booked successfully!",
      });
    } else if (machineType === 'dryer') {
      const washerSlot = slot - DRYER_DELAY_SLOTS;
      const washerStartTime = convertSlotToTimestamp(washerSlot, day);
      const existingWasherBooking = bookings.find(b => 
        b.machine_type === 'washer' &&
        b.user_email === user.attributes.email &&
        Math.abs(b.start_time - washerStartTime) < 1000
      );
      if (!isSlotAvailable(machineType, startTime)) {
        toast({
          title: "Invalid Selection",
          description: "This dryer time slot is not available",
          variant: "destructive"
        });
        return;
      }
      const endHour = new Date(startTime + (blockDuration * 30 * 60 * 1000)).getHours();
      if ((endHour > 3 && endHour < 8) || (startHour > 3 && startHour < 8)) {
        toast({
          title: "Invalid Selection",
          description: "Dryer booking must be between 8 AM and 3 AM",
          variant: "destructive"
        });
        return;
      }
      const dryerSuccess = await createBooking('dryer', slot, day);
      if (!dryerSuccess) return;
      await fetchBookings();
      toast({
        title: "Success",
        description: existingWasherBooking 
          ? "Dryer booked and linked to existing washer booking!"
          : "Dryer booked successfully!"
      });
    }
  };

  const removeBooking = async (bookingId, bookingUserEmail) => {
    if (bookingUserEmail !== user.attributes.email) {
      toast({
        title: "Unauthorized",
        description: "You can only remove your own bookings",
        variant: "destructive"
      });
      return;
    }
    try {
      const token = await getAuthToken();
      const bookingToDelete = bookings.find(b => b.id === bookingId);
      if (!bookingToDelete) {
        throw new Error('Booking not found');
      }
      let relatedBookingId = null;
      if (bookingToDelete.machine_type === 'dryer') {
        const washerStartTime = bookingToDelete.start_time - (DRYER_DELAY_SLOTS * 30 * 60 * 1000);
        const linkedWasher = bookings.find(b => 
          b.machine_type === 'washer' &&
          b.user_email === bookingUserEmail &&
          Math.abs(b.start_time - washerStartTime) < 1000
        );
        if (linkedWasher) {
          relatedBookingId = linkedWasher.id;
        }
      } else if (bookingToDelete.machine_type === 'washer') {
        const dryerStartTime = bookingToDelete.start_time + (DRYER_DELAY_SLOTS * 30 * 60 * 1000);
        const linkedDryer = bookings.find(b => 
          b.machine_type === 'dryer' &&
          b.user_email === bookingUserEmail &&
          Math.abs(b.start_time - dryerStartTime) < 1000
        );
        if (linkedDryer) {
          relatedBookingId = linkedDryer.id;
        }
      }
      const response = await fetch(`${import.meta.env.VITE_APP_API_URL}/api/bookings/${bookingId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) {
        throw new Error('Failed to delete booking');
      }
      if (relatedBookingId) {
        const relatedResponse = await fetch(`${import.meta.env.VITE_APP_API_URL}/api/bookings/${relatedBookingId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (!relatedResponse.ok) {
          toast({
            title: "Partial Delete",
            description: "Related booking could not be deleted",
            variant: "warning"
          });
        }
      }
      await fetchBookings();
      toast({
        title: "Success",
        description: relatedBookingId 
          ? "Washer and dryer bookings removed successfully"
          : "Booking removed successfully",
      });
    } catch (error) {
      console.error('Error removing booking:', error);
      toast({
        title: "Error",
        description: "Failed to remove booking",
        variant: "destructive"
      });
    }
  };

  const MemberAvatar = ({ member }) => {
    const [imgError, setImgError] = useState(false);
    
    if (member.picture && member.picture.trim() !== '' && !imgError) {
      return (
        <img
          src={cleanS3Url(member.picture)}
          alt={member.name || 'User'}
          className="w-8 h-8 rounded-full object-cover border-2 border-white dark:border-gray-800"
          onError={() => {
            console.log("Failed to load member image:", member.picture);
            setImgError(true);
          }}
        />
      );
    }
    
    // Use the getInitials function from utils.js
    const initials = getInitials(member.name, member.email);
    
    return (
      <div className="w-8 h-8 rounded-full bg-pink-400 text-white flex items-center justify-center border-2 border-white dark:border-gray-800 text-xs font-semibold">
        {initials}
      </div>
    );
  };

  return (
    <div className="h-[calc(100vh-5rem)] p-4 dark:bg-gray-900">
      <div className="h-full grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="h-full flex flex-col dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700">
          <CardHeader className="py-2 border-b dark:border-gray-700">
            <CardTitle>Washer Schedule</CardTitle>
          </CardHeader>
          <div 
            className="washer-container flex-1 p-2 overflow-auto dark:bg-gray-900" 
            ref={washerRef}
            onScroll={handleScroll}
          >
            <div className="relative min-w-[600px] h-full">
              {renderWeekGrid('washer')}
            </div>
          </div>
        </Card>
  
        <Card className="h-full flex flex-col dark:bg-gray-800 dark:text-gray-100 dark:border-gray-700">
          <CardHeader className="py-2 border-b dark:border-gray-700">
            <CardTitle>Dryer Schedule</CardTitle>
          </CardHeader>
          <div 
            className="dryer-container flex-1 p-2 overflow-auto dark:bg-gray-900"
            ref={dryerRef}
            onScroll={handleScroll}
          >
            <div className="relative min-w-[600px] h-full">
              {renderWeekGrid('dryer')}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default LaundryScheduler;
