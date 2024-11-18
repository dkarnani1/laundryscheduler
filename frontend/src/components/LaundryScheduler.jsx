import React, { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";  // Change this import path

const LaundryScheduler = ({ user }) => {
  const START_HOUR = 8; // 8 AM
  const END_HOUR = 28; // 3 AM next day (24 + 3)
  const TIME_SLOTS = (END_HOUR - START_HOUR) * 2; // Each hour
  const BLOCK_HEIGHT = 30;
  const DAYS_IN_WEEK = 7;
  const BLOCK_DURATION = 3; // 1.5 hours (3 x 30-minute slots)
  const DRYER_DELAY_SLOTS = 4; // 2 hours delay (4 x 30-minute slots)
  
  const [bookings, setBookings] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const { toast } = useToast();

  const washerRef = useRef(null);
  const dryerRef = useRef(null);

  // Fetch user ID on component mount
  useEffect(() => {
    if (user?.attributes?.email) {
      fetchBookings();
    }
  }, [user]);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute
  
    return () => clearInterval(timer); // Cleanup on unmount
  }, []);
  
  const getCurrentTimePosition = () => {
    const now = currentTime;
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const dayOfWeek = now.getDay();
    
    // Convert current time to slot position
    const currentSlot = ((hours - START_HOUR) * 2) + Math.floor(minutes / 30);
    
    // Calculate position within the slot (0 to 1)
    const slotProgress = (minutes % 30) / 30;
    
    return {
      slot: currentSlot,
      progress: slotProgress,
      dayOfWeek,
      isToday: true
    };
  };

  const createBooking = async (machineType, slot, day) => {
    const startTime = convertSlotToTimestamp(slot, day);
    const endTime = convertSlotToTimestamp(slot + BLOCK_DURATION, day);
  
    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
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

  // Handle synchronized scrolling
  const handleScroll = (event) => {
    const { scrollTop } = event.target;
    if (event.target.closest('.washer-container') && dryerRef.current) {
      dryerRef.current.scrollTop = scrollTop;
    } else if (event.target.closest('.dryer-container') && washerRef.current) {
      washerRef.current.scrollTop = scrollTop;
    }
  };

  // Get the start of the current week
  const getWeekStart = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);
    return startOfWeek;
  };

  // Fetch bookings from the server
  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    try {
      const response = await fetch('/api/bookings');
      const data = await response.json();
      setBookings(data);  // The user_name field should now come correctly from the database
    } catch (error) {
      console.error('Error loading bookings:', error);
      toast({
        title: "Error",
        description: "Failed to load bookings",
        variant: "destructive"
      });
    }
  };

  const getTimeString = (slot) => {
    const totalMinutes = (slot * 30) + (START_HOUR * 60);
    let hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    // Handle next day times (after midnight)
    if (hours >= 24) {
      hours = hours - 24;
    }
    
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  const isSlotAvailable = (machineType, slotTime) => {
    const slotDate = new Date(slotTime);
    const slotHour = slotDate.getHours();
    
    // Skip availability check for times outside operational hours
    if (slotHour < START_HOUR && slotHour >= END_HOUR - 24) {
      return false;
    }
  
    return !bookings.some(booking => 
      booking.machine_type === machineType &&
      booking.start_time <= slotTime &&
      booking.end_time > slotTime
    );
  };

  const convertSlotToTimestamp = (slot, dayOffset = 0) => {
    const weekStart = getWeekStart();
    weekStart.setDate(weekStart.getDate() + dayOffset);
    return weekStart.getTime() + ((slot * 30 + START_HOUR * 60) * 60 * 1000);
  };

  // Get date string for column header
  const getDateString = (dayOffset) => {
    const date = new Date(getWeekStart());
    date.setDate(date.getDate() + dayOffset);
    return new Intl.DateTimeFormat('en-US', { 
      weekday: 'short', 
      month: 'numeric', 
      day: 'numeric' 
    }).format(date);
  };

  // Render time labels
  const renderTimeLabels = () => {
    const labels = [];
    for (let i = 0; i < TIME_SLOTS; i += 2) {
      labels.push(
        <div key={i} className="sticky left-0 bg-white z-20 border-r" style={{ height: BLOCK_HEIGHT }}>
          <div className="text-xs text-gray-500 px-2">
            {getTimeString(i)}
          </div>
        </div>
      );
    }
    return labels;
  };

  // Render grid for a specific machine type
  const renderWeekGrid = (machineType) => {
    const grid = [];
    const currentTimeInfo = getCurrentTimePosition();

    // Add header row
    const headerRow = [
      <div key="time-header" className="sticky left-0 top-0 bg-white z-30 border-r p-1 font-semibold text-sm">
        Time
      </div>
    ];
    
    for (let day = 0; day < DAYS_IN_WEEK; day++) {
      headerRow.push(
        <div key={`header-${day}`} className="p-1 font-semibold text-sm">
          {getDateString(day)}
        </div>
      );
    }
    
    grid.push(
      <div key="header" className="grid grid-cols-8 sticky top-0 bg-white z-20 border-b">
        {headerRow}
      </div>
    );

    // Add time slots
    for (let slot = 0; slot < TIME_SLOTS; slot += 1) {
      const row = [
        <div key={`time-${slot}`} className="sticky left-0 bg-white z-20 border-r">
          {slot % 2 === 0 && (
            <div className="text-xs text-gray-500 p-1">
              {getTimeString(slot)}
            </div>
          )}
        </div>
      ];

      for (let day = 0; day < DAYS_IN_WEEK; day++) {
        const currentTimestamp = convertSlotToTimestamp(slot, day);
        const booking = getBookingAtSlot(machineType, slot, day);
        // Check if this is exactly the start time of the booking
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
            className={`border-b border-r relative ${
              isAvailable ? 'hover:bg-gray-50' : ''
            } ${isAutoDryerSlot ? 'bg-blue-50' : ''}`}
            onClick={() => handleSlotClick(machineType, slot, day)}
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
            {isStart && booking && (
              <div
                className="absolute w-full bg-blue-200 rounded"
                style={{
                  height: `${BLOCK_HEIGHT * BLOCK_DURATION}px`,
                  zIndex: 10
                }}
              >
                <div className="flex justify-between p-1">
                  <span className="text-xs truncate">{booking.user_name}</span>
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
            )}
          </div>
        );
      }

      grid.push(
        <div key={`row-${slot}`} className="grid grid-cols-8" style={{ height: BLOCK_HEIGHT }}>
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
        washerRef.current.scrollTop = scrollPosition - 200; // Scroll to show a bit above current time
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
  
      // Check if dryer would end after 3 AM
      if (dryerStartHour + (BLOCK_DURATION / 2) > 3 && dryerStartHour < 8) {
        toast({
          title: "Invalid Selection",
          description: "Dryer booking would end after 3 AM",
          variant: "destructive"
        });
        return;
      }
  
      // If there's no existing dryer booking at the right time, create both
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
  
      // Only create dryer booking if one doesn't already exist
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
      // Check for existing washer booking 2 hours before this dryer slot
      const washerSlot = slot - DRYER_DELAY_SLOTS;
      const washerStartTime = convertSlotToTimestamp(washerSlot, day);
      const existingWasherBooking = bookings.find(b => 
        b.machine_type === 'washer' &&
        b.user_email === user.attributes.email && // Changed from user_id to user_email
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
  
      // Check if booking would end after 3 AM
      const endHour = new Date(startTime + (BLOCK_DURATION * 30 * 60 * 1000)).getHours();
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
    // Check if the booking belongs to the current user
    if (bookingUserEmail !== user.attributes.email) {
      toast({
        title: "Unauthorized",
        description: "You can only remove your own bookings",
        variant: "destructive"
      });
      return;
    }
  
    try {
      // First, get the booking details
      const bookingToDelete = bookings.find(b => b.id === bookingId);
      if (!bookingToDelete) {
        throw new Error('Booking not found');
      }
  
      let relatedBookingId = null;
  
      // If this is a dryer booking, check if there's a linked washer booking
      if (bookingToDelete.machine_type === 'dryer') {
        const washerStartTime = bookingToDelete.start_time - (DRYER_DELAY_SLOTS * 30 * 60 * 1000);
        const linkedWasher = bookings.find(b => 
          b.machine_type === 'washer' &&
          b.user_email === bookingUserEmail && // Update this to use email
          Math.abs(b.start_time - washerStartTime) < 1000
        );
        if (linkedWasher) {
          relatedBookingId = linkedWasher.id;
        }
      }
      // If this is a washer booking, check if there's a linked dryer booking
      else if (bookingToDelete.machine_type === 'washer') {
        const dryerStartTime = bookingToDelete.start_time + (DRYER_DELAY_SLOTS * 30 * 60 * 1000);
        const linkedDryer = bookings.find(b => 
          b.machine_type === 'dryer' &&
          b.user_email === bookingUserEmail && // Update this to use email
          Math.abs(b.start_time - dryerStartTime) < 1000
        );
        if (linkedDryer) {
          relatedBookingId = linkedDryer.id;
        }
      }
      // If this is a washer booking, check if there's a linked dryer booking
      else if (bookingToDelete.machine_type === 'washer') {
        const dryerStartTime = bookingToDelete.start_time + (DRYER_DELAY_SLOTS * 30 * 60 * 1000);
        const linkedDryer = bookings.find(b => 
          b.machine_type === 'dryer' &&
          b.user_id === bookingUserId &&
          Math.abs(b.start_time - dryerStartTime) < 1000 // Allow for small time differences
        );
        if (linkedDryer) {
          relatedBookingId = linkedDryer.id;
        }
      }
  
      // Delete the main booking
      const response = await fetch(`/api/bookings/${bookingId}`, {
        method: 'DELETE',
      });
  
      if (!response.ok) {
        throw new Error('Failed to delete booking');
      }
  
      // If there's a related booking, delete it too
      if (relatedBookingId) {
        const relatedResponse = await fetch(`/api/bookings/${relatedBookingId}`, {
          method: 'DELETE',
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

  const getBookingAtSlot = (machineType, slot, day) => {
    const slotTime = convertSlotToTimestamp(slot, day);
    return bookings.find(booking => 
      booking.machine_type === machineType &&
      booking.start_time <= slotTime &&
      booking.end_time > slotTime
    );
  };

  return (
    <div className="h-[calc(100vh-5rem)] p-4">
      <div className="h-full grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="h-full flex flex-col">
          <CardHeader className="py-2">
            <CardTitle>Washer Schedule</CardTitle>
          </CardHeader>
          <div className="washer-container flex-1 p-2 overflow-auto" 
               ref={washerRef}
               onScroll={handleScroll}>
            <div className="relative min-w-[600px] h-full">
              {renderWeekGrid('washer')}
            </div>
          </div>
        </Card>
  
        <Card className="h-full flex flex-col">
          <CardHeader className="py-2">
            <CardTitle>Dryer Schedule</CardTitle>
          </CardHeader>
          <div className="dryer-container flex-1 p-2 overflow-auto"
               ref={dryerRef}
               onScroll={handleScroll}>
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